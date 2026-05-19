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

// PhonePe payment status polling (frontend)
router.get('/status/:merchantOrderId', getPaymentStatusController);

// PhonePe redirect callback (GET from PhonePe after user completes checkout)
router.get('/callback/:merchantOrderId', handleCallback);

// PhonePe server-to-server webhook — raw body needed for checksum
router.post('/webhook', captureRawBody, handleWebhook);

export default router;
