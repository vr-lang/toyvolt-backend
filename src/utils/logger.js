const SENSITIVE_KEYS = new Set([
  'password',
  'currentpassword',
  'newpassword',
  'otp',
  'otphash',
  'secret',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'razorpay_key_secret',
  'shiprocket_password',
  'cloudinary_api_secret',
  'resend_api_key',
  'api_key',
  'apikey',
  'mongodb_uri',
  'cookie'
]);

export const sanitizeObject = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }

  const cleaned = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey)) {
      cleaned[key] = '***REDACTED***';
    } else if (typeof value === 'object' && value !== null) {
      cleaned[key] = sanitizeObject(value);
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
};

export const logger = {
  info: (message, meta) => {
    if (meta) {
      console.log(`[INFO] ${message}`, JSON.stringify(sanitizeObject(meta)));
    } else {
      console.log(`[INFO] ${message}`);
    }
  },
  warn: (message, meta) => {
    if (meta) {
      console.warn(`[WARN] ${message}`, JSON.stringify(sanitizeObject(meta)));
    } else {
      console.warn(`[WARN] ${message}`);
    }
  },
  error: (message, error) => {
    if (error instanceof Error) {
      console.error(`[ERROR] ${message}: ${error.message}`);
      if (process.env.NODE_ENV !== 'production' && error.stack) {
        console.error(error.stack);
      }
    } else if (error) {
      console.error(`[ERROR] ${message}`, JSON.stringify(sanitizeObject(error)));
    } else {
      console.error(`[ERROR] ${message}`);
    }
  }
};
