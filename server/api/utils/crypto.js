// server/api/utils/crypto.js
// Native crypto helpers — no external dependencies

import crypto from 'crypto';
import { env } from '../config/env.js';

/**
 * Generate a unique merchant order ID (max 38 chars for PhonePe).
 * Format: PP-<timestamp-base36>-<random-hex>
 */
export function generateMerchantOrderId() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `PP-${ts}-${rand}`;
}

/**
 * Generate a UUID v4 string.
 */
export function generateUUID() {
  return crypto.randomUUID();
}

/**
 * Verify PhonePe webhook X-VERIFY header.
 * Formula: SHA256(base64EncodedBody + '/v2/notifications' + saltKey) + '###' + saltIndex
 */
export function verifyWebhookChecksum(rawBody, xVerifyHeader) {
  const { saltKey, saltIndex } = env.phonepe;
  if (!saltKey) return false;

  try {
    const base64Body = Buffer.from(rawBody).toString('base64');
    const payload = base64Body + '/v2/notifications' + saltKey;
    const hash = crypto.createHash('sha256').update(payload).digest('hex');
    const expected = `${hash}###${saltIndex}`;

    const expectedBuf = Buffer.from(expected);
    const receivedBuf = Buffer.from(xVerifyHeader);
    if (expectedBuf.length !== receivedBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, receivedBuf);
  } catch {
    return false;
  }
}

/**
 * Verify PhonePe callback X-VERIFY header.
 * Formula: SHA256(base64EncodedBody + callbackPath + saltKey) + '###' + saltIndex
 */
export function verifyCallbackChecksum(base64Response, xVerifyHeader, callbackPath = '/checkout/v2/pay') {
  const { saltKey, saltIndex } = env.phonepe;
  if (!saltKey) return false;

  try {
    const payload = base64Response + callbackPath + saltKey;
    const hash = crypto.createHash('sha256').update(payload).digest('hex');
    const expected = `${hash}###${saltIndex}`;

    const expectedBuf = Buffer.from(expected);
    const receivedBuf = Buffer.from(xVerifyHeader);
    if (expectedBuf.length !== receivedBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, receivedBuf);
  } catch {
    return false;
  }
}

/**
 * Safely compare two strings in constant time.
 */
export function safeCompare(a, b) {
  try {
    const aBuf = Buffer.from(String(a));
    const bBuf = Buffer.from(String(b));
    if (aBuf.length !== bBuf.length) return false;
    return crypto.timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}
