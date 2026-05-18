# PhonePe PG Checkout V2 — Production Backend

Production-grade PhonePe payment gateway for a digital products marketplace.
Built with Express.js, Supabase, and PhonePe PG Checkout V2 OAuth API.

---

## Folder Structure

```
phonepe-backend/
├── server/
│   └── api/
│       ├── index.js                   # Express entry point + Vercel export
│       ├── config/
│       │   ├── env.js                 # Env validation + typed config
│       │   └── supabaseClient.js      # Supabase service-role client
│       ├── routes/
│       │   ├── paymentRoutes.js
│       │   ├── orderRoutes.js
│       │   └── productRoutes.js
│       ├── controllers/
│       │   ├── paymentController.js   # create, callback, webhook, status
│       │   ├── orderController.js     # fetch orders + download links
│       │   └── productController.js  # product listing
│       ├── services/
│       │   ├── tokenService.js        # OAuth token cache + refresh
│       │   ├── phonePeClient.js       # Axios wrapper for PhonePe API
│       │   ├── orderService.js        # Supabase order CRUD + idempotency
│       │   ├── downloadService.js     # Signed Supabase Storage URLs
│       │   └── emailService.js        # Post-payment email (stub)
│       ├── middleware/
│       │   └── security.js            # Headers, CORS, rate limiting, logging
│       ├── validators/
│       │   └── paymentValidator.js    # Input validation
│       └── utils/
│           ├── logger.js              # Structured JSON logger
│           ├── response.js            # Consistent response helpers
│           └── crypto.js              # Checksum + ID generation
├── supabase-schema.sql
├── .env.example
├── package.json
└── vercel.json
```

---

## Installation

```bash
git clone <your-repo>
cd phonepe-backend
npm install
cp .env.example .env
# Fill in your .env values
npm run dev
```

---

## PhonePe Onboarding Steps

1. Register at https://developer.phonepe.com
2. Create a Merchant account → get `PHONEPE_MERCHANT_ID`
3. Under API Keys, create OAuth credentials → get `CLIENT_ID` and `CLIENT_SECRET`
4. Note your `CLIENT_VERSION` (usually 1)
5. Get your `SALT_KEY` and `SALT_INDEX` for checksum verification
6. For UAT: use `api-preprod.phonepe.com` endpoints
7. For PROD: use `api.phonepe.com` endpoints
8. Register your callback/webhook URLs in the PhonePe dashboard:
   - Callback (redirect): `https://your-backend.vercel.app/api/payments/callback/:merchantOrderId`
   - Webhook: `https://your-backend.vercel.app/api/payments/webhook`

---

## Supabase Setup

1. Create a Supabase project at https://supabase.com
2. Go to SQL Editor → paste contents of `supabase-schema.sql` → Run
3. Create a Storage bucket named `products` (private)
4. Upload your digital product files to the bucket
5. Update the `storage_path` column in the `products` table to match your file paths
6. Copy your `Project URL` and `service_role` key to `.env`

---

## Vercel Deployment

```bash
npm install -g vercel
vercel login
vercel

# Set environment variables in Vercel dashboard, OR:
vercel env add PHONEPE_MERCHANT_ID
vercel env add PHONEPE_CLIENT_ID
vercel env add PHONEPE_CLIENT_SECRET
# ... add all variables from .env.example

vercel --prod
```

The `vercel.json` routes all `/api/*` requests to `server/api/index.js`.

---

## API Reference

### Health Check
```
GET /api/health
```

### Create Payment
```
POST /api/payments/create
Content-Type: application/json

{
  "customerName": "Rahul Sharma",
  "customerEmail": "rahul@example.com",
  "customerPhone": "9876543210",
  "items": [
    { "productId": "uuid-here", "quantity": 1 }
  ]
}

Response 201:
{
  "success": true,
  "data": {
    "merchantOrderId": "PP-LX4A2B-3F9C",
    "orderId": "uuid",
    "checkoutUrl": "https://mercury.phonepe.com/...",
    "amount": 49900
  }
}
```

### Get Payment Status
```
GET /api/payments/status/:merchantOrderId

Response 200:
{
  "success": true,
  "data": {
    "merchantOrderId": "PP-LX4A2B-3F9C",
    "orderId": "uuid",
    "paymentState": "COMPLETED",
    "amount": 49900,
    "transactionId": "T2504021..."
  }
}
```

### Get Order
```
GET /api/orders/:orderId?customerEmail=rahul@example.com
```

### List Orders by Email
```
GET /api/orders?email=rahul@example.com
```

### Get Download Links (after payment)
```
POST /api/orders/:orderId/downloads
Content-Type: application/json

{ "customerEmail": "rahul@example.com" }

Response 200:
{
  "success": true,
  "data": {
    "downloads": [
      {
        "productId": "uuid",
        "name": "React Mastery eBook",
        "url": "https://supabase.co/storage/v1/object/sign/...",
        "expiresIn": 60
      }
    ]
  }
}
```

### List Products
```
GET /api/products
GET /api/products/:productId
```

---

## Callback Testing (Local)

1. Install ngrok: `npx ngrok http 8000`
2. Copy the HTTPS ngrok URL
3. Update `BACKEND_URL` in `.env` to your ngrok URL
4. Use PhonePe UAT sandbox to test payments
5. Watch structured logs in your terminal

---

## Payment Flow Diagram

```
Frontend → POST /api/payments/create
  → Validate input
  → Fetch products from DB (server-side price)
  → Recalculate total (prevent tampering)
  → Create PENDING order in DB
  → POST PhonePe /checkout/v2/pay
  → Return checkoutUrl

User → PhonePe checkout page
  → Completes / cancels payment

PhonePe → GET /api/payments/callback/:merchantOrderId
  → Verify via GET /checkout/v2/order/:id/status (never trust params)
  → If COMPLETED: update order DB → send email → redirect to success
  → If FAILED: update order DB → redirect to failure

PhonePe → POST /api/payments/webhook (server-to-server)
  → Verify X-VERIFY checksum
  → Re-verify via status API
  → Idempotent DB update
  → Return 200 to stop retries
```

---

## Production Hardening Checklist

- [ ] Set `NODE_ENV=production` in Vercel
- [ ] Use PhonePe PROD endpoints (not UAT)
- [ ] Rotate `PHONEPE_SALT_KEY` periodically
- [ ] Use `SUPABASE_SERVICE_ROLE_KEY` (never anon key) in backend
- [ ] Enable Supabase RLS on all tables
- [ ] Set `ALLOWED_ORIGINS` to your exact frontend domain
- [ ] Register webhook URL in PhonePe dashboard
- [ ] Enable Vercel's DDoS protection
- [ ] Set up Supabase Storage bucket as private
- [ ] Monitor payment_logs table for anomalies
- [ ] Test idempotency: replay callback requests and verify no duplicate DB updates
- [ ] Set up alerting for `payment.callback.db_update_failed` log events
- [ ] Implement email delivery (replace stub in emailService.js)
- [ ] Add PHONEPE_CLIENT_SECRET to Vercel environment secrets (not plain env)
- [ ] Enable Vercel Edge Network caching headers only for public routes
- [ ] Periodically clean up PENDING orders older than 24h (add a cron job)

---

## Postman Collection Examples

Import this JSON into Postman:

```json
{
  "info": { "name": "PhonePe Backend", "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
  "item": [
    {
      "name": "Health Check",
      "request": { "method": "GET", "url": "{{baseUrl}}/api/health" }
    },
    {
      "name": "List Products",
      "request": { "method": "GET", "url": "{{baseUrl}}/api/products" }
    },
    {
      "name": "Create Payment",
      "request": {
        "method": "POST",
        "header": [{ "key": "Content-Type", "value": "application/json" }],
        "url": "{{baseUrl}}/api/payments/create",
        "body": {
          "mode": "raw",
          "raw": "{\"customerName\":\"Test User\",\"customerEmail\":\"test@example.com\",\"customerPhone\":\"9876543210\",\"items\":[{\"productId\":\"PRODUCT_UUID_HERE\",\"quantity\":1}]}"
        }
      }
    },
    {
      "name": "Get Payment Status",
      "request": { "method": "GET", "url": "{{baseUrl}}/api/payments/status/{{merchantOrderId}}" }
    },
    {
      "name": "Get Download Links",
      "request": {
        "method": "POST",
        "header": [{ "key": "Content-Type", "value": "application/json" }],
        "url": "{{baseUrl}}/api/orders/{{orderId}}/downloads",
        "body": { "mode": "raw", "raw": "{\"customerEmail\":\"test@example.com\"}" }
      }
    }
  ],
  "variable": [
    { "key": "baseUrl", "value": "http://localhost:8000" },
    { "key": "merchantOrderId", "value": "" },
    { "key": "orderId", "value": "" }
  ]
}
```
