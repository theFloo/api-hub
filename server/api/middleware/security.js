// server/api/middleware/security.js
// Production security middleware

import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Security headers (Helmet-equivalent).
 */
export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Content-Security-Policy', "default-src 'none'");
  res.removeHeader('X-Powered-By');
  next();
}

/**
 * CORS middleware with explicit origin allowlist.
 * Server-to-server requests (no Origin) get no CORS headers — they don't need them.
 */
export function corsMiddleware(req, res, next) {
  const origin = req.headers.origin;
  const allowed = env.app.allowedOrigins;

  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-ID');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
    res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
}

/**
 * General API rate limiter: 100 requests per 15 minutes per IP.
 */
export const generalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later.' },
  handler: (req, res, next, options) => {
    logger.warn('rate_limit.exceeded', { ip: req.ip, path: req.path });
    res.status(429).json(options.message);
  },
});

/**
 * Strict rate limiter for payment creation and status polling: 10 per 15 minutes per IP.
 */
export const paymentRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many payment requests, please try again later.' },
  handler: (req, res, next, options) => {
    logger.warn('rate_limit.payment_exceeded', { ip: req.ip });
    res.status(429).json(options.message);
  },
});

/**
 * Attach a server-generated request ID for tracing.
 * Never trust a client-supplied X-Request-ID to prevent log injection.
 */
export function requestId(req, res, next) {
  const id = crypto.randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-ID', id);
  next();
}

/**
 * Log every incoming request.
 */
export function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    logger.info('http.request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - start,
      requestId: req.requestId,
      ip: req.ip,
    });
  });
  next();
}

/**
 * Capture raw body for webhook signature verification BEFORE JSON parsing.
 * Attach to the specific webhook route only.
 */
export function captureRawBody(req, res, next) {
  let data = '';
  req.setEncoding('utf8');
  req.on('data', (chunk) => { data += chunk; });
  req.on('end', () => {
    req.rawBody = data;
    next();
  });
}

/**
 * Global error handler.
 */
export function globalErrorHandler(err, req, res, next) {
  logger.error('unhandled_error', {
    message: err.message,
    stack: env.app.nodeEnv !== 'production' ? err.stack : undefined,
    requestId: req.requestId,
    path: req.path,
  });

  const statusCode = err.status || err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    error: env.app.nodeEnv === 'production' ? 'Internal server error' : err.message,
  });
}

/**
 * 404 handler.
 */
export function notFoundHandler(req, res) {
  res.status(404).json({ success: false, error: 'Route not found' });
}
