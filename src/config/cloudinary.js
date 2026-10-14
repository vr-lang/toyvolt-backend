import { v2 as cloudinary } from 'cloudinary';
import { env, hasCloudinary } from './env.js';
import { logger } from '../utils/logger.js';

if (hasCloudinary()) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET
  });
}

/**
 * Safely deletes an asset from Cloudinary by publicId.
 * Skips mock or empty publicIds and logs warnings without throwing if remote deletion fails.
 */
export const deleteCloudinaryImage = async (publicId) => {
  if (!publicId || typeof publicId !== 'string' || publicId.startsWith('mock_upload_')) {
    return { result: 'skipped' };
  }

  if (!hasCloudinary()) {
    return { result: 'mock_deleted' };
  }

  try {
    const res = await cloudinary.uploader.destroy(publicId);
    return res;
  } catch (error) {
    logger.warn(`Failed to delete Cloudinary image (${publicId}): ${error.message}`);
    return { result: 'error', message: error.message };
  }
};

export { cloudinary, hasCloudinary };

