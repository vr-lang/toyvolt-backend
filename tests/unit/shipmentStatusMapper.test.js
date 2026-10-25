import {
  mapShiprocketStatus,
  canTransitionShipmentStatus,
  TERMINAL_SHIPMENT_STATUSES
} from '../../src/utils/shipmentStatusMapper.js';

describe('Shiprocket Status Mapper Unit Tests', () => {
  describe('mapShiprocketStatus', () => {
    test('maps numeric code 7 to DELIVERED', () => {
      const res = mapShiprocketStatus(null, 7);
      expect(res.shipmentStatus).toBe('DELIVERED');
      expect(res.orderStatus).toBe('delivered');
      expect(res.isTerminal).toBe(true);
    });

    test('maps string "Delivered" and "DLVD" to DELIVERED', () => {
      expect(mapShiprocketStatus('Delivered').shipmentStatus).toBe('DELIVERED');
      expect(mapShiprocketStatus('dlvd').shipmentStatus).toBe('DELIVERED');
    });

    test('maps code 17 and "OUT_FOR_DELIVERY" to OUT_FOR_DELIVERY / shipped', () => {
      const resCode = mapShiprocketStatus(null, 17);
      expect(resCode.shipmentStatus).toBe('OUT_FOR_DELIVERY');
      expect(resCode.orderStatus).toBe('shipped');

      const resStr = mapShiprocketStatus('OUT FOR DELIVERY');
      expect(resStr.shipmentStatus).toBe('OUT_FOR_DELIVERY');
      expect(resStr.orderStatus).toBe('shipped');
    });

    test('maps code 6, "IN_TRANSIT", and "REACHED AT DESTINATION HUB" to IN_TRANSIT', () => {
      expect(mapShiprocketStatus(null, 6).shipmentStatus).toBe('IN_TRANSIT');
      expect(mapShiprocketStatus('IN_TRANSIT').shipmentStatus).toBe('IN_TRANSIT');
      expect(mapShiprocketStatus('REACHED AT DESTINATION HUB').shipmentStatus).toBe('IN_TRANSIT');
    });

    test('maps code 22 / "UNDELIVERED" to NDR', () => {
      const res = mapShiprocketStatus('UNDELIVERED', 22);
      expect(res.shipmentStatus).toBe('NDR');
      expect(res.orderStatus).toBe('shipped');
    });

    test('maps code 10 / "RTO_DELIVERED" to RTO_DELIVERED / cancelled', () => {
      const res = mapShiprocketStatus('RTO DELIVERED', 10);
      expect(res.shipmentStatus).toBe('RTO_DELIVERED');
      expect(res.orderStatus).toBe('cancelled');
      expect(res.isTerminal).toBe(true);
    });

    test('maps code 8 / "CANCELLED" to CANCELLED / cancelled', () => {
      const res = mapShiprocketStatus('CANCELLED', 8);
      expect(res.shipmentStatus).toBe('CANCELLED');
      expect(res.orderStatus).toBe('cancelled');
      expect(res.isTerminal).toBe(true);
    });

    test('fallback returns CREATED / processing', () => {
      const res = mapShiprocketStatus('UNKNOWN_STATUS_XYZ');
      expect(res.shipmentStatus).toBe('CREATED');
      expect(res.orderStatus).toBe('processing');
      expect(res.isTerminal).toBe(false);
    });
  });

  describe('canTransitionShipmentStatus', () => {
    test('allows progressive transitions', () => {
      expect(canTransitionShipmentStatus('CREATED', 'AWB_ASSIGNED')).toBe(true);
      expect(canTransitionShipmentStatus('AWB_ASSIGNED', 'IN_TRANSIT')).toBe(true);
      expect(canTransitionShipmentStatus('IN_TRANSIT', 'OUT_FOR_DELIVERY')).toBe(true);
      expect(canTransitionShipmentStatus('OUT_FOR_DELIVERY', 'DELIVERED')).toBe(true);
    });

    test('disallows downgrading terminal DELIVERED to in-transit states', () => {
      expect(canTransitionShipmentStatus('DELIVERED', 'IN_TRANSIT')).toBe(false);
      expect(canTransitionShipmentStatus('DELIVERED', 'OUT_FOR_DELIVERY')).toBe(false);
      expect(canTransitionShipmentStatus('DELIVERED', 'CREATED')).toBe(false);
    });

    test('allows same-status transitions (idempotency)', () => {
      expect(canTransitionShipmentStatus('DELIVERED', 'DELIVERED')).toBe(true);
      expect(canTransitionShipmentStatus('IN_TRANSIT', 'IN_TRANSIT')).toBe(true);
    });

    test('allows NDR or CANCELLED exceptions from non-terminal states', () => {
      expect(canTransitionShipmentStatus('IN_TRANSIT', 'NDR')).toBe(true);
      expect(canTransitionShipmentStatus('OUT_FOR_DELIVERY', 'NDR')).toBe(true);
      expect(canTransitionShipmentStatus('IN_TRANSIT', 'CANCELLED')).toBe(true);
    });
  });
});
