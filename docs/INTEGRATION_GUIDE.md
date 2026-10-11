# Toyvolt External Integrations Guide

This guide details how to configure external third-party services (Resend, Razorpay, Shiprocket, Cloudinary, MongoDB Atlas) for both development and production deployment.

---

## 1. MongoDB Atlas Configuration

1. Create a free cluster at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas).
2. Under **Security > Database Access**:
   - Create a database user (e.g. `toyvolt_admin`) with **Read and write to any database** privileges.
3. Under **Security > Network Access**:
   - Add IP Access: `0.0.0.0/0` (Allow access from anywhere) if deploying to dynamic hosting like Vercel, Render, or Railway.
4. Under **Deployment > Database > Connect**:
   - Select **Drivers (Node.js)** and copy your connection string:
   ```env
   MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/toyvolt?retryWrites=true&w=majority
   ```

---

## 2. Resend Email & OTP Delivery

Toyvolt uses the official [Resend](https://resend.com) SDK for transactional email and 6-digit OTP delivery.

### Setup Steps:
1. Sign up at [Resend](https://resend.com).
2. Go to **API Keys** and click **Create API Key** (Permissions: Full Access).
3. Copy the key into `.env`:
   ```env
   RESEND_API_KEY=re_1234567890abcdef
   ```
4. **Sender Email Address**:
   - In Development / Sandbox: You can test immediately using `EMAIL_FROM=onboarding@resend.dev` (Resend delivers exclusively to your registered account email in test mode).
   - In Production: Go to **Domains**, add your custom domain (e.g. `toyvolt.com`), configure the DNS records (DKIM, SPF), and set:
     ```env
     EMAIL_FROM=Toyvolt Orders <orders@toyvolt.com>
     ```
5. **Fallback in Development**:
   If `RESEND_API_KEY` is left blank, Toyvolt gracefully logs the generated OTP directly to the terminal console without throwing fatal errors.

---

## 3. Razorpay Payment Gateway

Toyvolt processes online payments through Razorpay in standard **integer paise** (1 INR = 100 paise).

### Setup Steps:
1. Sign up at [Razorpay Dashboard](https://dashboard.razorpay.com).
2. Navigate to **Settings > API Keys** and click **Generate Key**:
   - Copy **Key Id** and **Key Secret**.
   ```env
   RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxxx
   RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
   ```
3. **Webhook Setup (Critical for Order Confirmation)**:
   - Navigate to **Settings > Webhooks > Add New Webhook**.
   - **Webhook URL**: `https://<your-backend-domain>/api/v1/webhooks/razorpay` (or your Ngrok URL during local testing).
   - **Secret**: Set a strong random string and put it in `.env`:
     ```env
     RAZORPAY_WEBHOOK_SECRET=your_secure_webhook_secret_here
     ```
   - **Active Events to Select**:
     - `order.paid`
     - `payment.captured`
     - `payment.failed`
4. **Switching to Live Mode**:
   - Complete your business KYC in the Razorpay dashboard.
   - Switch the toggle at top-left from **Test Mode** to **Live Mode**.
   - Generate Live API keys and replace `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in production environment variables.

---

## 4. Shiprocket Logistics & Tracking

Toyvolt integrates with [Shiprocket](https://app.shiprocket.in) to generate domestic shipments, assign AWB codes, print labels, and track deliveries.

### Setup Steps:
1. Register an account at [Shiprocket](https://app.shiprocket.in).
2. Fill your business profile and verify KYC.
3. Navigate to **Settings > Pickup Locations**:
   - Click **Add Pickup Location**.
   - Enter your actual warehouse/store address, phone number, and PIN code.
   - Give the location an identifier name, for example: `Primary` or `Toyvolt-Warehouse-1`.
   - Update `.env`:
     ```env
     SHIPROCKET_EMAIL=your_shiprocket_login_email@example.com
     SHIPROCKET_PASSWORD=your_shiprocket_account_password
     SHIPROCKET_PICKUP_LOCATION=Primary
     ```
4. **Missing Credentials Behavior**:
   - The backend boots normally even if Shiprocket credentials are blank.
   - Only requests to dispatch shipments (`POST /api/v1/admin/shipments/:orderId/create`) will return an explicit 503 configuration error if credentials are missing.

---

## 5. Cloudinary Media Storage

Used for uploading and hosting product photos.

### Setup Steps:
1. Sign up at [Cloudinary](https://cloudinary.com).
2. Copy your credentials from the Dashboard:
   ```env
   CLOUDINARY_CLOUD_NAME=your_cloud_name
   CLOUDINARY_API_KEY=your_api_key
   CLOUDINARY_API_SECRET=your_api_secret
   ```
3. Admins can upload product images via `POST /api/v1/admin/upload` (multipart form field: `image`).

---

## 6. Connecting the Future React + Vite Frontend

### CORS and Cookie Authentication
Toyvolt issues HTTP-only cookies (`toyvolt_access_token` and `toyvolt_refresh_token`).

In your React/Vite app:
1. Configure your Axios instance or fetch calls with `withCredentials: true` (or `credentials: 'include'` for `fetch`):
```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1',
  withCredentials: true // Crucial for receiving and sending HTTP-only cookies
});

export default api;
```
2. Bearer Token Alternative:
If cross-subdomain cookie issues arise in your production deployment, the backend also returns `accessToken` in the JSON response payload. You can pass it as:
```javascript
headers: {
  Authorization: `Bearer ${accessToken}`
}
```
Toyvolt's authentication middleware seamlessly accepts both HTTP-only cookies and Authorization headers!
