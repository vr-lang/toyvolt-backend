import { Router } from 'express';
import {
  getDashboardMetrics,
  getAdminProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  uploadProductImage,
  getAdminOrders,
  getAdminOrderById,
  updateOrderStatus,
  getAdminCustomers,
  updateCustomerStatus,
  getAdminCoupons,
  createAdminCoupon,
  updateAdminCoupon,
  getAdminShipments,
  createAdminShipment,
  getAdminShipmentByOrderId,
  getSalesAnalytics
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

const router = Router();

// Protect entire admin namespace: must be authenticated and have role === 'admin'
router.use(protect, requireAdmin);

// 1. Dashboard & Analytics
router.get('/dashboard', getDashboardMetrics);
router.get('/analytics/sales', getSalesAnalytics);

// 2. Product Management
router.get('/products', getAdminProducts);
router.post('/products', validate(createProductSchema), createProduct);
router.patch('/products/:id', validate(updateProductSchema), updateProduct);
router.delete('/products/:id', deleteProduct);
router.post('/upload', multerUpload.single('image'), uploadProductImage);

// 3. Order Management
router.get('/orders', getAdminOrders);
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
router.post('/shipments/:orderId/create', createAdminShipment);
router.get('/shipments/:orderId', getAdminShipmentByOrderId);

export default router;
