import { authService } from '../services/authService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { setAuthCookies, clearAuthCookies } from '../utils/token.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export const register = asyncHandler(async (req, res) => {
  logger.info(`Registration request received for recipient: ${req.body?.email?.toLowerCase()?.trim()}`);
  const result = await authService.register(req.body);
  res.status(201).json({
    success: true,
    message: result.message,
    data: { email: result.email }
  });
});

export const verifyEmail = asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.verifyEmail(req.body);
  
  // Set secure HTTP-only cookies
  setAuthCookies(res, { accessToken, refreshToken });

  res.status(200).json({
    success: true,
    message: 'Email successfully verified. Welcome to Toyvolt!',
    data: {
      user,
      accessToken
    }
  });
});

export const resendOtp = asyncHandler(async (req, res) => {
  const result = await authService.resendOtp(req.body);
  res.status(200).json({
    success: true,
    message: result.message
  });
});

export const login = asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.login(req.body);

  // Set secure HTTP-only cookies
  setAuthCookies(res, { accessToken, refreshToken });

  res.status(200).json({
    success: true,
    message: 'Logged in successfully.',
    data: {
      user,
      accessToken
    }
  });
});

export const logout = asyncHandler(async (req, res) => {
  clearAuthCookies(res);
  res.status(200).json({
    success: true,
    message: 'Logged out successfully.'
  });
});

export const getMe = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      user: req.user
    }
  });
});

export const refreshToken = asyncHandler(async (req, res) => {
  const token = req.cookies[env.REFRESH_COOKIE_NAME] || req.body.refreshToken;
  const result = await authService.refreshAccessToken(token);

  setAuthCookies(res, { accessToken: result.accessToken });

  res.status(200).json({
    success: true,
    data: {
      accessToken: result.accessToken,
      user: result.user
    }
  });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const result = await authService.forgotPassword(req.body);
  res.status(200).json({
    success: true,
    message: result.message
  });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const result = await authService.resetPassword(req.body);
  res.status(200).json({
    success: true,
    message: result.message
  });
});
