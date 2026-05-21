// server/api/services/tokenService.js
// Manages PhonePe OAuth token lifecycle with in-memory caching and auto-refresh

import axios from 'axios';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const TOKEN_EXPIRY_BUFFER_MS = 60_000; // refresh 60s before expiry

const tokenCache = {
  accessToken: null,
  expiresAt: 0,
};

// Deduplicates concurrent refresh calls — only one HTTP request goes out
let refreshPromise = null;

/**
 * Returns a valid PhonePe OAuth access token.
 * Fetches a new one if the cached token is expired or missing.
 */
export async function getAccessToken() {
  const now = Date.now();

  if (tokenCache.accessToken && now < tokenCache.expiresAt - TOKEN_EXPIRY_BUFFER_MS) {
    logger.debug('phonepe.token.cache_hit');
    return tokenCache.accessToken;
  }

  // All concurrent callers share the same in-flight refresh request
  if (!refreshPromise) {
    refreshPromise = _refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function _refreshAccessToken() {
  logger.info('phonepe.token.refresh_start');

  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', env.phonepe.clientId);
  params.append('client_secret', env.phonepe.clientSecret);
  params.append('client_version', String(env.phonepe.clientVersion));

  try {
    const response = await axios.post(env.phonepe.tokenUrl, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 10_000,
    });

    const { access_token, expires_in } = response.data;

    if (!access_token) {
      throw new Error('No access_token in PhonePe token response');
    }

    tokenCache.accessToken = access_token;
    tokenCache.expiresAt = Date.now() + (expires_in || 3600) * 1000;

    logger.info('phonepe.token.refresh_success', { expiresIn: expires_in });
    return access_token;
  } catch (err) {
    const detail = err.response?.data || err.message;
    logger.error('phonepe.token.refresh_failed', { detail });
    throw new Error(`PhonePe OAuth token refresh failed: ${JSON.stringify(detail)}`);
  }
}

/**
 * Force-invalidate the cached token (e.g., after a 401 response).
 */
export function invalidateToken() {
  tokenCache.accessToken = null;
  tokenCache.expiresAt = 0;
  logger.warn('phonepe.token.invalidated');
}
