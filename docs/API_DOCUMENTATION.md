# Toyvolt E-commerce Backend API Documentation

Base URL: `http://localhost:5000/api/v1` (Local) | `https://your-domain.com/api/v1` (Production)

---

## Standard Response Format

### Success Response
```json
{
  "success": true,
  "message": "Optional human-readable confirmation",
  "data": { ... }
}
```

### Error Response
```json
{
  "success": false,
  "status": "fail | error",
  "message": "Clear error description",
  "details": [
    { "field": "email", "message": "Please enter a valid email address" }
  ]
}
```

---

## 1. Authentication APIs (`/api/v1/auth`)

### 1.1 Register Customer
- **Endpoint**: `POST /auth/register`
- **Description**: Registers a new customer account and sends a 6-digit verification OTP. Unverified existing registrations are updated safely.
- **Request Body**:
```json
{
  "name": "Aarav Sharma",
  "email": "aarav@example.com",
  "password": "SecurePassword123!"
}
```
- **Success (201 Created)**:
```json
{
  "success": true,
  "message": "Registration successful. A verification code has been sent to your email.",
  "data": {
    "email": "aarav@example.com"
  }
}
```

### 1.2 Verify Email OTP
- **Endpoint**: `POST /auth/verify-email`
- **Description**: Verifies the submitted OTP, marks account as verified, issues HTTP-only cookies, and sends a Welcome Email with a ₹100 welcome coupon code (`WELCOME100`).
- **Request Body**:
```json
{
  "email": "aarav@example.com",
  "otp": "482910"
}
```
- **Success (200 OK)**:
```json
{
  "success": true,
  "message": "Email successfully verified. Welcome to Toyvolt!",
  "data": {
    "user": {
      "id": "6708c2a91234567890abcdef",
      "name": "Aarav Sharma",
      "email": "aarav@example.com",
      "role": "customer",
      "isEmailVerified": true
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### 1.3 Resend OTP
- **Endpoint**: `POST /auth/resend-otp`
- **Rate Limit**: 1 request per 60 seconds.
- **Request Body**:
```json
{
  "email": "aarav@example.com",
  "purpose": "register"
}
```

### 1.4 Login
- **Endpoint**: `POST /auth/login`
- **Description**: Logs in a verified customer or administrator.
- **Request Body**:
```json
{
  "email": "aarav@example.com",
  "password": "SecurePassword123!"
}
```
- **Success (200 OK)**: Sets HTTP-only cookies and returns access token.

### 1.5 Get Current User Profile
- **Endpoint**: `GET /auth/me`
- **Headers**: `Authorization: Bearer <token>` or credentials cookies.

---

## 2. Products APIs (`/api/v1/products`)

### 2.1 List Products
- **Endpoint**: `GET /products`
- **Query Parameters**:
  - `search`: Keyword search in name, description, and SKU.
  - `category`: Filter by product category.
  - `inStockOnly`: `true | false`.
  - `sort`: `newest | price_asc | price_desc | name_asc`.
  - `page`: Page number (default: 1).
  - `limit`: Items per page (default: 12).
- **Success (200 OK)**:
```json
{
  "success": true,
  "data": {
    "products": [
      {
        "id": "6708c2a9...",
        "name": "Toyvolt Apex-1 High-Speed RC Drift Car (1:16 Scale)",
        "slug": "toyvolt-apex-1-rc-drift-car",
        "sku": "TV-RC-001",
        "sellingPrice": 249900,
        "sellingPriceInRupees": 2499.00,
        "compareAtPrice": 349900,
        "compareAtPriceInRupees": 3499.00,
        "availableStock": 100,
        "isInStock": true,
        "images": [
          { "url": "https://...", "isPrimary": true }
        ],
        "specifications": {
          "Scale": "1:16",
          "Top Speed": "35 km/h",
          "Drive": "4WD"
        }
      }
    ],
    "pagination": {
      "total": 1,
      "page": 1,
      "limit": 12,
      "pages": 1
    }
  }
}
```

### 2.2 Product Details by Slug
- **Endpoint**: `GET /products/:slug`

---

## 3. Cart APIs (`/api/v1/cart`)
*Requires Authentication (`protect`)*

- `GET /cart` - Retrieve current cart with validated live pricing and inventory status.
- `POST /cart/items` - Add item: `{ "productId": "...", "quantity": 1 }`.
- `PATCH /cart/items/:productId` - Update item quantity: `{ "quantity": 2 }`.
- `DELETE /cart/items/:productId` - Remove item from cart.
- `DELETE /cart` - Empty entire cart.

---

## 4. Coupons & Discounts (`/api/v1/coupons`)

### 4.1 Validate Coupon Code
- **Endpoint**: `POST /coupons/validate`
- **Request Body**:
```json
{
  "code": "WELCOME100",
  "subtotal": 249900
}
```
- **Success (200 OK)**:
```json
{
  "success": true,
  "data": {
    "isValid": true,
    "coupon": {
      "code": "WELCOME100",
      "description": "Flat ₹100 OFF for new customers",
      "discountType": "flat",
      "discountValue": 10000
    },
    "subtotal": 249900,
    "subtotalInRupees": 2499.00,
    "discountAmount": 10000,
    "discountAmountInRupees": 100.00,
    "finalAmount": 239900,
    "finalAmountInRupees": 2399.00
  }
}
```

---

## 5. Orders & Checkout (`/api/v1/orders`)
*Requires Authentication (`protect`)*

### 5.1 Place Pending Order
- **Endpoint**: `POST /orders`
- **Description**: Recalculates subtotal from trusted server inventory, applies coupon validation, calculates shipping fee, and atomically reserves inventory.
- **Request Body**:
```json
{
  "shippingAddress": {
    "fullName": "Aarav Sharma",
    "phone": "9876543210",
    "addressLine1": "Flat 402, Skyline Towers",
    "addressLine2": "Sector 14",
    "city": "Gurugram",
    "state": "Haryana",
    "postalCode": "122001",
    "country": "India"
  },
  "couponCode": "WELCOME100",
  "paymentMethod": "razorpay"
}
```

### 5.2 My Orders
- **Endpoint**: `GET /orders/my?page=1&limit=10`

### 5.3 Order Tracking
- **Endpoint**: `GET /orders/:id/tracking`

### 5.4 Cancel Order
- **Endpoint**: `POST /orders/:id/cancel`
- **Request Body**: `{ "reason": "Accidental order" }`

---

## 6. Payments (`/api/v1/payments`)

### 6.1 Create Razorpay Order
- **Endpoint**: `POST /payments/create-order`
- **Request Body**: `{ "orderId": "6708c2a9..." }`
- **Success (200 OK)**:
```json
{
  "success": true,
  "data": {
    "orderId": "6708c2a9...",
    "orderNumber": "TV-20261011-4821",
    "razorpayOrderId": "order_PUQ1827491",
    "amount": 239900,
    "currency": "INR",
    "keyId": "rzp_test_..."
  }
}
```

### 6.2 Verify Razorpay Payment Signature
- **Endpoint**: `POST /payments/verify`
- **Request Body**:
```json
{
  "orderId": "6708c2a9...",
  "razorpayOrderId": "order_PUQ1827491",
  "razorpayPaymentId": "pay_PUQ2819201",
  "razorpaySignature": "9b128f7c..."
}
```

### 6.3 Razorpay Webhook
- **Endpoint**: `POST /webhooks/razorpay`
- **Headers**: `x-razorpay-signature`
- **Description**: Verifies signature against raw request body and processes `order.paid`, `payment.captured`, `payment.failed` idempotently.

---

## 7. Admin Namespace (`/api/v1/admin`)
*Requires Admin Role (`protect`, `requireAdmin`)*

- `GET /admin/dashboard` - Analytics metrics, paid revenue in paise/rupees, pending orders, low-stock products.
- `GET /admin/analytics/sales?timeframe=30d` - Sales trend aggregates.
- `GET /admin/products` & `POST /admin/products` & `PATCH /admin/products/:id` & `DELETE /admin/products/:id`.
- `POST /admin/upload` - Multipart image upload to Cloudinary.
- `GET /admin/orders` & `PATCH /admin/orders/:id/status`.
- `GET /admin/customers` & `PATCH /admin/customers/:id/status`.
- `GET /admin/coupons` & `POST /admin/coupons` & `PATCH /admin/coupons/:id`.
- `POST /admin/shipments/:orderId/create` - Dispatch order via Shiprocket.
- `GET /admin/shipments` - List all shipments.
