import multer from 'multer';
import { AppError } from '../utils/AppError.js';

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  // Initial MIME-type check before reading buffer
  if (['image/jpeg', 'image/png', 'image/webp', 'image/jpg'].includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError('Only JPEG, PNG, and WebP images are allowed for product reviews.', 400), false);
  }
};

const multerInstance = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB max per file
    files: 5 // max 5 files
  },
  fileFilter
}).array('images', 5);

export const uploadReviewImages = (req, res, next) => {
  multerInstance(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError('Review image size cannot exceed 5MB.', 400));
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return next(new AppError('You can upload a maximum of 5 images per review.', 400));
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return next(new AppError('Unexpected field for image upload. Use "images".', 400));
      }
      return next(new AppError(err.message, 400));
    } else if (err) {
      return next(err);
    }
    next();
  });
};
