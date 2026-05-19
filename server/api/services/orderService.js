// server/api/services/orderService.js
// All order-related Supabase operations with idempotency guarantees

import { supabase } from '../config/supabaseClient.js';
import { logger } from '../utils/logger.js';

/**
 * Fetch a product by ID. Returns null if not found.
 */
export async function getProductById(productId) {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, price, storage_path')
    .eq('id', productId)
    .eq('is_active', true)
    .single();

  if (error) {
    logger.error('db.product.fetch_failed', { productId, error: error.message });
    return null;
  }
  return data;
}

/**
 * Fetch multiple products by IDs.
 */
export async function getProductsByIds(productIds) {
  console.log('Fetching products for IDs:', productIds);
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .in('id', productIds);

  if (error) {
    logger.error('db.products.fetch_failed', { productIds, error: error.message });
    throw new Error('Failed to fetch products');
  }
  return data || [];
}

/**
 * Create a pending order record.
 */
export async function createOrder({
  merchantOrderId,
  customerName,
  customerEmail,
  customerPhone,
  items,
  amountPaise,
  paymentUrl = null,
  transactionId = null,
  userId = null,
}) {

  // =========================================
  // NORMALIZE TOTALS
  // =========================================

  const totalAmount =
    Number(amountPaise) / 100;

  // =========================================
  // PRODUCT IDS
  // =========================================

  const productIds =
    items.map(item =>
      item.productId ||
      item.id ||
      item.product_id
    );

  // =========================================
  // ORDER INSERT
  // =========================================

  const { data, error } =
    await supabase
      .from("orders")
      .insert({

        merchant_order_id:
          merchantOrderId,

        customer_name:
          customerName,

        customer_email:
          customerEmail,

        customer_phone:
          customerPhone,

        items,

      

        total_amount:
          totalAmount,

        product_id:
          productIds,

        payment: {

          gateway:
            "phonepe",

          merchantOrderId:
            merchantOrderId,

          transactionId:
            transactionId,

          paymentUrl:
            paymentUrl,

          status:
            "pending",

          amount:
            totalAmount,

          currency:
            "INR",

          paidAt:
            null,

          webhookVerified:
            false

        },

        created_at:
          new Date().toISOString(),

        updated_at:
          new Date().toISOString(),

      })
      .select()
      .single();

  // =========================================
  // ERROR
  // =========================================

  if (error) {
console.log('Error creating order:', error);
    logger.error(
      "db.order.create_failed",
      {
        merchantOrderId,
        error: error.message,
      }
    );

    throw new Error(
      "Failed to create order"
    );
  }

  // =========================================
  // SUCCESS LOG
  // =========================================

  logger.info(
    "db.order.created",
    {
      orderId: data.id,
      merchantOrderId,
    }
  );

  return data;
}

/**
 * Fetch an order by merchantOrderId.
 */
export async function getOrderByMerchantOrderId(merchantOrderId) {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('merchant_order_id', merchantOrderId)
    .single();

  if (error) {
    logger.warn('db.order.not_found', { merchantOrderId, error: error.message });
    return null;
  }
  return data;
}

/**
 * Fetch an order by internal ID.
 */
export async function getOrderById(orderId) {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();

  if (error) {
    logger.warn('db.order.not_found_by_id', { orderId, error: error.message });
    return null;
  }
  return data;
}

export function calculateOrderTotal(
  products,
  items
) {

  let subtotal = 0;

  items.forEach(item => {

    const product =
      products.find(
        p => p.id === item.productId
      );

    if (!product) return;

    subtotal +=
      Number(product.price) *
      Number(item.quantity);
  });

  return {

    subtotal,

    totalAmount: subtotal

  };
}

/**
 * Idempotent order status update.
 * Only transitions from PENDING → COMPLETED or PENDING/COMPLETED → FAILED.
 * Returns true if updated, false if already in target state (idempotent).
 */
 export async function updateOrderPaymentState({

  merchantOrderId,

  paymentState,

  transactionId = null,

  paymentInstrument = null,

  phonePeResponse = null,

}) {

  // =========================================
  // GET EXISTING ORDER
  // =========================================

  const existing =
    await getOrderByMerchantOrderId(
      merchantOrderId
    );

  if (!existing) {

    logger.error(
      'db.order.update_not_found',
      {
        merchantOrderId,
        paymentState
      }
    );

    throw new Error(
      `Order not found: ${merchantOrderId}`
    );
  }

  // =========================================
  // EXISTING PAYMENT OBJECT
  // =========================================

  const existingPayment =
    existing.payment || {};

  // =========================================
  // IDEMPOTENCY
  // =========================================

  if (
    existingPayment.status ===
    paymentState
  ) {

    logger.info(
      'db.order.update_idempotent_skip',
      {
        merchantOrderId,
        paymentState
      }
    );

    return {
      updated: false,
      order: existing
    };
  }

  // =========================================
  // PREVENT INVALID STATE
  // =========================================

  if (

    existingPayment.status ===
      'COMPLETED'

    &&

    paymentState ===
      'PENDING'

  ) {

    logger.warn(
      'db.order.update_invalid_transition',
      {
        merchantOrderId,
        from:
          existingPayment.status,
        to:
          paymentState,
      }
    );

    return {
      updated: false,
      order: existing
    };
  }

  // =========================================
  // UPDATE PAYMENT JSON
  // =========================================

  const paymentUpdate = {

    ...existingPayment,

    status:
      paymentState,

    transactionId:
      transactionId ||

      existingPayment.transactionId,

    paymentInstrument:
      paymentInstrument ||

      existingPayment.paymentInstrument,

    phonePeResponse:
      phonePeResponse ||

      existingPayment.phonePeResponse,

    updatedAt:
      new Date().toISOString(),

  };

  // =========================================
  // UPDATE ORDER
  // =========================================

  const { data, error } =

    await supabase

      .from('orders')

      .update({

        payment:
          paymentUpdate,

        updated_at:
          new Date().toISOString()

      })

      .eq(
        'merchant_order_id',
        merchantOrderId
      )

      .select()

      .single();

  // =========================================
  // ERROR
  // =========================================

  if (error) {

    logger.error(
      'db.order.update_failed',
      {
        merchantOrderId,
        paymentState,
        error:
          error.message
      }
    );

    throw new Error(
      'Failed to update order payment state'
    );
  }

  // =========================================
  // SUCCESS
  // =========================================

  logger.info(
    'db.order.updated',
    {
      merchantOrderId,
      paymentState,
      transactionId
    }
  );

  return {
    updated: true,
    order: data
  };
}
/**
 * Log a payment event to the payment_logs table.
 */
export async function logPaymentEvent({ merchantOrderId, eventType, payload, source }) {
  const { error } = await supabase.from('payment_logs').insert({
    merchant_order_id: merchantOrderId,
    event_type: eventType,
    payload,
    source,
    created_at: new Date().toISOString(),
  });

  if (error) {
    // Non-critical — just log to console, don't throw
    logger.error('db.payment_log.insert_failed', {
      merchantOrderId,
      eventType,
      error: error.message,
    });
  }
}

/**
 * Get all orders for a customer email.
 */
export async function getOrdersByEmail(email) {
  const { data, error } = await supabase
    .from('orders')
    .select('id, merchant_order_id, items, amount_paise, payment_state, created_at')
    .eq('customer_email', email)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('db.orders.by_email_failed', { email, error: error.message });
    throw new Error('Failed to fetch orders');
  }
  return data || [];
}
