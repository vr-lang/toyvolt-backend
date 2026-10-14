import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

const handleCastErrorDB = (err) => {
  const message = `Invalid ${err.path}: ${err.value}.`;
  return new AppError(message, 400);
};

const handleDuplicateFieldsDB = (err) => {
  const field = Object.keys(err.keyValue || {})[0] || 'field';
  const value = err.keyValue ? err.keyValue[field] : 'value';
  const message = `Duplicate value for '${field}': "${value}". Please use another value.`;
  return new AppError(message, 409);
};

const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors).map(el => ({
    field: el.path,
    message: el.message
  }));
  return new AppError('Validation failed', 400, errors);
};

const handleJWTError = () =>
  new AppError('Invalid authentication token. Please log in again.', 401);

const handleJWTExpiredError = () =>
  new AppError('Your session has expired. Please log in again.', 401);

const handleMulterError = (err) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return new AppError('File is too large. Maximum allowed image size is 5MB.', 400);
  }
  return new AppError(`File upload error: ${err.message}`, 400);
};

export const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  let error = { ...err };
  error.message = err.message;
  error.name = err.name;
  error.code = err.code;

  if (err.name === 'CastError') error = handleCastErrorDB(err);
  if (err.code === 11000) error = handleDuplicateFieldsDB(err);
  if (err.name === 'ValidationError') error = handleValidationErrorDB(err);
  if (err.name === 'JsonWebTokenError') error = handleJWTError();
  if (err.name === 'TokenExpiredError') error = handleJWTExpiredError();
  if (err.name === 'MulterError') error = handleMulterError(err);

  if (env.NODE_ENV === 'development' || env.NODE_ENV === 'test') {
    logger.error(`${req.method} ${req.originalUrl} - ${err.message}`, err);

    return res.status(error.statusCode || 500).json({
      success: false,
      status: error.status,
      message: error.message,
      details: error.details || null,
      stack: err.stack
    });
  }

  // Production Error Handling
  if (error.isOperational) {
    logger.warn(`${req.method} ${req.originalUrl} - Operational: ${error.message}`);
    return res.status(error.statusCode).json({
      success: false,
      status: error.status,
      message: error.message,
      details: error.details || null
    });
  }

  // Unknown / Non-operational error: don't leak details to client
  logger.error(`${req.method} ${req.originalUrl} - Unhandled Exception`, err);

  return res.status(500).json({
    success: false,
    status: 'error',
    message: 'An unexpected internal error occurred. Please try again later.'
  });
};
