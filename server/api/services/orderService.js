// server/api/services/orderService.js
// All order-related Supabase operations with idempotency guarantees

import { supabase } from '../config/supabaseClient.js';
import { logger } from '../utils/logger.js';

const ORDER_LIST_LIMIT = 50;

/**
 * Fetch a product by ID. Returns null if not found.
 */
export async function getProductById(productId) {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, price, storage_path')
    .eq('id', productId)
    .single();

  if (error) {
    logger.error('db.product.fetch_failed', { productId, error: error.message });
    return null;
  }
  return data;
}

/**
 * Fetch multiple products by IDs — only active products.
 */
export async function getProductsByIds(productIds) {
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
}) {
  const productIds = (items || []).map((item) => item.productId);

  const { data, error } = await supabase
    .from('orders')
    .insert({
      merchant_order_id: merchantOrderId,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone,
      items,
      product_id: productIds,
      subtotal: amountPaise,
      total_amount: amountPaise,
      payment_state: 'PENDING',
      payment: {
        gateway: 'phonepe',
        merchantOrderId,
        transactionId: null,
        paymentUrl: null,
        status: 'PENDING',
        amount: amountPaise,
        currency: 'INR',
        paidAt: null,
        webhookVerified: false,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    logger.error('db.order.create_failed', { merchantOrderId, error: error.message });
    throw new Error('Failed to create order');
  }

  logger.info('db.order.created', { orderId: data.id, merchantOrderId });
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

/**
 * Idempotent, atomic order status update.
 *
 * - COMPLETED is a terminal state: no further transitions allowed.
 * - Uses an optimistic lock on payment_state to prevent double-processing
 *   when callback and webhook arrive simultaneously.
 * - Updates both payment_state column and payment JSONB for consistency.
 *
 * Returns { updated: boolean, order: object }
 */
export async function updateOrderPaymentState({
  merchantOrderId,
  paymentState,
  transactionId = null,
  paymentInstrument = null,
  phonePeResponse = null,
}) {
  const existing = await getOrderByMerchantOrderId(merchantOrderId);
  if (!existing) {
    logger.error('db.order.update_not_found', { merchantOrderId, paymentState });
    throw new Error(`Order not found: ${merchantOrderId}`);
  }

  const currentState = existing.payment_state;

  // COMPLETED is terminal — never downgrade
  if (currentState === 'COMPLETED') {
    logger.info('db.order.update_idempotent_skip', { merchantOrderId, currentState, requested: paymentState });
    return { updated: false, order: existing };
  }

  // Already in the target state — idempotent no-op
  if (currentState === paymentState) {
    logger.info('db.order.update_idempotent_skip', { merchantOrderId, paymentState });
    return { updated: false, order: existing };
  }

  const existingPayment = existing.payment || {};
  const paymentUpdate = {
    ...existingPayment,
    status: paymentState,
    transactionId: transactionId || existingPayment.transactionId,
    paymentInstrument: paymentInstrument || existingPayment.paymentInstrument,
    phonePeResponse: phonePeResponse || existingPayment.phonePeResponse,
    updatedAt: new Date().toISOString(),
    ...(paymentState === 'COMPLETED' ? { paidAt: new Date().toISOString(), webhookVerified: true } : {}),
  };

  // Atomic update: the WHERE on payment_state acts as an optimistic lock.
  // If a concurrent update already moved the row to COMPLETED, this returns
  // 0 rows (PGRST116) and we treat it as idempotent.
  const { data, error } = await supabase
    .from('orders')
    .update({
      payment_state: paymentState,
      payment: paymentUpdate,
      updated_at: new Date().toISOString(),
    })
    .eq('merchant_order_id', merchantOrderId)
    .eq('payment_state', currentState) // optimistic lock
    .select()
    .single();

  if (error) {
    // PGRST116 = no rows matched — concurrent update already won
    if (error.code === 'PGRST116') {
      logger.info('db.order.update_race_lost', { merchantOrderId, paymentState });
      const current = await getOrderByMerchantOrderId(merchantOrderId);
      return { updated: false, order: current };
    }
    logger.error('db.order.update_failed', { merchantOrderId, paymentState, error: error.message });
    throw new Error('Failed to update order payment state');
  }

  logger.info('db.order.updated', { merchantOrderId, paymentState, transactionId });
  return { updated: true, order: data };
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
    logger.error('db.payment_log.insert_failed', {
      merchantOrderId,
      eventType,
      error: error.message,
    });
  }
}

/**
 * Get all orders for a customer email — paginated, newest first.
 */
export async function getOrdersByEmail(email, page = 0) {
  const { data, error } = await supabase
    .from('orders')
    .select('id, merchant_order_id, items, total_amount, payment_state, created_at')
    .eq('customer_email', email)
    .order('created_at', { ascending: false })
    .range(page * ORDER_LIST_LIMIT, (page + 1) * ORDER_LIST_LIMIT - 1);

  if (error) {
    logger.error('db.orders.by_email_failed', { email, error: error.message });
    throw new Error('Failed to fetch orders');
  }
  return data || [];
}
