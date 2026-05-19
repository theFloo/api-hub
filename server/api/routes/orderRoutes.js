// server/api/routes/orderRoutes.js

import { Router } from 'express';
import {
  getOrder,
  getOrderByMerchantId,
  listOrdersByEmail,
  getDownloadLinks,
} from '../controllers/orderController.js';

const router = Router();

// List orders by email
router.get('/', listOrdersByEmail);

// Get order by internal UUID
router.get('/:orderId', getOrder);

// Get order by PhonePe merchantOrderId
router.get('/merchant/:merchantOrderId', getOrderByMerchantId);

// Generate signed download links for a paid order
router.post('/:orderId/downloads', getDownloadLinks);

export default router;
