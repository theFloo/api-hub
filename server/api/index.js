// server/api/index.js
// Express app entry point — Vercel-compatible

import 'dotenv/config';
import express from 'express';
import { validateEnv, env } from './config/env.js';
import {
  securityHeaders,
  corsMiddleware,
  generalRateLimiter,
  requestId,
  requestLogger,
  globalErrorHandler,
  notFoundHandler,
} from './middleware/security.js';
import { logger } from './utils/logger.js';

import paymentRoutes from './routes/paymentRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import productRoutes from './routes/productRoutes.js';

// ── Validate environment at startup ─────────────────────────────────────────
validateEnv();

const app = express();

// ── Global Middleware ────────────────────────────────────────────────────────
app.set('trust proxy', 1); // Required for Vercel / reverse proxies
app.use(requestId);
app.use(requestLogger);
app.use(securityHeaders);
app.use(corsMiddleware);
app.use(generalRateLimiter);

// JSON body parser — NOTE: webhook route handles raw body separately
app.use((req, res, next) => {
  // Skip JSON parsing for the webhook endpoint (handled by captureRawBody)
  if (req.path === '/api/payments/webhook') return next();
  express.json({ limit: '100kb' })(req, res, next);
});

app.use((req, res, next) => {
  if (req.path === '/api/payments/webhook') return next();
  express.urlencoded({ extended: false, limit: '100kb' })(req, res, next);
});

// ── Health Check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// ── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/payments', paymentRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/products', productRoutes);

// ── Error Handling ───────────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(globalErrorHandler);

// ── Start Server (skipped in Vercel serverless context) ──────────────────────
if (process.env.NODE_ENV !== 'production' || process.env.VERCEL !== '1') {
  app.listen(env.app.port, () => {
    logger.info('server.started', { port: env.app.port, env: env.app.nodeEnv });
  });
}

// Required for Vercel: export the app as the default export
export default app;
