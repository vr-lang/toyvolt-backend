import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

// Ensure root .env is loaded regardless of current working directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootEnvPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: rootEnvPath });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(5001),
  
  // Database: strictly required in development and production (no silent localhost fallback)
  MONGODB_URI: process.env.NODE_ENV === 'test'
    ? z.string().default('mongodb://localhost:27017/toyvolt_test')
    : z.string({
        required_error: 'MONGODB_URI is required. Please set your MongoDB Atlas connection string in .env'
      }).min(1, 'MONGODB_URI cannot be empty in .env'),

  // Client URLs
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  ADMIN_URL: z.string().default('http://localhost:5173'),

  // Cookies & Auth Tokens
  COOKIE_NAME: z.string().default('toyvolt_access_token'),
  REFRESH_COOKIE_NAME: z.string().default('toyvolt_refresh_token'),
  JWT_SECRET: z.string().default('toyvolt_dev_jwt_access_secret_key_change_in_production_32char'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_SECRET: z.string().default('toyvolt_dev_refresh_secret_key_change_in_production_32char'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),

  // Resend API (Email & OTP)
  RESEND_API_KEY: z.string().optional().default(''),
  EMAIL_FROM: z.string().default('Toyvolt <onboarding@resend.dev>'),

  // Cloudinary
  CLOUDINARY_CLOUD_NAME: z.string().optional().default(''),
  CLOUDINARY_API_KEY: z.string().optional().default(''),
  CLOUDINARY_API_SECRET: z.string().optional().default(''),

  // Razorpay
  PAYMENTS_MODE: z.enum(['test', 'live']).default('test'),
  RAZORPAY_KEY_ID: z.string().optional().default(''),
  RAZORPAY_KEY_SECRET: z.string().optional().default(''),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional().default(''),

  // Shiprocket
  SHIPROCKET_EMAIL: z.string().optional().default(''),
  SHIPROCKET_PASSWORD: z.string().optional().default(''),
  SHIPROCKET_WEBHOOK_SECRET: z.string().optional().default(''),
  SHIPROCKET_PICKUP_LOCATION: z.string().default('Primary')
}).superRefine((data, ctx) => {
  if (data.PAYMENTS_MODE === 'test' && data.RAZORPAY_KEY_ID && data.RAZORPAY_KEY_ID.startsWith('rzp_live_')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'CRITICAL SECURITY SAFEGUARD: Live Razorpay credentials (rzp_live_*) detected while PAYMENTS_MODE=test. Server refused to initialize in test mode with live credentials.',
      path: ['RAZORPAY_KEY_ID']
    });
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:', parsed.error.format());
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
}

export const env = parsed.data || envSchema.parse({});

// Feature availability helpers
export const hasResend = () => Boolean(env.RESEND_API_KEY);
export const hasRazorpay = () => Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
export const isPaymentsTestMode = () => env.PAYMENTS_MODE === 'test';
export const hasShiprocket = () => Boolean(env.SHIPROCKET_EMAIL && env.SHIPROCKET_PASSWORD);
export const hasCloudinary = () => Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);

