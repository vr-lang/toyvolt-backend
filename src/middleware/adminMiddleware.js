import { AppError } from '../utils/AppError.js';

export const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return next(new AppError('Authentication required.', 401));
  }

  if (req.user.role !== 'admin') {
    return next(new AppError('Forbidden: Administrator access required.', 403));
  }

  next();
};
