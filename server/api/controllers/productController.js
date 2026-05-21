// server/api/controllers/productController.js
// Handles public product listing and retrieval

import { supabase } from '../config/supabaseClient.js';
import { successResponse, errorResponse } from '../utils/response.js';
import { logger } from '../utils/logger.js';

/**
 * GET /api/products
 * List all active products.
 */
export async function listProducts(req, res) {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('is_active', true)
    .order('id');

  if (error) {
    logger.error('product.list_failed', { error: error.message });
    return errorResponse(res, 'Failed to fetch products', 500);
  }

  return successResponse(res, { products: data || [] });
}

/**
 * GET /api/products/:productId
 * Fetch a single active product.
 */
export async function getProduct(req, res) {
  const { productId } = req.params;

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    return errorResponse(res, 'Product not found', 404);
  }

  return successResponse(res, { product: data });
}
