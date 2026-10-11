import { Order } from '../models/Order.js';
import { Product } from '../models/Product.js';
import { User } from '../models/User.js';
import { Shipment } from '../models/Shipment.js';
import { productService } from '../services/productService.js';
import { couponService } from '../services/couponService.js';
import { shiprocketService } from '../services/shiprocketService.js';
import { cloudinary, hasCloudinary } from '../config/cloudinary.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { paiseToRupees } from '../utils/money.js';

// ==========================================
// 1. Dashboard Metrics
// ==========================================
export const getDashboardMetrics = asyncHandler(async (req, res) => {
  const [
    totalOrders,
    paidRevenueAgg,
    pendingOrders,
    deliveredOrders,
    lowStockProducts,
    recentOrders
  ] = await Promise.all([
    Order.countDocuments(),
    Order.aggregate([
      { $match: { paymentStatus: 'paid' } },
      { $group: { _id: null, totalRevenue: { $sum: '$finalAmount' } } }
    ]),
    Order.countDocuments({ paymentStatus: 'pending', orderStatus: { $ne: 'cancelled' } }),
    Order.countDocuments({ orderStatus: 'delivered' }),
    Product.find({ availableStock: { $lte: 10 }, isArchived: false })
      .select('name sku availableStock sellingPrice images')
      .limit(10),
    Order.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('userId', 'name email')
  ]);

  const paidRevenuePaise = paidRevenueAgg[0]?.totalRevenue || 0;

  // Last 7 days sales aggregation
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const dailySales = await Order.aggregate([
    {
      $match: {
        paymentStatus: 'paid',
        createdAt: { $gte: sevenDaysAgo }
      }
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        revenue: { $sum: '$finalAmount' },
        orders: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  res.status(200).json({
    success: true,
    data: {
      metrics: {
        totalOrders,
        paidRevenue: paidRevenuePaise,
        paidRevenueInRupees: paiseToRupees(paidRevenuePaise),
        pendingOrders,
        deliveredOrders,
        lowStockCount: lowStockProducts.length
      },
      lowStockProducts,
      recentOrders,
      dailySales: dailySales.map(d => ({
        date: d._id,
        revenue: d.revenue,
        revenueInRupees: paiseToRupees(d.revenue),
        orders: d.orders
      }))
    }
  });
});

// ==========================================
// 2. Product Management
// ==========================================
export const getAdminProducts = asyncHandler(async (req, res) => {
  const result = await productService.getProducts({
    ...req.query,
    isAdmin: true
  });
  res.status(200).json({ success: true, data: result });
});

export const createProduct = asyncHandler(async (req, res) => {
  const product = await productService.createProduct(req.body);
  res.status(201).json({
    success: true,
    message: 'Product created successfully.',
    data: { product }
  });
});

export const updateProduct = asyncHandler(async (req, res) => {
  const product = await productService.updateProduct(req.params.id, req.body);
  res.status(200).json({
    success: true,
    message: 'Product updated successfully.',
    data: { product }
  });
});

export const deleteProduct = asyncHandler(async (req, res) => {
  const result = await productService.deleteProduct(req.params.id);
  res.status(200).json({
    success: true,
    message: result.message,
    data: { isArchived: result.isArchived }
  });
});

export const uploadProductImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError('Please select an image file to upload.', 400);
  }

  if (!hasCloudinary()) {
    // Graceful development fallback
    const mockUrl = `https://images.unsplash.com/photo-1594787318286-3d835c1d207f?auto=format&fit=crop&w=800&q=80`;
    return res.status(200).json({
      success: true,
      data: {
        url: mockUrl,
        publicId: `mock_upload_${Date.now()}`
      }
    });
  }

  // Upload to Cloudinary stream
  const uploadResult = await new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'toyvolt/products',
        transformation: [{ quality: 'auto', fetch_format: 'auto' }]
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    uploadStream.end(req.file.buffer);
  });

  res.status(200).json({
    success: true,
    data: {
      url: uploadResult.secure_url,
      publicId: uploadResult.public_id
    }
  });
});

// ==========================================
// 3. Order Management
// ==========================================
export const getAdminOrders = asyncHandler(async (req, res) => {
  const { status, paymentStatus, page = 1, limit = 20, search } = req.query;
  const filter = {};

  if (status) filter.orderStatus = status;
  if (paymentStatus) filter.paymentStatus = paymentStatus;
  if (search) {
    filter.$or = [
      { orderNumber: { $regex: search, $options: 'i' } },
      { 'shippingAddress.fullName': { $regex: search, $options: 'i' } },
      { 'shippingAddress.phone': { $regex: search, $options: 'i' } }
    ];
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate('userId', 'name email')
      .populate('shipmentId', 'awbCode status courierName'),
    Order.countDocuments(filter)
  ]);

  res.status(200).json({
    success: true,
    data: {
      orders,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum)
      }
    }
  });
});

export const getAdminOrderById = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate('userId', 'name email addresses')
    .populate('paymentId')
    .populate('shipmentId');

  if (!order) {
    throw new AppError('Order not found.', 404);
  }

  res.status(200).json({ success: true, data: { order } });
});

export const updateOrderStatus = asyncHandler(async (req, res) => {
  const { orderStatus, cancellationReason } = req.body;
  const order = await Order.findById(req.params.id);

  if (!order) {
    throw new AppError('Order not found.', 404);
  }

  order.orderStatus = orderStatus;
  if (cancellationReason) {
    order.cancellationReason = cancellationReason;
  }
  await order.save();

  res.status(200).json({
    success: true,
    message: `Order status updated to "${orderStatus}".`,
    data: { order }
  });
});

// ==========================================
// 4. Customer Management
// ==========================================
export const getAdminCustomers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search } = req.query;
  const filter = { role: 'customer' };

  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } }
    ];
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const [customers, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
    User.countDocuments(filter)
  ]);

  res.status(200).json({
    success: true,
    data: {
      customers,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum)
      }
    }
  });
});

export const updateCustomerStatus = asyncHandler(async (req, res) => {
  const { status } = req.body; // 'active' | 'suspended'
  if (!['active', 'suspended'].includes(status)) {
    throw new AppError('Status must be either "active" or "suspended".', 400);
  }

  const customer = await User.findOneAndUpdate(
    { _id: req.params.id, role: 'customer' },
    { accountStatus: status },
    { new: true }
  );

  if (!customer) {
    throw new AppError('Customer not found.', 404);
  }

  res.status(200).json({
    success: true,
    message: `Customer account is now ${status}.`,
    data: { customer }
  });
});

// ==========================================
// 5. Coupon Management
// ==========================================
export const getAdminCoupons = asyncHandler(async (req, res) => {
  const coupons = await couponService.getAllCoupons();
  res.status(200).json({ success: true, data: { coupons } });
});

export const createAdminCoupon = asyncHandler(async (req, res) => {
  const coupon = await couponService.createCoupon(req.body);
  res.status(201).json({
    success: true,
    message: 'Coupon created successfully.',
    data: { coupon }
  });
});

export const updateAdminCoupon = asyncHandler(async (req, res) => {
  const coupon = await couponService.updateCoupon(req.params.id, req.body);
  res.status(200).json({
    success: true,
    message: 'Coupon updated successfully.',
    data: { coupon }
  });
});

// ==========================================
// 6. Shipment Management
// ==========================================
export const getAdminShipments = asyncHandler(async (req, res) => {
  const shipments = await Shipment.find().sort({ createdAt: -1 }).populate('orderId');
  res.status(200).json({ success: true, data: { shipments } });
});

export const createAdminShipment = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const shipment = await shiprocketService.createShipmentForOrder(orderId);

  res.status(201).json({
    success: true,
    message: 'Shipment created and scheduled successfully.',
    data: { shipment }
  });
});

export const getAdminShipmentByOrderId = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const shipment = await Shipment.findOne({ orderId }).populate('orderId');

  if (!shipment) {
    throw new AppError('Shipment not found for this order.', 404);
  }

  res.status(200).json({ success: true, data: { shipment } });
});

// ==========================================
// 7. Sales Analytics
// ==========================================
export const getSalesAnalytics = asyncHandler(async (req, res) => {
  const { timeframe = '30d' } = req.query;

  const startDate = new Date();
  if (timeframe === '7d') startDate.setDate(startDate.getDate() - 7);
  else if (timeframe === '90d') startDate.setDate(startDate.getDate() - 90);
  else startDate.setDate(startDate.getDate() - 30); // default 30d

  const salesData = await Order.aggregate([
    {
      $match: {
        paymentStatus: 'paid',
        createdAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        totalRevenue: { $sum: '$finalAmount' },
        totalOrders: { $sum: 1 },
        averageOrderValue: { $avg: '$finalAmount' }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  const summary = salesData.reduce(
    (acc, curr) => {
      acc.totalRevenue += curr.totalRevenue;
      acc.totalOrders += curr.totalOrders;
      return acc;
    },
    { totalRevenue: 0, totalOrders: 0 }
  );

  res.status(200).json({
    success: true,
    data: {
      timeframe,
      summary: {
        totalRevenue: summary.totalRevenue,
        totalRevenueInRupees: paiseToRupees(summary.totalRevenue),
        totalOrders: summary.totalOrders,
        averageOrderValueInRupees: summary.totalOrders > 0
          ? paiseToRupees(Math.round(summary.totalRevenue / summary.totalOrders))
          : 0
      },
      dailyData: salesData.map(d => ({
        date: d._id,
        revenue: d.totalRevenue,
        revenueInRupees: paiseToRupees(d.totalRevenue),
        orders: d.totalOrders,
        averageOrderValueInRupees: paiseToRupees(Math.round(d.averageOrderValue))
      }))
    }
  });
});
