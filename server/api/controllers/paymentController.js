// server/api/controllers/paymentController.js
// Handles all PhonePe payment lifecycle endpoints

import { generateMerchantOrderId } from '../utils/crypto.js';
import { verifyWebhookChecksum } from '../utils/crypto.js';
import { successResponse, errorResponse, redirectWithSuccess, redirectWithError } from '../utils/response.js';
import { validateCreatePayment, sanitizeString } from '../validators/paymentValidator.js';
import { createPhonePePayment, getPaymentStatus } from '../services/phonePeClient.js';
import {
  getProductsByIds,
  createOrder,
  getOrderByMerchantOrderId,
  updateOrderPaymentState,
  logPaymentEvent,
} from '../services/orderService.js';
import { sendPaymentConfirmationEmail } from '../services/emailService.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

// ---------------------------------------------------------------------------
// POST /api/payments/create
// ---------------------------------------------------------------------------
export async function createPayment(req, res) {
  const { customerName, customerEmail, customerPhone, items } = req.body;

  // 1. Validate input
  const { valid, errors } = validateCreatePayment(req.body);
  if (!valid) {
    return errorResponse(res, 'Validation failed', 400, errors);
  }

  // 2. Sanitize string inputs before persistence
  const safeName = sanitizeString(customerName, 100);
  const safeEmail = customerEmail.toLowerCase().trim();
  const safePhone = sanitizeString(customerPhone, 15);

  // 3. Fetch products from DB — never trust client prices
  const productIds = items.map((i) => i.productId);
  let products;
  try {
    products = await getProductsByIds(productIds);
  } catch (err) {
    return errorResponse(res, 'Failed to load products', 500);
  }

  if (products.length !== productIds.length) {
    return errorResponse(res, 'One or more products are unavailable', 400);
  }

  // 4. Recalculate total server-side (prevent amount tampering)
  const productMap = Object.fromEntries(products.map((p) => [p.id, p]));
  let totalPaise = 0;
  const resolvedItems = [];

  for (const item of items) {
    const product = productMap[item.productId];
    if (!product) return errorResponse(res, `Product not found: ${item.productId}`, 400);
    const qty = parseInt(item.quantity, 10) || 1;
    const linePaise = Math.round(product.price * 100) * qty;
    totalPaise += linePaise;
    resolvedItems.push({
      productId: product.id,
      name: product.name,
      quantity: qty,
      unitPricePaise: Math.round(product.price * 100),
      linePaise,
    });
  }

  if (totalPaise < 100) {
    return errorResponse(res, 'Order amount too low', 400);
  }

  // 5. Generate unique merchant order ID
  const merchantOrderId = generateMerchantOrderId();

  // 6. Persist pending order
  let order;
  try {
    order = await createOrder({
      merchantOrderId,
      customerName: safeName,
      customerEmail: safeEmail,
      customerPhone: safePhone,
      items: resolvedItems,
      amountPaise: totalPaise,
    });
  } catch (err) {
    return errorResponse(res, 'Failed to create order', 500);
  }

  // 7. Build callback URL
  const redirectUrl = `${env.app.backendUrl}/api/payments/callback/${merchantOrderId}`;

  // 8. Create PhonePe payment
  let phonePeResponse;
  try {
    phonePeResponse = await createPhonePePayment({
      merchantOrderId,
      amount: totalPaise,
      redirectUrl,
      metaInfo: {
        udf1: order.id,
        udf2: safeEmail,
      },
    });
  } catch (err) {
    logger.error('payment.create.phonepe_failed', {
      merchantOrderId,
      error: err.message,
    });
    return errorResponse(res, 'Payment gateway error. Please try again.', 502);
  }

  logger.info('payment.initiated', { merchantOrderId, amountPaise: totalPaise, orderId: order.id });

  // 9. Return redirect URL to frontend
  const checkoutUrl =
    phonePeResponse?.redirectUrl ||
    phonePeResponse?.data?.redirectUrl ||
    phonePeResponse?.instrumentResponse?.redirectInfo?.url;

  if (!checkoutUrl) {
    logger.error('payment.create.no_redirect_url', { merchantOrderId });
    return errorResponse(res, 'Invalid payment gateway response', 502);
  }

  return successResponse(res, {
    merchantOrderId,
    orderId: order.id,
    checkoutUrl,
    amount: totalPaise,
  }, 201);
}

// ---------------------------------------------------------------------------
// GET /api/payments/callback/:merchantOrderId
// Called by PhonePe after the user completes/cancels payment (browser redirect).
// The callback is not signed for GET redirects — always re-verify via status API.
// ---------------------------------------------------------------------------
export async function handleCallback(req, res) {
  const { merchantOrderId } = req.params;

  logger.info('payment.callback.received', { merchantOrderId, requestId: req.requestId });

  try {
    await logPaymentEvent({
      merchantOrderId,
      eventType: 'CALLBACK_RECEIVED',
      payload: { query: req.query },
      source: 'PHONEPE_CALLBACK',
    });
  } catch { /* non-critical */ }

  // 1. Fetch order — never trust frontend state
  let order;
  try {
    order = await getOrderByMerchantOrderId(merchantOrderId);
  } catch (err) {
    logger.error('payment.callback.db_error', { merchantOrderId, error: err.message });
    return redirectWithError(res, env.app.frontendUrl, 'server_error');
  }

  if (!order) {
    logger.error('payment.callback.order_not_found', { merchantOrderId });
    return redirectWithError(res, env.app.frontendUrl, 'order_not_found');
  }

  // 2. Already completed — idempotent redirect
  if (order.payment_state === 'COMPLETED') {
    logger.info('payment.callback.already_completed', { merchantOrderId });
    return redirectWithSuccess(res, env.app.frontendUrl, order.id);
  }

  // 3. Verify payment status via PhonePe API (source of truth)
  let statusResponse;
  try {
    statusResponse = await getPaymentStatus(merchantOrderId);
  } catch (err) {
    logger.error('payment.callback.status_check_failed', { merchantOrderId, error: err.message });
    return redirectWithError(res, env.app.frontendUrl, 'verification_failed');
  }

  logger.info('payment.callback.status_response', { merchantOrderId, state: statusResponse?.state });

  try {
    await logPaymentEvent({
      merchantOrderId,
      eventType: 'STATUS_VERIFIED',
      payload: { state: statusResponse?.state },
      source: 'PHONEPE_STATUS_API',
    });
  } catch { /* non-critical */ }

  const paymentState = statusResponse?.state;

  if (paymentState === 'COMPLETED') {
    const transactionId = statusResponse?.transactionId || statusResponse?.data?.transactionId;
    const paymentInstrument = statusResponse?.paymentDetails?.[0] || null;

    try {
      const { updated } = await updateOrderPaymentState({
        merchantOrderId,
        paymentState: 'COMPLETED',
        transactionId,
        paymentInstrument,
        phonePeResponse: statusResponse,
      });

      if (updated) {
        logger.info('payment.callback.completed', { merchantOrderId, transactionId });
        sendPaymentConfirmationEmail({
          customerName: order.customer_name,
          customerEmail: order.customer_email,
          orderId: order.id,
          items: order.items,
          amountPaise: order.amount_paise,
        });
      }
    } catch (err) {
      logger.error('payment.callback.db_update_failed', { merchantOrderId, error: err.message });
      return redirectWithError(res, env.app.frontendUrl, 'db_update_failed');
    }

    return redirectWithSuccess(res, env.app.frontendUrl, order.id);

  } else if (paymentState === 'FAILED') {
    await updateOrderPaymentState({
      merchantOrderId,
      paymentState: 'FAILED',
      phonePeResponse: statusResponse,
    }).catch(() => {});

    logger.warn('payment.callback.failed', { merchantOrderId });
    return redirectWithError(res, env.app.frontendUrl, 'payment_failed');

  } else {
    logger.warn('payment.callback.pending_or_unknown', { merchantOrderId, paymentState });
    return redirectWithError(res, env.app.frontendUrl, 'payment_pending');
  }
}

// ---------------------------------------------------------------------------
// POST /api/payments/webhook
// PhonePe server-to-server notification
// ---------------------------------------------------------------------------
export async function handleWebhook(req, res) {
  const xVerify = req.headers['x-verify'];
  const rawBody = req.rawBody;

  logger.info('payment.webhook.received', { xVerify: xVerify?.slice(0, 20) });

  // 1. Verify checksum
  if (!xVerify || !rawBody) {
    logger.warn('payment.webhook.missing_headers');
    return res.status(400).json({ success: false, error: 'Missing X-VERIFY or body' });
  }

  const isValid = verifyWebhookChecksum(rawBody, xVerify);
  if (!isValid) {
    logger.warn('payment.webhook.invalid_checksum');
    return res.status(401).json({ success: false, error: 'Invalid checksum' });
  }

  // 2. Parse webhook body
  let webhookData;
  try {
    webhookData = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ success: false, error: 'Invalid JSON' });
  }

  const { merchantOrderId, transactionId } = webhookData;

  if (!merchantOrderId) {
    return res.status(400).json({ success: false, error: 'Missing merchantOrderId' });
  }

  try {
    await logPaymentEvent({
      merchantOrderId,
      eventType: 'WEBHOOK_RECEIVED',
      payload: { state: webhookData.state },
      source: 'PHONEPE_WEBHOOK',
    });
  } catch { /* non-critical */ }

  // 3. Verify payment state via status API (double verification)
  let statusResponse;
  try {
    statusResponse = await getPaymentStatus(merchantOrderId);
  } catch (err) {
    logger.error('payment.webhook.status_check_failed', { merchantOrderId, error: err.message });
    // Return 200 to stop PhonePe retries for non-recoverable errors
    return res.status(200).json({ success: true, message: 'Acknowledged' });
  }

  const verifiedState = statusResponse?.state;

  // 4. Only process COMPLETED or FAILED states
  if (verifiedState === 'COMPLETED') {
    const order = await getOrderByMerchantOrderId(merchantOrderId);
    if (!order) {
      logger.error('payment.webhook.order_not_found', { merchantOrderId });
      return res.status(200).json({ success: true });
    }

    try {
      const { updated } = await updateOrderPaymentState({
        merchantOrderId,
        paymentState: 'COMPLETED',
        transactionId: statusResponse?.transactionId || transactionId,
        paymentInstrument: statusResponse?.paymentDetails?.[0] || null,
        phonePeResponse: statusResponse,
      });

      if (updated) {
        logger.info('payment.webhook.completed', { merchantOrderId });
        sendPaymentConfirmationEmail({
          customerName: order.customer_name,
          customerEmail: order.customer_email,
          orderId: order.id,
          items: order.items,
          amountPaise: order.amount_paise,
        });
      } else {
        logger.info('payment.webhook.idempotent_skip', { merchantOrderId });
      }
    } catch (err) {
      logger.error('payment.webhook.db_failed', { merchantOrderId, error: err.message });
      // Return 500 so PhonePe retries — DB failures are recoverable
      return res.status(500).json({ success: false, error: 'DB update failed' });
    }

  } else if (verifiedState === 'FAILED') {
    await updateOrderPaymentState({
      merchantOrderId,
      paymentState: 'FAILED',
      phonePeResponse: statusResponse,
    }).catch(() => {});

    logger.warn('payment.webhook.failed_state', { merchantOrderId });
  } else {
    logger.info('payment.webhook.ignored_state', { merchantOrderId, verifiedState });
  }

  return res.status(200).json({ success: true });
}

// ---------------------------------------------------------------------------
// GET /api/payments/status/:merchantOrderId
// Frontend polling endpoint
// ---------------------------------------------------------------------------
export async function getPaymentStatusController(req, res) {
  const { merchantOrderId } = req.params;

  try {
    const order = await getOrderByMerchantOrderId(merchantOrderId);
    if (!order) {
      return errorResponse(res, 'Order not found', 404);
    }

    return successResponse(res, {
      merchantOrderId,
      orderId: order.id,
      paymentState: order.payment_state,
      amount: order.amount_paise,
      transactionId: order.transaction_id || null,
      createdAt: order.created_at,
      updatedAt: order.updated_at,
    });
  } catch (err) {
    logger.error('payment.status.db_error', { merchantOrderId, error: err.message });
    return errorResponse(res, 'Failed to fetch order status', 503);
  }
}
