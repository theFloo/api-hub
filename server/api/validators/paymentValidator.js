// server/api/validators/paymentValidator.js
// Input validation for payment endpoints

/**
 * Validate POST /api/payments/create body.
 * Returns { valid: boolean, errors: string[] }
 */
export function validateCreatePayment(body) {
  const errors = [];

  if (!body || typeof body !== 'object') {
    return { valid: false, errors: ['Invalid request body'] };
  }

  const { customerName, customerEmail, customerPhone, items } = body;

  if (!customerName || typeof customerName !== 'string' || customerName.trim().length < 2) {
    errors.push('customerName must be at least 2 characters');
  }

  if (!customerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
    errors.push('customerEmail must be a valid email address');
  }

  if (!customerPhone || !/^[6-9]\d{9}$/.test(String(customerPhone).replace(/\D/g, ''))) {
    errors.push('customerPhone must be a valid 10-digit Indian mobile number');
  }

  if (!Array.isArray(items) || items.length === 0) {
    errors.push('items must be a non-empty array');
  } else {
    items.forEach((item, index) => {
      if (!item.productId || typeof item.productId !== 'string') {
        errors.push(`items[${index}].productId is required and must be a string`);
      }
      const qty = parseInt(item.quantity, 10);
      if (!qty || qty < 1 || qty > 10) {
        errors.push(`items[${index}].quantity must be a number between 1 and 10`);
      }
    });
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate GET /api/orders/:orderId/downloads request.
 */
export function validateDownloadRequest(body) {
  const errors = [];

  if (!body?.customerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.customerEmail)) {
    errors.push('customerEmail is required and must be valid');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Sanitize a string: trim and strip dangerous characters.
 */
export function sanitizeString(str, maxLength = 255) {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, maxLength).replace(/[<>"'`]/g, '');
}
