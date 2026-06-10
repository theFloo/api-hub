// server/api/routes/orderRoutes.js

import { Router } from 'express';
import {
  getOrder,
  getOrderByMerchantId,
  listOrdersByEmail,
  getDownloadLinks,
  testEmailSend,
} from '../controllers/orderController.js';

const router = Router();

// List orders by email
router.get('/', listOrdersByEmail);

// Test email endpoint (development only)
router.post('/test/send-email', testEmailSend);

// Specific named routes MUST come before parameter routes
router.get('/merchant/:merchantOrderId', getOrderByMerchantId);

// Get order by internal UUID
router.get('/:orderId', getOrder);

// Generate signed download links for a paid order
router.post('/:orderId/downloads', getDownloadLinks);

export default router;
