/**
 * Validates image buffers against known magic byte signatures
 * to prevent spoofed file extensions and malicious uploads.
 */

export const detectImageFormat = (buffer) => {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 12) {
    return null;
  }

  // 1. JPEG / JPG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // 2. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // 3. WebP: RIFF .... WEBP
  if (
    buffer.toString('binary', 0, 4) === 'RIFF' &&
    buffer.toString('binary', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
};

export const isValidReviewImageBuffer = (buffer) => {
  const mime = detectImageFormat(buffer);
  return mime !== null;
};
