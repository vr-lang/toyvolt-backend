import multer from 'multer';
import { AppError } from '../utils/AppError.js';

// Memory storage so files can be directly uploaded to Cloudinary
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new AppError('Only image files (JPEG, PNG, WEBP, AVIF) are allowed.', 400), false);
  }
};

export const uploadProductImage = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5 MB max
  },
  fileFilter
});
