import { Router } from 'express';
import {
  getDashboardMetrics,
  getAdminProducts,
  getAdminProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  uploadProductImage,
  deleteProductImage,
  getAdminOrders,
  getAdminOrderById,
  updateOrderStatus,
  createAdminOrder,
  getAdminCustomers,
  updateCustomerStatus,
  getAdminCoupons,
  createAdminCoupon,
  updateAdminCoupon,
  getAdminShipments,
  getAdminShipmentById,
  createAdminShipment,
  getAdminShipmentByOrderId,
  syncShipmentTelemetry,
  resolveShipmentNdr,
  bulkNdrReattempt,
  getShipmentLabel,
  getShipmentManifest,
  getSalesAnalytics,
  getAnalyticsOverview
} from '../controllers/adminController.js';
import { protect } from '../middleware/authMiddleware.js';
import { requireAdmin } from '../middleware/adminMiddleware.js';
import { validate } from '../middleware/validate.js';
import { uploadProductImage as multerUpload } from '../middleware/uploadMiddleware.js';
import {
  createProductSchema,
  updateProductSchema
} from '../validators/productValidator.js';
import { updateOrderStatusSchema } from '../validators/orderValidator.js';
import {
  createCouponSchema,
  updateCouponSchema
} from '../validators/couponValidator.js';
import {
  getAdminReviews,
  updateAdminReviewStatus,
  replyAdminReview,
  deleteAdminReview
} from '../controllers/reviewController.js';
import {
  updateReviewStatusSchema,
  replyReviewSchema
} from '../validators/reviewValidator.js';

const router = Router();

// Protect entire admin namespace: must be authenticated and have role === 'admin'
router.use(protect, requireAdmin);

// 1. Dashboard & Analytics
router.get('/dashboard', getDashboardMetrics);
router.get('/analytics/sales', getSalesAnalytics);
router.get('/analytics/overview', getAnalyticsOverview);

// 2. Product Management
router.get('/products', getAdminProducts);
router.get('/products/:id', getAdminProductById);
router.post('/products', validate(createProductSchema), createProduct);
router.put('/products/:id', validate(updateProductSchema), updateProduct);
router.patch('/products/:id', validate(updateProductSchema), updateProduct);
router.delete('/products/:id', deleteProduct);
router.post('/upload', multerUpload.single('image'), uploadProductImage);
router.delete('/upload', deleteProductImage);

// 3. Order Management
router.get('/orders', getAdminOrders);
router.post('/orders', createAdminOrder);
router.get('/orders/:id', getAdminOrderById);
router.patch('/orders/:id/status', validate(updateOrderStatusSchema), updateOrderStatus);

// 4. Customer Management
router.get('/customers', getAdminCustomers);
router.patch('/customers/:id/status', updateCustomerStatus);

// 5. Coupon Management
router.get('/coupons', getAdminCoupons);
router.post('/coupons', validate(createCouponSchema), createAdminCoupon);
router.patch('/coupons/:id', validate(updateCouponSchema), updateAdminCoupon);

// 6. Shipment Management
router.get('/shipments', getAdminShipments);
router.post('/shipments/sync', syncShipmentTelemetry);
router.post('/shipments/bulk/ndr-reattempt', bulkNdrReattempt);
router.post('/shipments/:orderId/create', createAdminShipment);
router.get('/shipments/order/:orderId', getAdminShipmentByOrderId);
router.get('/shipments/:id', getAdminShipmentById);
router.get('/shipments/:id/label', getShipmentLabel);
router.get('/shipments/:id/manifest', getShipmentManifest);
router.post('/shipments/:id/ndr/resolve', resolveShipmentNdr);

// 7. Review Moderation
router.get('/reviews', getAdminReviews);
router.patch('/reviews/:id/status', validate(updateReviewStatusSchema), updateAdminReviewStatus);
router.post('/reviews/:id/reply', validate(replyReviewSchema), replyAdminReview);
router.delete('/reviews/:id', deleteAdminReview);

export default router;
