// server/api/services/downloadService.js
// Generates signed Supabase Storage URLs for paid digital products

import { supabase } from '../config/supabaseClient.js';
import { logger } from '../utils/logger.js';

const SIGNED_URL_EXPIRY_SECONDS = 60; // 60-second expiring download links
const STORAGE_BUCKET = 'products'; // your Supabase storage bucket name

/**
 * Generate signed download URLs for all items in a COMPLETED order.
 * Verifies the order is COMPLETED and the email matches.
 *
 * @param {string} orderId - Internal order UUID
 * @param {string} customerEmail - Must match order's customer_email
 * @returns {{ downloads: Array<{ productId, name, url }> }}
 */
export async function generateDownloadLinks(orderId, customerEmail) {
  // 1. Fetch the order and verify it's paid
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, customer_email, payment, items')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    logger.warn('download.order_not_found', { orderId });
    throw new Error('Order not found');
  }

  if (order.customer_email.toLowerCase() !== customerEmail.toLowerCase()) {
    logger.warn('download.email_mismatch', { orderId });
    throw new Error('Unauthorized');
  }

  if (order.payment.status !== 'COMPLETED') {
    logger.warn('download.order_not_paid', { orderId, state: order.payment_state });
    throw new Error('Payment not completed');
  }

  // 2. Fetch product storage paths
  const productIds = (order.items || []).map((i) => i.productId);
  if (!productIds.length) {
    throw new Error('No products in order');
  }

  const { data: products, error: prodError } = await supabase
    .from('products')
    .select('id, name, storage_path,file_name,image')
    .in('id', productIds);
  if (prodError) {
    logger.error('download.products_fetch_failed', { orderId, error: prodError.message });
    throw new Error('Failed to fetch products');
  }
  // 3. Generate signed URLs for each product
  const downloads = await Promise.all(
    products.map(async (product) => {
      if (!product.storage_path) {
        logger.warn('download.no_storage_path', { productId: product.id });
        return null;
      }

      // const bucket = product.storage_path || "products";
      // const expiresIn = 60;

      // // 5️⃣ Create signed URL (IMPORTANT: filename only)
      // const { data: signedData, error: signError } = await supabase.storage
      //   .from(bucket)
      //   .createSignedUrl(product.file_name, expiresIn);

      const filePath = `${product.storage_path}/${product.file_name}`;
      const { data: signedData, error: signError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(filePath, SIGNED_URL_EXPIRY_SECONDS);

      if (signError || !signedData?.signedUrl) {
        logger.error('download.signed_url_failed', {
          productId: product.id,
          error: signError?.message,
        });
        return null;
      }

      logger.info('download.signed_url_generated', {
        orderId,
        productId: product.id,
        expiresIn: SIGNED_URL_EXPIRY_SECONDS,
      });

      return {
        productId: product.id,
        name: product.name,
        image:product.image,
        url: signedData.signedUrl,
        expiresIn: SIGNED_URL_EXPIRY_SECONDS,
      };
    })
  );

  const validDownloads = downloads.filter(Boolean);

  if (!validDownloads.length) {
    throw new Error('No download links could be generated');
  }

  return { downloads: validDownloads };
}
