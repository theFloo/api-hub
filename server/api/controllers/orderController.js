// server/api/controllers/orderController.js
// Handles order retrieval and digital product delivery

import { successResponse, errorResponse } from '../utils/response.js';
import { getOrderById, getOrderByMerchantOrderId, getOrdersByEmail } from '../services/orderService.js';
import { generateDownloadLinks } from '../services/downloadService.js';
import { logger } from '../utils/logger.js';

/**
 * GET /api/orders/:orderId
 * Fetch a single order by internal UUID.
 * Requires customerEmail in query for ownership check.
 */
export async function getOrder(req, res) {
  const { orderId } = req.params;
  const { customerEmail } = req.query;

  if (!customerEmail) {
    return errorResponse(res, 'customerEmail query param is required', 400);
  }

  const order = await getOrderById(orderId);
  if (!order) {
    return errorResponse(res, 'Order not found', 404);
  }

  // Ownership check
  if (order.customer_email.toLowerCase() !== customerEmail.toLowerCase().trim()) {
    logger.warn('order.get.unauthorized', { orderId, customerEmail });
    return errorResponse(res, 'Unauthorized', 403);
  }

  return successResponse(res, {
    id: order.id,
    merchantOrderId: order.merchant_order_id,
    items: order.items,
    amountPaise: order.total_amount,
    paymentState: order.payment_state,
    transactionId: order.payment?.transactionId || null,
    createdAt: order.created_at,
  });
}

/**
 * GET /api/orders/merchant/:merchantOrderId
 * Fetch order by PhonePe merchantOrderId.
 */
export async function getOrderByMerchantId(req, res) {
  const { merchantOrderId } = req.params;
  const { customerEmail } = req.query;

  if (!customerEmail) {
    return errorResponse(res, 'customerEmail query param is required', 400);
  }

  const order = await getOrderByMerchantOrderId(merchantOrderId);
  if (!order) {
    return errorResponse(res, 'Order not found', 404);
  }

  if (order.customer_email.toLowerCase() !== customerEmail.toLowerCase().trim()) {
    return errorResponse(res, 'Unauthorized', 403);
  }

  return successResponse(res, {
    id: order.id,
    merchantOrderId: order.merchant_order_id,
    items: order.items,
    amountPaise: order.total_amount,
    paymentState: order.payment_state,
    transactionId: order.payment?.transactionId || null,
    createdAt: order.created_at,
  });
}

/**
 * GET /api/orders?email=customer@example.com
 * List all orders for a customer email.
 */
export async function listOrdersByEmail(req, res) {
  const { email } = req.query;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return errorResponse(res, 'A valid email query param is required', 400);
  }

  try {
    const orders = await getOrdersByEmail(email.toLowerCase().trim());
    return successResponse(res, { orders });
  } catch (err) {
    return errorResponse(res, 'Failed to fetch orders', 500);
  }
}

/**
 * POST /api/orders/:orderId/downloads
 * Generate signed download URLs for a paid order.
 * Body: { customerEmail }
 */
export async function getDownloadLinks(req, res) {
  const { orderId } = req.params;
  const { customerEmail } = req.body;
  if (!customerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
    return errorResponse(res, 'customerEmail is required and must be valid', 400);
  }

  try {
    const result = await generateDownloadLinks(orderId, customerEmail.toLowerCase().trim());
    logger.info('order.downloads.generated', { orderId, count: result.downloads.length });
    return successResponse(res, result);
  } catch (err) {
    const msg = err.message || 'Failed to generate download links';
    const status = msg === 'Unauthorized' ? 403 : msg === 'Order not found' ? 404 : msg === 'Payment not completed' ? 402 : 500;
    return errorResponse(res, msg, status);
  }
}
