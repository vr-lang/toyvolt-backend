# Toyvolt E-commerce Backend

Production-ready backend for **Toyvolt**, an e-commerce brand selling high-performance remote-control toys online through its custom web storefront.

Built as a robust, secure **Modular Monolith** using **Node.js, Express.js, MongoDB Atlas (Mongoose), Resend, Razorpay, Shiprocket, and Cloudinary**.

---

## 🏎️ Features & Capabilities

- **Strict Integer-Paise Accounting**: Eliminates floating-point rounding errors across all products, cart items, discounts, orders, and payment calculations (1 INR = 100 paise).
- **Email OTP Authentication**: Transactional email verification using the official Resend Node.js SDK with branded Toyvolt HTML/text templates (Electric Blue, Orange, Dark, Cream), 5-minute TTL, 5-attempt brute-force protection, and 60-second cooldowns.
- **Product & Inventory Engine**: Full catalog management, dynamic specifications, search, category filters, and **concurrency-safe atomic inventory reservation** during checkout.
- **Server-Side Trusted Cart & Pricing**: Never trusts client-submitted prices or totals. Every price and discount is recomputed against server-side database records.
- **Coupon & Promotion Engine**: Welcome coupon (₹100 OFF - `WELCOME100`), percentage & flat discount influencer codes, minimum order value checks, and race-condition protected atomic usage counters.
- **Razorpay Payments**: Complete order creation, cryptographic `HMAC-SHA256` signature verification, raw-body webhook signature verification, and **idempotent duplicate event deduplication**.
- **Shiprocket Logistics**: Shipment creation, automatic weight and dimension calculation from product data, AWB assignment, courier tracking, and webhook updates. Gracefully degrades if credentials are not yet added.
- **Admin System & Analytics**: Protected `/api/v1/admin` namespace with dashboard metrics (paid revenue, pending orders, delivered orders, low stock alerts, 7-day/30-day sales analytics), customer account moderation, and Cloudinary image uploads.
- **Security & Reliability**: Helmet, strict CORS with credentials, rate limiting (global, auth, OTP), bcrypt password hashing, and centralized error handling that never leaks secrets or stack traces.

---

## 🛠️ Technology Stack

| Component | Technology |
|---|---|
| Runtime | Node.js (v18+) with ES Modules |
| Web Framework | Express.js |
| Database | MongoDB Atlas with Mongoose ODM |
| Email & OTP | Resend Node.js SDK |
| Payment Gateway | Razorpay SDK |
| Shipping Logistics | Shiprocket REST API |
| Media Storage | Cloudinary SDK |
| Validation | Zod |
| Security | Helmet, bcrypt, JSONWebToken, express-rate-limit |
| Testing | Jest, Supertest, mongodb-memory-server |

---

## 📂 Project Structure

```
toyvolt-backend/
├── src/
│   ├── server.js              # Application entrypoint & graceful shutdown
│   ├── app.js                 # Express app configuration & middleware pipeline
│   ├── config/
│   │   ├── env.js             # Zod environment variable validator & helpers
│   │   ├── database.js        # Mongoose connection with pooling
│   │   ├── cors.js            # CORS allowlisting with credentials
│   │   ├── cloudinary.js      # Cloudinary media storage setup
│   │   └── seedData.json      # Canonical specifications for Toyvolt RC Car
│   ├── models/
│   │   ├── User.js            # Customer & Admin accounts, addresses, verified status
│   │   ├── Product.js         # SKU, slug, integer paise prices, specs, stock
│   │   ├── OtpToken.js        # Hashed OTPs, attempts, cooldowns, TTL cleanup
│   │   ├── Cart.js            # Customer cart items
│   │   ├── Order.js           # Immutable snapshots, statuses, paise amounts
│   │   ├── Coupon.js          # Flat/percentage discounts, usage limits
│   │   ├── Payment.js         # Razorpay transaction records & raw webhook audit
│   │   └── Shipment.js        # Shiprocket orders, AWB, courier & tracking history
│   ├── routes/
│   │   ├── index.js           # Aggregator for API v1 routes and webhooks
│   │   ├── authRoutes.js      # Registration, OTP verify, login, logout, password reset
│   │   ├── productRoutes.js   # Public catalogue & category endpoints
│   │   ├── cartRoutes.js      # Customer cart management
│   │   ├── couponRoutes.js    # Coupon validation
│   │   ├── orderRoutes.js     # Checkout, order history, cancellation & tracking
│   │   ├── paymentRoutes.js   # Razorpay order generation & verification
│   │   ├── shipmentRoutes.js  # Logistics tracking & Shiprocket webhook
│   │   ├── adminRoutes.js     # Admin dashboard, products, orders, coupons, analytics
│   │   └── healthRoutes.js    # System health check (/api/v1/health)
│   ├── controllers/           # Slim HTTP controllers delegating to services
│   ├── services/              # Domain logic (auth, otp, email, order, razorpay, shiprocket)
│   ├── middleware/            # authMiddleware, adminMiddleware, errorHandler, rateLimiter, validate
│   ├── validators/            # Zod request validation schemas
│   ├── templates/emails/      # Branded HTML & text email templates (Toyvolt electric-blue/orange)
│   ├── utils/                 # AppError, money utilities, token helpers, safe logger
│   └── scripts/
│       ├── seedAdmin.js       # CLI script to securely create or update initial admin
│       └── seedProducts.js    # CLI script to seed Toyvolt flagship RC car and coupons
├── tests/
│   ├── setup.js               # In-memory MongoDB test server setup
│   └── integration/           # 7 comprehensive test suites (32 integration tests)
├── docs/
│   ├── API_DOCUMENTATION.md   # Complete endpoints, payloads, and response schema reference
│   └── INTEGRATION_GUIDE.md   # Step-by-step setup for Resend, Razorpay, Shiprocket & Cloudinary
├── .env.example               # Complete environment template
├── .gitignore
├── vercel.json                # Vercel serverless deployment routing
├── package.json
└── README.md
```

---

## 🚀 Quickstart & Local Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Fill in your MongoDB connection string (or use the local default `mongodb://127.0.0.1:27017/toyvolt`). External API keys (Resend, Razorpay, Shiprocket, Cloudinary) are optional for initial local boot and test runs!

### 3. Seed Initial RC Car Product & Coupons
```bash
npm run seed:product
```
This populates the flagship **Toyvolt Apex-1 High-Speed RC Drift Car (1:16 Scale)** (₹2,499 [249900 paise], SKU `TV-RC-001`) and the welcome coupon `WELCOME100`.

### 4. Seed Initial Administrator Account
```bash
npm run seed:admin -- --email admin@toyvolt.com --password YourSuperSecretAdminPassword123! --name "Toyvolt Admin"
```
*Note: Public registration via the API is strictly restricted to customer accounts. Admins can only be created via this secure script.*

### 5. Start the Server
- **Development Mode** (with auto-reload):
  ```bash
  npm run dev
  ```
- **Production Mode**:
  ```bash
  npm start
  ```
The server will start at `http://localhost:5000`. Test the health check endpoint:
```bash
curl http://localhost:5000/api/v1/health
```

---

## 🧪 Running Automated Tests

Toyvolt comes with an end-to-end integration test suite running on an in-memory MongoDB server without requiring external network dependencies or live API keys:

```bash
npm test
```

### Test Coverage Highlights:
- ✅ Customer registration, OTP hashing, and email delivery.
- ✅ Invalid, expired, reused, and rate-limited OTP attempts.
- ✅ Verified login, unverified account rejection, and logout.
- ✅ Unauthorized admin access protection (customers receive 403 Forbidden).
- ✅ Product catalog, slug lookup, and safe soft-archiving when referenced in orders.
- ✅ Concurrency-safe atomic inventory reservation and rollback.
- ✅ Server-side price recalculation (tamper-proof checkout).
- ✅ Customer isolation (Customer A cannot access or cancel Customer B's orders).
- ✅ Coupon minimum order thresholds, expiration, global and per-user redemption limits.
- ✅ Razorpay cryptographic payment signature verification.
- ✅ Razorpay webhook idempotency (duplicate webhook calls are acknowledged without re-processing).
- ✅ Shiprocket shipment generation for paid orders and graceful handling of missing credentials.
- ✅ Admin dashboard metrics, low-stock alerts, customer moderation, and sales analytics.

---

## 📚 API Reference & Documentation

For complete request schemas, query parameters, and example responses, consult:
- **[docs/API_DOCUMENTATION.md](docs/API_DOCUMENTATION.md)**

For instructions on configuring Resend domain verification, Razorpay webhooks, Shiprocket pickup locations, Cloudinary media storage, and connecting the React + Vite frontend:
- **[docs/INTEGRATION_GUIDE.md](docs/INTEGRATION_GUIDE.md)**

---

## ☁️ Deployment

### Deploy to Vercel
Toyvolt includes a `vercel.json` configuration configured for serverless execution:
1. Push your repository to GitHub.
2. Import the project in Vercel.
3. Add the environment variables from `.env.example` in the Vercel dashboard.
4. Deploy!

### Deploy to Persistent Node.js Hosts (Render / Railway / Fly.io / AWS)
1. Set the build command: `npm install`
2. Set the start command: `npm start`
3. Configure your production environment variables in the host dashboard.

---

## 📄 License
ISC © Toyvolt Engineering
# toyvolt-backend
