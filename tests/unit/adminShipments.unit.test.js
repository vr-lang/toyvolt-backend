import assert from 'node:assert';
import { hasShiprocket, env } from '../../src/config/env.js';

console.log('--- 1. Testing hasShiprocket configuration check ---');
assert.strictEqual(typeof hasShiprocket, 'function', 'hasShiprocket must be a function');
const shiprocketStatus = hasShiprocket();
assert.strictEqual(typeof shiprocketStatus, 'boolean', 'hasShiprocket() must return a boolean');
console.log(`✓ hasShiprocket() returns boolean: ${shiprocketStatus}`);

console.log('--- 2. Testing Shiprocket pickup location and fallback logic ---');
import { shiprocketService } from '../../src/services/shiprocketService.js';
assert.strictEqual(typeof shiprocketService.getDefaultPickupLocation, 'function');
assert.strictEqual(typeof shiprocketService.getPickupLocations, 'function');
console.log('✓ shiprocketService pickup methods exist');

console.log('--- 3. Testing adminController exports ---');
import {
  getAdminShipments,
  getAdminShipmentById,
  getShipmentLabel,
  getShipmentManifest,
  createAdminShipment,
  getAdminShipmentByOrderId
} from '../../src/controllers/adminController.js';

assert.strictEqual(typeof getAdminShipments, 'function', 'getAdminShipments must be exported as a function');
assert.strictEqual(typeof getAdminShipmentById, 'function', 'getAdminShipmentById must be exported as a function');
assert.strictEqual(typeof getShipmentLabel, 'function', 'getShipmentLabel must be exported as a function');
assert.strictEqual(typeof getShipmentManifest, 'function', 'getShipmentManifest must be exported as a function');
assert.strictEqual(typeof createAdminShipment, 'function', 'createAdminShipment must be exported as a function');
assert.strictEqual(typeof getAdminShipmentByOrderId, 'function', 'getAdminShipmentByOrderId must be exported as a function');
console.log('✓ All admin shipment controller functions are defined and exported');

console.log('--- 4. Testing synthetic unbooked shipment handling ---');
// Mock res object
function createMockRes() {
  return {
    statusCode: 200,
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.data = payload;
      return this;
    }
  };
}

// Test unbooked label
const unbookedLabelReq = { params: { id: 'unbooked_order123' } };
const labelRes = createMockRes();
await getShipmentLabel(unbookedLabelReq, labelRes, () => {});
assert.strictEqual(labelRes.statusCode, 200);
assert.strictEqual(labelRes.data.success, true);
assert.strictEqual(labelRes.data.data.isAvailable, false);
assert.strictEqual(labelRes.data.data.labelUrl, null);
console.log('✓ getShipmentLabel safely handles unbooked orders without crashing');

// Test unbooked manifest
const unbookedManifestReq = { params: { id: 'unbooked_order123' } };
const manifestRes = createMockRes();
await getShipmentManifest(unbookedManifestReq, manifestRes, () => {});
assert.strictEqual(manifestRes.statusCode, 200);
assert.strictEqual(manifestRes.data.success, true);
assert.strictEqual(manifestRes.data.data.isAvailable, false);
assert.strictEqual(manifestRes.data.data.manifestUrl, null);
console.log('✓ getShipmentManifest safely handles unbooked orders without crashing');

console.log('--- ALL ADMIN SHIPMENT UNIT TESTS PASSED ---');
