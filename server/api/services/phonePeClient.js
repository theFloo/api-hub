// server/api/services/phonePeClient.js
// Axios wrapper for PhonePe PG Checkout V2 API with automatic token retry

import axios from 'axios';
import { env } from '../config/env.js';
import { getAccessToken, invalidateToken } from './tokenService.js';
import { logger } from '../utils/logger.js';

/**
 * Make an authenticated PhonePe API request.
 * Retries once on 401 by refreshing the access token.
 */
async function phonePeRequest(method, path, data = null, attempt = 1) {
  const token = await getAccessToken();
console.log('Using access token:', token);
  const config = {
    method,
    url: `${env.phonepe.baseUrl}${path}`,
    headers: {
      Authorization: `O-Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    timeout: 15_000,
  };

  if (data) config.data = data;

  try {
    const response = await axios(config);
    console.log(`PhonePe API response for ${method}${path}:`, response.data);
    return response.data;
  } catch (err) {
    const status = err.response?.status;
    const responseData = err.response?.data;

    // On 401: invalidate token and retry once
    if (status === 401 && attempt === 1) {
      logger.warn('phonepe.client.token_expired_retry', { path });
      invalidateToken();
      return phonePeRequest(method, path, data, 2);
    }

    logger.error('phonepe.client.request_failed', {
      method,
      path,
      status,
      responseData,
      attempt,
    });

    const errorMessage = responseData?.message || responseData?.error || 'PhonePe API request failed';
    const error = new Error(errorMessage);
    error.status = status;
    error.phonePeResponse = responseData;
    throw error;
  }
}

/**
 * Initiate a payment via PhonePe Checkout V2.
 * POST /checkout/v2/pay
 */
export async function createPhonePePayment({
  merchantOrderId,
  amount, // in paise
  redirectUrl,
  metaInfo = {},
}) {
  const payload = {
    merchantOrderId,
    amount,
    expireAfter: 1200, // 20 minutes
    metaInfo: {
      udf1: metaInfo.udf1 || '',
      udf2: metaInfo.udf2 || '',
      udf3: metaInfo.udf3 || '',
      udf4: metaInfo.udf4 || '',
      udf5: metaInfo.udf5 || '',
    },
    paymentFlow: {

      type: "PG_CHECKOUT",

      message:
        "Payment for FlooHub Order",

      merchantUrls: {

        redirectUrl

      }
    }
  };

  console.log(
    "PHONEPE PAYLOAD:",
    JSON.stringify(payload, null, 2)
  );

  logger.info(
    "phonepe.payment.create",
    {
      merchantOrderId,
      amount
    }
  );

  return phonePeRequest(
    "POST",
    "/checkout/v2/pay",
    payload
  );
}

/**
 * Fetch payment status by merchantOrderId.
 * GET /checkout/v2/order/{merchantOrderId}/status
 */
export async function getPaymentStatus(merchantOrderId) {
  logger.info('phonepe.payment.status_check', { merchantOrderId });
  return phonePeRequest('GET', `/checkout/v2/order/${merchantOrderId}/status`);
}
