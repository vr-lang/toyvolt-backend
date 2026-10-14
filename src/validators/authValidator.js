import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters long')
});

export const verifyEmailSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  otp: z.string().length(6, 'Verification code must be 6 digits')
});

export const resendOtpSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  purpose: z.enum(['register', 'password_reset']).default('register')
});

export const setupAdminSchema = z.object({
  adminId: z.string().min(3, 'Admin ID must be at least 3 characters').max(100),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100).optional(),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  confirmPassword: z.string().min(8, 'Confirm password must be at least 8 characters long')
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword']
});

export const loginSchema = z.object({
  email: z.string().min(1, 'Email or Admin ID is required'),
  password: z.string().min(1, 'Password is required')
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Please enter a valid email address')
});

export const resetPasswordSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  otp: z.string().length(6, 'Verification code must be 6 digits'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters long')
});
