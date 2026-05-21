// server/api/routes/paymentRoutes.js

import { Router } from 'express';
import {
  createPayment,
  handleCallback,
  handleWebhook,
  getPaymentStatusController,
} from '../controllers/paymentController.js';
import { paymentRateLimiter, captureRawBody } from '../middleware/security.js';

const router = Router();

// Create payment — strict rate limit
router.post('/create', paymentRateLimiter, createPayment);

// Payment status polling — rate limited to prevent enumeration
router.get('/status/:merchantOrderId', paymentRateLimiter, getPaymentStatusController);

// PhonePe redirect callback — rate limited to prevent API exhaustion
router.get('/callback/:merchantOrderId', paymentRateLimiter, handleCallback);

// PhonePe server-to-server webhook — raw body needed for checksum
router.post('/webhook', captureRawBody, handleWebhook);

export default router;
