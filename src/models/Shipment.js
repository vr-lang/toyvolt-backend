import mongoose from 'mongoose';

const trackingEventSchema = new mongoose.Schema({
  status: { type: String, required: true },
  activity: { type: String, required: true },
  date: { type: Date, required: true },
  location: { type: String, default: '' }
}, { _id: false });

const shipmentSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    index: true
  },
  shiprocketOrderId: {
    type: String,
    required: true,
    index: true
  },
  shiprocketShipmentId: {
    type: String,
    default: null,
    index: true
  },
  awbCode: {
    type: String,
    default: null,
    index: true
  },
  courierName: {
    type: String,
    default: null
  },
  courierCompanyId: {
    type: String,
    default: null
  },
  pickupLocation: {
    type: String,
    default: 'Primary'
  },
  status: {
    type: String,
    enum: [
      'CREATED',
      'AWB_ASSIGNED',
      'PICKUP_SCHEDULED',
      'PICKED_UP',
      'IN_TRANSIT',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
      'NDR',
      'CANCELLED',
      'RTO_INITIATED',
      'RTO_DELIVERED'
    ],
    default: 'CREATED',
    index: true
  },
  trackingUrl: {
    type: String,
    default: null
  },
  labelUrl: {
    type: String,
    default: null
  },
  manifestUrl: {
    type: String,
    default: null
  },
  manifestStatus: {
    type: String,
    enum: ['PENDING', 'MANIFESTED', 'HANDED_OVER'],
    default: 'PENDING'
  },
  weightKg: {
    type: Number,
    default: 0.85
  },
  dimensions: {
    length: { type: Number, default: 15 },
    breadth: { type: Number, default: 10 },
    height: { type: Number, default: 10 }
  },
  estimatedDeliveryDate: {
    type: Date,
    default: null
  },
  deliveredAt: {
    type: Date,
    default: null
  },
  ndrReason: {
    type: String,
    default: null
  },
  ndrStatus: {
    type: String,
    enum: ['NONE', 'ACTION_REQUIRED', 'REATTEMPT_REQUESTED', 'RTO_REQUESTED', 'RESOLVED'],
    default: 'NONE',
    index: true
  },
  ndrAttempts: {
    type: Number,
    default: 0
  },
  ndrHistory: [{
    date: { type: Date, default: Date.now },
    reason: { type: String },
    customerResponse: { type: String, default: '' },
    actionTaken: { type: String, default: '' }
  }],
  lastSyncedAt: {
    type: Date,
    default: null
  },
  trackingHistory: [trackingEventSchema],
  rawWebhooks: [{
    event: { type: String },
    receivedAt: { type: Date, default: Date.now },
    payload: { type: mongoose.Schema.Types.Mixed }
  }]
}, {
  timestamps: true
});

export const Shipment = mongoose.model('Shipment', shipmentSchema);
