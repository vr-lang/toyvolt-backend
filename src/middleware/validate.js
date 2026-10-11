import { AppError } from '../utils/AppError.js';

export const validate = (schema) => {
  return (req, res, next) => {
    try {
      const dataToValidate = {};
      if (schema.body) dataToValidate.body = req.body;
      if (schema.query) dataToValidate.query = req.query;
      if (schema.params) dataToValidate.params = req.params;

      const parsed = schema.parse ? schema.parse(req.body) : null;
      if (parsed) {
        req.body = parsed;
      }
      next();
    } catch (error) {
      if (error.errors) {
        const errorDetails = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message
        }));
        return next(new AppError('Validation failed', 400, errorDetails));
      }
      next(error);
    }
  };
};

/**
 * Validates specific parts: { body, query, params }
 */
export const validateRequest = ({ body, query, params }) => {
  return (req, res, next) => {
    try {
      if (body) {
        req.body = body.parse(req.body);
      }
      if (query) {
        req.query = query.parse(req.query);
      }
      if (params) {
        req.params = params.parse(req.params);
      }
      next();
    } catch (error) {
      if (error.errors) {
        const errorDetails = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message
        }));
        return next(new AppError('Validation failed', 400, errorDetails));
      }
      next(error);
    }
  };
};
