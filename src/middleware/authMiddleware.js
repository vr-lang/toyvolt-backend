import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { verifyAccessToken } from '../utils/token.js';

export const protect = asyncHandler(async (req, res, next) => {
  let token;

  // 1. Check cookies first (recommended HTTP-only cookie strategy)
  if (req.cookies && req.cookies[env.COOKIE_NAME]) {
    token = req.cookies[env.COOKIE_NAME];
  }
  // 2. Check Authorization header (Bearer token)
  else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return next(new AppError('You are not logged in. Please log in to gain access.', 401));
  }

  // 3. Verify token
  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch (err) {
    return next(new AppError('Invalid or expired authentication token. Please log in again.', 401));
  }

  // 4. Check if user still exists
  const currentUser = await User.findById(decoded.id);
  if (!currentUser) {
    return next(new AppError('The user belonging to this token no longer exists.', 401));
  }

  // 5. Check if user is active
  if (currentUser.accountStatus !== 'active') {
    return next(new AppError('Your account has been suspended. Please contact support.', 403));
  }

  // Attach user to request
  req.user = currentUser;
  next();
});

/**
 * Optional authentication: attaches user if token is valid, but does not block if not logged in
 */
export const optionalAuth = asyncHandler(async (req, res, next) => {
  let token;

  if (req.cookies && req.cookies[env.COOKIE_NAME]) {
    token = req.cookies[env.COOKIE_NAME];
  } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (token) {
    try {
      const decoded = verifyAccessToken(token);
      const currentUser = await User.findById(decoded.id);
      if (currentUser && currentUser.accountStatus === 'active') {
        req.user = currentUser;
      }
    } catch {
      // Ignore token errors for optional auth
    }
  }

  next();
});
