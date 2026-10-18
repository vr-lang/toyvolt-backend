import { hasShiprocket } from '../../src/config/env.js';
import { shiprocketService } from '../../src/services/shiprocketService.js';
import {
  getAdminShipments,
  getAdminShipmentById,
  getShipmentLabel,
  getShipmentManifest,
  createAdminShipment,
  getAdminShipmentByOrderId
} from '../../src/controllers/adminController.js';

describe('Admin Shipments Controller & Configuration Unit Tests', () => {
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

  test('hasShiprocket returns a boolean without throwing ReferenceError', () => {
    expect(typeof hasShiprocket).toBe('function');
    const status = hasShiprocket();
    expect(typeof status).toBe('boolean');
  });

  test('shiprocketService defines pickup location methods', () => {
    expect(typeof shiprocketService.getDefaultPickupLocation).toBe('function');
    expect(typeof shiprocketService.getPickupLocations).toBe('function');
  });

  test('adminController exports all shipment controller handlers', () => {
    expect(typeof getAdminShipments).toBe('function');
    expect(typeof getAdminShipmentById).toBe('function');
    expect(typeof getShipmentLabel).toBe('function');
    expect(typeof getShipmentManifest).toBe('function');
    expect(typeof createAdminShipment).toBe('function');
    expect(typeof getAdminShipmentByOrderId).toBe('function');
  });

  test('getShipmentLabel handles unbooked orders gracefully', async () => {
    const unbookedLabelReq = { params: { id: 'unbooked_order123' } };
    const labelRes = createMockRes();
    await getShipmentLabel(unbookedLabelReq, labelRes, () => {});
    expect(labelRes.statusCode).toBe(200);
    expect(labelRes.data.success).toBe(true);
    expect(labelRes.data.data.isAvailable).toBe(false);
    expect(labelRes.data.data.labelUrl).toBeNull();
  });

  test('getShipmentManifest handles unbooked orders gracefully', async () => {
    const unbookedManifestReq = { params: { id: 'unbooked_order123' } };
    const manifestRes = createMockRes();
    await getShipmentManifest(unbookedManifestReq, manifestRes, () => {});
    expect(manifestRes.statusCode).toBe(200);
    expect(manifestRes.data.success).toBe(true);
    expect(manifestRes.data.data.isAvailable).toBe(false);
    expect(manifestRes.data.data.manifestUrl).toBeNull();
  });
});
