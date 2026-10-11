import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const generateAccessToken = (payload) => {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN
  });
};

export const generateRefreshToken = (payload) => {
  return jwt.sign(payload, env.REFRESH_TOKEN_SECRET, {
    expiresIn: env.REFRESH_TOKEN_EXPIRES_IN
  });
};

export const verifyAccessToken = (token) => {
  return jwt.verify(token, env.JWT_SECRET);
};

export const verifyRefreshToken = (token) => {
  return jwt.verify(token, env.REFRESH_TOKEN_SECRET);
};

export const setAuthCookies = (res, { accessToken, refreshToken }) => {
  const isProduction = env.NODE_ENV === 'production';

  const cookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/'
  };

  // Access Token Cookie (15 mins)
  res.cookie(env.COOKIE_NAME, accessToken, {
    ...cookieOptions,
    maxAge: 15 * 60 * 1000
  });

  // Refresh Token Cookie (7 days) if provided
  if (refreshToken) {
    res.cookie(env.REFRESH_COOKIE_NAME, refreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
  }
};

export const clearAuthCookies = (res) => {
  const isProduction = env.NODE_ENV === 'production';

  const cookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/'
  };

  res.clearCookie(env.COOKIE_NAME, cookieOptions);
  res.clearCookie(env.REFRESH_COOKIE_NAME, cookieOptions);
};
