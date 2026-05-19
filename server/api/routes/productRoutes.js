// server/api/routes/productRoutes.js

import { Router } from 'express';
import { listProducts, getProduct } from '../controllers/productController.js';

const router = Router();

router.get('/', listProducts);
router.get('/:productId', getProduct);

export default router;
