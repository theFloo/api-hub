// server/api/config/env.js
// Validates all required environment variables at startup

const REQUIRED_VARS = [
  'PHONEPE_MERCHANT_ID',
  'PHONEPE_CLIENT_ID',
  'PHONEPE_CLIENT_SECRET',
  'PHONEPE_BASE_URL',
  'PHONEPE_TOKEN_URL',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'FRONTEND_URL',
  'BACKEND_URL',
];

export function validateEnv() {
  const missing = REQUIRED_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error('[ENV] Missing required environment variables:', missing.join(', '));
    process.exit(1);
  }
}

export const env = {
  phonepe: {
    merchantId: process.env.PHONEPE_MERCHANT_ID,
    clientId: process.env.PHONEPE_CLIENT_ID,
    clientSecret: process.env.PHONEPE_CLIENT_SECRET,
    clientVersion: parseInt(process.env.PHONEPE_CLIENT_VERSION || '1', 10),
    saltKey: process.env.PHONEPE_SALT_KEY,
    saltIndex: process.env.PHONEPE_SALT_INDEX || '1',
    baseUrl: process.env.PHONEPE_BASE_URL,
    tokenUrl: process.env.PHONEPE_TOKEN_URL,
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },
  app: {
    frontendUrl: process.env.FRONTEND_URL,
    backendUrl: process.env.BACKEND_URL,
    port: parseInt(process.env.PORT || '8000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    allowedOrigins: (process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || '').split(',').map((o) => o.trim()),
  },
};
