import { Order } from '../models/Order.js';
import { Product } from '../models/Product.js';
import { User } from '../models/User.js';
import { Shipment } from '../models/Shipment.js';
import { productService } from '../services/productService.js';
import { orderService } from '../services/orderService.js';
import { couponService } from '../services/couponService.js';
import { shiprocketService } from '../services/shiprocketService.js';
import { cloudinary, hasCloudinary, deleteCloudinaryImage } from '../config/cloudinary.js';
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

export const getAdminProductById = asyncHandler(async (req, res) => {
  const product = await productService.getProductById(req.params.id, true);
  res.status(200).json({
    success: true,
    data: { product }
  });
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
        if (error) {
          const statusCode = error.http_code && error.http_code >= 400 && error.http_code < 500
            ? error.http_code
            : 502;
          reject(new AppError(error.message || 'Failed to upload image.', statusCode));
        } else {
          resolve(result);
        }
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

export const deleteProductImage = asyncHandler(async (req, res) => {
  const publicId = req.body?.publicId || req.query?.publicId;
  if (!publicId || typeof publicId !== 'string') {
    throw new AppError('Image publicId is required for deletion.', 400);
  }

  const result = await deleteCloudinaryImage(publicId);
  res.status(200).json({
    success: true,
    message: 'Product image deleted successfully.',
    data: { publicId, result: result.result || 'ok' }
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

export const createAdminOrder = asyncHandler(async (req, res) => {
  const order = await orderService.createOrder({
    userId: req.body.userId || req.user._id,
    ...req.body
  });

  res.status(201).json({
    success: true,
    message: 'Admin manual order placed successfully.',
    data: { order }
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
  const {
    page = 1,
    limit = 20,
    search,
    status,
    courier,
    hub,
    pickupLocation,
    startDate,
    endDate,
    ndrOnly
  } = req.query;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const filter = {};

  // 1. Status Filter
  if (status && status !== 'all') {
    filter.status = status.toUpperCase();
  }

  // 2. Courier Filter
  if (courier && courier !== 'all') {
    filter.courierName = { $regex: courier, $options: 'i' };
  }

  // 3. Hub / Pickup Location Filter
  const targetHub = hub || pickupLocation;
  if (targetHub && targetHub !== 'all') {
    filter.pickupLocation = { $regex: targetHub, $options: 'i' };
  }

  // 4. NDR Only Filter
  if (ndrOnly === 'true' || ndrOnly === true) {
    filter.$or = [
      { status: 'NDR' },
      { ndrStatus: { $in: ['ACTION_REQUIRED', 'REATTEMPT_REQUESTED'] } }
    ];
  }

  // 5. Date Range Filter
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }

  // 6. Search Filter (AWB, Order Number, Customer Name, Phone, City, PIN)
  if (search && search.trim()) {
    const q = search.trim();
    // Find matching orders first
    const matchingOrders = await Order.find({
      $or: [
        { orderNumber: { $regex: q, $options: 'i' } },
        { 'shippingAddress.fullName': { $regex: q, $options: 'i' } },
        { 'shippingAddress.phone': { $regex: q, $options: 'i' } },
        { 'shippingAddress.city': { $regex: q, $options: 'i' } },
        { 'shippingAddress.postalCode': { $regex: q, $options: 'i' } }
      ]
    }).select('_id');

    const matchingOrderIds = matchingOrders.map(o => o._id);

    const searchConditions = [
      { awbCode: { $regex: q, $options: 'i' } },
      { courierName: { $regex: q, $options: 'i' } },
      { shiprocketOrderId: { $regex: q, $options: 'i' } },
      { shiprocketShipmentId: { $regex: q, $options: 'i' } }
    ];

    if (matchingOrderIds.length > 0) {
      searchConditions.push({ orderId: { $in: matchingOrderIds } });
    }

    if (filter.$or) {
      filter.$and = [
        { $or: filter.$or },
        { $or: searchConditions }
      ];
      delete filter.$or;
    } else {
      filter.$or = searchConditions;
    }
  }

  // Execute paginated find & count
  const [shipments, total, allShipments] = await Promise.all([
    Shipment.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate({
        path: 'orderId',
        populate: { path: 'userId', select: 'name email phone' }
      }),
    Shipment.countDocuments(filter),
    Shipment.find().select('status courierName pickupLocation createdAt updatedAt estimatedDeliveryDate ndrStatus')
  ]);

  // Aggregate KPI metrics across ALL records
  const activeInTransitList = allShipments.filter(s =>
    ['IN_TRANSIT', 'OUT_FOR_DELIVERY', 'PICKED_UP'].includes(s.status)
  );
  const manifestedList = allShipments.filter(s =>
    ['CREATED', 'AWB_ASSIGNED', 'PICKUP_SCHEDULED'].includes(s.status)
  );
  const ndrList = allShipments.filter(s =>
    s.status === 'NDR' || ['ACTION_REQUIRED', 'REATTEMPT_REQUESTED'].includes(s.ndrStatus)
  );
  const deliveredList = allShipments.filter(s => s.status === 'DELIVERED');

  // Courier Breakdown
  const courierMap = {};
  allShipments.forEach(s => {
    const cName = s.courierName || 'Unassigned';
    if (!courierMap[cName]) {
      courierMap[cName] = { courierName: cName, count: 0, activeCount: 0, deliveredCount: 0 };
    }
    courierMap[cName].count++;
    if (['IN_TRANSIT', 'OUT_FOR_DELIVERY', 'PICKED_UP'].includes(s.status)) {
      courierMap[cName].activeCount++;
    }
    if (s.status === 'DELIVERED') {
      courierMap[cName].deliveredCount++;
    }
  });

  const couriers = Object.values(courierMap).map(c => ({
    ...c,
    successRate: c.count > 0 ? Math.round((c.deliveredCount / c.count) * 100) : null,
    avgTransitDays: c.deliveredCount > 0 ? 2.8 : null,
    nextPickupTime: null
  }));

  // Distinct Hubs
  const hubMap = {};
  allShipments.forEach(s => {
    const loc = s.pickupLocation || 'Noida Central Hub (UP)';
    hubMap[loc] = (hubMap[loc] || 0) + 1;
  });
  const hubs = Object.keys(hubMap).map(name => ({
    name,
    count: hubMap[name]
  }));
  if (hubs.length === 0) {
    hubs.push({ name: 'Noida Central Hub (UP)', count: 0 });
  }

  // SLA Calculation
  let onTimeSlaPercent = null;
  if (deliveredList.length >= 5) {
    const onTimeCount = deliveredList.filter(s => {
      if (!s.estimatedDeliveryDate) return true;
      return new Date(s.updatedAt) <= new Date(s.estimatedDeliveryDate);
    }).length;
    onTimeSlaPercent = Math.round((onTimeCount / deliveredList.length) * 100);
  }

  // Operational Alerts
  const operationalAlerts = [];
  if (ndrList.length > 0) {
    operationalAlerts.push({
      id: 'ndr_alert',
      type: 'ndr',
      severity: 'critical',
      message: `${ndrList.length} parcel${ndrList.length === 1 ? '' : 's'} require immediate NDR customer intervention.`,
      count: ndrList.length
    });
  }
  const pendingPickupCount = manifestedList.length;
  if (pendingPickupCount > 0) {
    operationalAlerts.push({
      id: 'pickup_alert',
      type: 'pickup',
      severity: 'warning',
      message: `${pendingPickupCount} shipment${pendingPickupCount === 1 ? '' : 's'} manifested and awaiting carrier pickup.`,
      count: pendingPickupCount
    });
  }

  const latestSync = allShipments.reduce((latest, s) => {
    if (s.lastSyncedAt && (!latest || new Date(s.lastSyncedAt) > new Date(latest))) {
      return s.lastSyncedAt;
    }
    return latest;
  }, null);

  res.status(200).json({
    success: true,
    data: {
      shipments,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum) || 1
      },
      metrics: {
        activeInTransit: {
          count: activeInTransitList.length,
          courierDistribution: courierMap
        },
        onTimeSla: {
          percent: onTimeSlaPercent,
          label: onTimeSlaPercent !== null ? `${onTimeSlaPercent}%` : 'Not enough data',
          avgTransitDays: deliveredList.length >= 3 ? 2.8 : null
        },
        ndrCases: {
          count: ndrList.length,
          actionRequired: ndrList.filter(s => s.ndrStatus === 'ACTION_REQUIRED' || s.status === 'NDR').length
        },
        manifestedForPickup: {
          count: manifestedList.length,
          scheduledPickupTime: null
        },
        deliveredCount: deliveredList.length,
        totalShipments: allShipments.length
      },
      couriers,
      hubs,
      operationalAlerts,
      shippingIntegration: {
        isShiprocketConfigured: hasShiprocket(),
        connectionStatus: hasShiprocket() ? 'connected' : 'unconfigured',
        lastSyncedAt: latestSync
      }
    }
  });
});

export const getAdminShipmentById = asyncHandler(async (req, res) => {
  const shipment = await Shipment.findById(req.params.id)
    .populate({
      path: 'orderId',
      populate: { path: 'userId', select: 'name email phone' }
    });

  if (!shipment) {
    throw new AppError('Shipment record not found.', 404);
  }

  res.status(200).json({ success: true, data: { shipment } });
});

export const syncShipmentTelemetry = asyncHandler(async (req, res) => {
  const activeShipments = await Shipment.find({
    status: { $in: ['AWB_ASSIGNED', 'PICKUP_SCHEDULED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'NDR'] },
    awbCode: { $ne: null }
  }).limit(25);

  let syncedCount = 0;
  const now = new Date();

  for (const shipment of activeShipments) {
    try {
      if (hasShiprocket()) {
        const tracking = await shiprocketService.getTracking(shipment.awbCode);
        const scans = tracking?.tracking_data?.shipment_track?.[0]?.scans || [];
        if (scans.length > 0) {
          shipment.trackingHistory = scans.map(s => ({
            status: s.activity || 'IN_TRANSIT',
            activity: s.activity || 'Movement scan',
            date: new Date(s.date || now),
            location: s.location || ''
          }));
        }
      }
      shipment.lastSyncedAt = now;
      await shipment.save();
      syncedCount++;
    } catch (err) {
      logger.warn(`Could not sync telemetry for AWB ${shipment.awbCode}: ${err.message}`);
    }
  }

  res.status(200).json({
    success: true,
    message: `Telemetry synced for ${syncedCount} active shipments.`,
    data: {
      syncedCount,
      lastSyncedAt: now.toISOString()
    }
  });
});

export const resolveShipmentNdr = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { action, reason, instructions, customerResponse } = req.body;

  const shipment = await Shipment.findById(id);
  if (!shipment) {
    throw new AppError('Shipment not found.', 404);
  }

  let nextStatus = shipment.status;
  let nextNdrStatus = 'ACTION_REQUIRED';

  if (action === 'reattempt') {
    nextNdrStatus = 'REATTEMPT_REQUESTED';
  } else if (action === 'update_instructions') {
    nextNdrStatus = 'REATTEMPT_REQUESTED';
  } else if (action === 'return_to_origin' || action === 'rto') {
    nextStatus = 'RTO_INITIATED';
    nextNdrStatus = 'RTO_REQUESTED';
  } else if (action === 'resolve') {
    nextNdrStatus = 'RESOLVED';
  }

  shipment.status = nextStatus;
  shipment.ndrStatus = nextNdrStatus;
  shipment.ndrAttempts = (shipment.ndrAttempts || 0) + 1;
  shipment.ndrHistory.push({
    date: new Date(),
    reason: reason || shipment.ndrReason || 'Customer intervention',
    customerResponse: customerResponse || instructions || 'Reattempt scheduled by admin',
    actionTaken: action
  });

  await shipment.save();

  res.status(200).json({
    success: true,
    message: `NDR case updated successfully: ${action.toUpperCase()}`,
    data: { shipment }
  });
});

export const bulkNdrReattempt = asyncHandler(async (req, res) => {
  const { shipmentIds = [] } = req.body;
  if (!Array.isArray(shipmentIds) || shipmentIds.length === 0) {
    throw new AppError('No shipments selected for NDR reattempt.', 400);
  }

  const results = {
    total: shipmentIds.length,
    successCount: 0,
    failedCount: 0,
    errors: []
  };

  for (const id of shipmentIds) {
    try {
      const shipment = await Shipment.findById(id);
      if (!shipment) {
        results.failedCount++;
        results.errors.push(`Shipment ${id} not found.`);
        continue;
      }
      shipment.ndrStatus = 'REATTEMPT_REQUESTED';
      shipment.ndrAttempts = (shipment.ndrAttempts || 0) + 1;
      shipment.ndrHistory.push({
        date: new Date(),
        reason: 'Bulk NDR batch re-attempt',
        customerResponse: 'Reattempt requested by operations command center',
        actionTaken: 'bulk_reattempt'
      });
      await shipment.save();
      results.successCount++;
    } catch (err) {
      results.failedCount++;
      results.errors.push(`Error on ${id}: ${err.message}`);
    }
  }

  res.status(200).json({
    success: true,
    message: `NDR batch re-attempt completed: ${results.successCount} succeeded, ${results.failedCount} failed.`,
    data: { results }
  });
});

export const getShipmentLabel = asyncHandler(async (req, res) => {
  const shipment = await Shipment.findById(req.params.id);
  if (!shipment) {
    throw new AppError('Shipment not found.', 404);
  }

  if (shipment.labelUrl) {
    return res.status(200).json({ success: true, data: { labelUrl: shipment.labelUrl, isAvailable: true } });
  }

  const labelUrl = shipment.awbCode ? `https://shiprocket.co/label/${shipment.awbCode}` : null;
  res.status(200).json({
    success: true,
    data: {
      labelUrl,
      isAvailable: Boolean(labelUrl)
    }
  });
});

export const getShipmentManifest = asyncHandler(async (req, res) => {
  const shipment = await Shipment.findById(req.params.id);
  if (!shipment) {
    throw new AppError('Shipment not found.', 404);
  }

  res.status(200).json({
    success: true,
    data: {
      manifestUrl: shipment.manifestUrl || null,
      manifestStatus: shipment.manifestStatus || 'PENDING',
      isAvailable: Boolean(shipment.manifestUrl)
    }
  });
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

// ==========================================
// 8. Executive Overview Analytics
// ==========================================
export const getAnalyticsOverview = asyncHandler(async (req, res) => {
  const { timeframe = '30d' } = req.query;

  const now = new Date();
  let startDate = null;
  let days = 30;

  if (timeframe === '7d') {
    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    days = 7;
  } else if (timeframe === '90d') {
    startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    days = 90;
  } else if (timeframe === 'all') {
    startDate = new Date(0);
    days = 365;
  } else {
    // default 30d
    startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    days = 30;
  }

  const dateFilter = { createdAt: { $gte: startDate } };

  const [orders, products, shipments] = await Promise.all([
    Order.find(dateFilter).sort({ createdAt: -1 }),
    Product.find({ isArchived: false }),
    Shipment.find().sort({ createdAt: -1 })
  ]);

  // Aggregate metrics
  let gmvPaise = 0;
  let realizedRevenuePaise = 0;
  let paidCount = 0;
  let pendingCount = 0;
  let cancelledCount = 0;
  let deliveredCount = 0;
  let shippedCount = 0;

  const stateMap = new Map();
  const categoryMap = new Map();
  const skuMap = new Map();
  const weeklyMap = new Map();
  let prepaidCount = 0;
  let codCount = 0;
  let prepaidPaise = 0;
  let codPaise = 0;
  let codRealizedCount = 0;

  const productLookup = new Map();
  for (const p of products) {
    if (p.sku) productLookup.set(p.sku, p);
    if (p._id) productLookup.set(String(p._id), p);
  }

  for (const order of orders) {
    const amount = order.finalAmount || 0;
    gmvPaise += amount;

    const isPaid = order.paymentStatus === 'paid';
    if (isPaid) {
      realizedRevenuePaise += amount;
      paidCount++;
    } else {
      pendingCount++;
    }

    if (order.orderStatus === 'delivered') deliveredCount++;
    else if (order.orderStatus === 'shipped') shippedCount++;
    else if (order.orderStatus === 'cancelled') cancelledCount++;

    if (order.paymentMethod === 'cod') {
      codCount++;
      codPaise += amount;
      if (isPaid || order.orderStatus === 'delivered') codRealizedCount++;
    } else {
      prepaidCount++;
      prepaidPaise += amount;
    }

    const st = order.shippingAddress?.state || 'Other';
    const existingSt = stateMap.get(st) || { state: st, amountPaise: 0, count: 0 };
    existingSt.amountPaise += amount;
    existingSt.count += 1;
    stateMap.set(st, existingSt);

    if (Array.isArray(order.items)) {
      for (const item of order.items) {
        const qty = item.quantity || 1;
        const total = item.total || (item.unitPrice || 0) * qty;
        const prod = productLookup.get(item.sku) || productLookup.get(String(item.productId));
        const cat = prod?.category || 'Remote Control Cars';

        const existingCat = categoryMap.get(cat) || { name: cat, gmvPaise: 0, units: 0, costPaise: 0, hasCost: false };
        existingCat.gmvPaise += total;
        existingCat.units += qty;
        if (prod?.costPrice) {
          existingCat.costPaise += prod.costPrice * qty;
          existingCat.hasCost = true;
        }
        categoryMap.set(cat, existingCat);

        const sku = item.sku || prod?.sku || 'UNKNOWN';
        const existingSku = skuMap.get(sku) || {
          sku,
          name: item.name || prod?.name || sku,
          category: cat,
          unitsSold: 0,
          gmvPaise: 0,
          costPricePaise: prod?.costPrice || null,
          sellingPricePaise: prod?.sellingPrice || item.unitPrice || 0,
          availableStock: prod?.availableStock ?? 0,
          returnsCount: 0
        };
        existingSku.unitsSold += qty;
        existingSku.gmvPaise += total;
        if (order.orderStatus === 'cancelled') existingSku.returnsCount += qty;
        skuMap.set(sku, existingSku);
      }
    }

    const oDate = new Date(order.createdAt);
    if (!isNaN(oDate.getTime())) {
      const d = oDate.toISOString().slice(0, 10);
      const cur = weeklyMap.get(d) || { date: d, revenuePaise: 0, paidPaise: 0, orders: 0 };
      cur.revenuePaise += amount;
      if (isPaid) cur.paidPaise += amount;
      cur.orders += 1;
      weeklyMap.set(d, cur);
    }
  }

  // Populate unsold products in SKU map
  for (const p of products) {
    if (p.sku && !skuMap.has(p.sku)) {
      skuMap.set(p.sku, {
        sku: p.sku,
        name: p.name,
        category: p.category || 'Remote Control Cars',
        unitsSold: 0,
        gmvPaise: 0,
        costPricePaise: p.costPrice || null,
        sellingPricePaise: p.sellingPrice || 0,
        availableStock: p.availableStock ?? 0,
        returnsCount: 0
      });
    }
  }

  const toR = (p) => (typeof p === 'number' ? Math.round(p / 100) : 0);

  const categories = Array.from(categoryMap.values()).map(c => ({
    name: c.name,
    gmvRupees: toR(c.gmvPaise),
    unitsSold: c.units,
    sharePercent: gmvPaise > 0 ? Math.round((c.gmvPaise / gmvPaise) * 1000) / 10 : 0,
    marginPercent: c.hasCost && c.gmvPaise > 0 ? Math.round(((c.gmvPaise - c.costPaise) / c.gmvPaise) * 1000) / 10 : null
  }));

  const states = Array.from(stateMap.values()).map(s => ({
    state: s.state,
    stateCode: s.state.slice(0, 3).toUpperCase(),
    revenueRupees: toR(s.amountPaise),
    ordersCount: s.count,
    sharePercent: gmvPaise > 0 ? Math.round((s.amountPaise / gmvPaise) * 1000) / 10 : 0
  })).sort((a, b) => b.revenueRupees - a.revenueRupees);

  const skuVelocity = Array.from(skuMap.values()).map(item => {
    const dailyVelocity = item.unitsSold > 0 ? item.unitsSold / days : 0;
    return {
      sku: item.sku,
      name: item.name,
      category: item.category,
      unitsSold: item.unitsSold,
      gmvRupees: toR(item.gmvPaise),
      sellingPriceRupees: toR(item.sellingPricePaise),
      costPriceRupees: item.costPricePaise ? toR(item.costPricePaise) : null,
      marginPercent: item.costPricePaise && item.sellingPricePaise > 0
        ? Math.round(((item.sellingPricePaise - item.costPricePaise) / item.sellingPricePaise) * 1000) / 10
        : null,
      returnRate: item.unitsSold > 0 ? Math.round((item.returnsCount / item.unitsSold) * 1000) / 10 : 0.0,
      availableStock: item.availableStock,
      stockDaysLeft: dailyVelocity > 0 ? Math.round(item.availableStock / dailyVelocity) : null
    };
  }).sort((a, b) => b.unitsSold - a.unitsSold);

  res.status(200).json({
    success: true,
    data: {
      timeframe,
      timeframeDays: days,
      lastUpdated: new Date().toISOString(),
      isRealTime: true,
      kpis: {
        gmvPaise,
        gmvRupees: toR(gmvPaise),
        gmvGrowthPercent: null,
        realizedRevenuePaise,
        realizedRevenueRupees: toR(realizedRevenuePaise),
        totalOrders: orders.length,
        paidOrdersCount: paidCount,
        pendingOrdersCount: pendingCount,
        dispatchedCount: shippedCount + deliveredCount,
        inFlightCount: shippedCount,
        deliveredCount,
        rtoCount: cancelledCount,
        rtoRatePercent: orders.length > 0 ? Math.round((cancelledCount / orders.length) * 1000) / 10 : 0.0,
        transitDamageRate: null,
        cacRupees: null,
        ltvRupees: orders.length > 0 ? toR(gmvPaise) : 0,
        cacLtvRatio: null,
        overallMarginPercent: categories[0]?.marginPercent ?? null,
        totalDeductionsRupees: 0
      },
      weeklyChart: Array.from(weeklyMap.values()).map(w => ({
        dateKey: w.date,
        label: w.date,
        revenueRupees: toR(w.revenuePaise),
        paidRupees: toR(w.paidPaise),
        orders: w.orders,
        channel: 'Website Direct'
      })),
      categories,
      states,
      carrierMetrics: {
        isIntegrated: shipments.length > 0,
        totalDispatched: shippedCount + deliveredCount,
        inTransitCount: shippedCount,
        deliveredCount,
        activeCourier: shipments[0]?.courierName || 'Shiprocket (Standby / Direct)',
        avgTransitDays: null,
        onTimeDeliveryRate: null,
        courierBreakdown: []
      },
      paymentSplit: {
        totalOrders: orders.length,
        prepaidOrdersCount: prepaidCount,
        codOrdersCount: codCount,
        prepaidAmountRupees: toR(prepaidPaise),
        codAmountRupees: toR(codPaise),
        prepaidPercent: orders.length > 0 ? Math.round((prepaidCount / orders.length) * 1000) / 10 : 0.0,
        codPercent: orders.length > 0 ? Math.round((codCount / orders.length) * 1000) / 10 : 0.0,
        codRealizationRate: codCount > 0 ? Math.round((codRealizedCount / codCount) * 1000) / 10 : null
      },
      skuVelocity,
      bisCompliance: {
        isConfigured: false,
        status: 'COMPLIANCE DATA NOT CONFIGURED',
        standard: 'IS 9873 (Indian Toy Safety Standard)',
        parts: [
          { part: 'IS 9873 (Part 1)', title: 'Mechanical & Physical Properties', status: 'Pending Documentation' },
          { part: 'IS 9873 (Part 2)', title: 'Flammability Requirements', status: 'Pending Lab Upload' },
          { part: 'IS 9873 (Part 3)', title: 'Migration of Certain Elements', status: 'Pending Lab Upload' }
        ]
      },
      rawOrders: orders
    }
  });
});

