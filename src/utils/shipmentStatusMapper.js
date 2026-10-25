/**
 * Centralized Shiprocket Status Mapping & State Transition Engine
 * 
 * Handles mapping from numeric status codes and heterogeneous strings
 * to Toyvolt's canonical Shipment & Order status enums.
 */

export const TERMINAL_SHIPMENT_STATUSES = new Set([
  'DELIVERED',
  'CANCELLED',
  'RTO_DELIVERED'
]);

export const SHIPMENT_STATUS_PRECEDENCE = {
  CREATED: 10,
  AWB_ASSIGNED: 20,
  PICKUP_SCHEDULED: 30,
  PICKED_UP: 40,
  IN_TRANSIT: 50,
  NDR: 55,
  OUT_FOR_DELIVERY: 60,
  RTO_INITIATED: 70,
  RTO_DELIVERED: 80,
  CANCELLED: 90,
  DELIVERED: 100
};

/**
 * Normalizes any incoming Shiprocket status representation (code, label, string)
 * to Toyvolt canonical shipment and order statuses.
 */
export const mapShiprocketStatus = (rawStatus, rawCode = null) => {
  const codeNum = rawCode !== null && rawCode !== undefined ? Number(rawCode) : null;
  const statusStr = typeof rawStatus === 'string' ? rawStatus.trim().toUpperCase() : '';

  // 1. RTO Checks (handle before generic DELIVERED substring matching)
  if (
    codeNum === 10 ||
    codeNum === 21 ||
    statusStr === 'RTO_DELIVERED' ||
    statusStr === 'RTO DELIVERED'
  ) {
    return {
      shipmentStatus: 'RTO_DELIVERED',
      orderStatus: 'cancelled',
      isTerminal: true
    };
  }

  if (
    codeNum === 9 ||
    codeNum === 14 ||
    codeNum === 20 ||
    statusStr === 'RTO_INITIATED' ||
    statusStr === 'RTO INITIATED' ||
    statusStr.startsWith('RTO')
  ) {
    return {
      shipmentStatus: 'RTO_INITIATED',
      orderStatus: 'shipped',
      isTerminal: false
    };
  }

  // 2. NDR / Undelivered Checks (handle before generic DELIVERED substring matching)
  if (
    codeNum === 22 ||
    statusStr === 'NDR' ||
    statusStr === 'UNDELIVERED' ||
    statusStr.includes('UNDELIVERED')
  ) {
    return {
      shipmentStatus: 'NDR',
      orderStatus: 'shipped', // Remains under in-flight shipping
      isTerminal: false
    };
  }

  // 3. Direct checks for DELIVERED
  if (
    codeNum === 7 ||
    codeNum === 87 || // Shiprocket delivered variants
    statusStr === 'DELIVERED' ||
    statusStr === 'DLVD' ||
    (statusStr.includes('DELIVERED') && !statusStr.includes('OUT'))
  ) {
    return {
      shipmentStatus: 'DELIVERED',
      orderStatus: 'delivered',
      isTerminal: true
    };
  }

  // 2. OUT FOR DELIVERY
  if (
    codeNum === 15 ||
    codeNum === 17 ||
    codeNum === 26 ||
    codeNum === 42 || // In some Xpressbees/Shiprocket scans
    codeNum === 45 ||
    statusStr === 'OUT_FOR_DELIVERY' ||
    statusStr === 'OUT FOR DELIVERY' ||
    statusStr === 'OFD'
  ) {
    return {
      shipmentStatus: 'OUT_FOR_DELIVERY',
      orderStatus: 'shipped',
      isTerminal: false
    };
  }

  // 3. IN TRANSIT / SHIPPED
  if (
    codeNum === 6 ||
    codeNum === 18 ||
    codeNum === 38 ||
    statusStr === 'IN_TRANSIT' ||
    statusStr === 'IN TRANSIT' ||
    statusStr === 'SHIPPED' ||
    statusStr === 'REACHED AT DESTINATION HUB' ||
    statusStr.includes('TRANSIT')
  ) {
    return {
      shipmentStatus: 'IN_TRANSIT',
      orderStatus: 'shipped',
      isTerminal: false
    };
  }

  // 4. PICKED UP
  if (
    statusStr === 'PICKED_UP' ||
    statusStr === 'PICKED UP' ||
    statusStr === 'PICKED' ||
    statusStr === 'PKD'
  ) {
    return {
      shipmentStatus: 'PICKED_UP',
      orderStatus: 'shipped',
      isTerminal: false
    };
  }

  // 5. PICKUP SCHEDULED / OUT FOR PICKUP
  if (
    codeNum === 3 ||
    codeNum === 4 ||
    codeNum === 19 ||
    statusStr === 'PICKUP_SCHEDULED' ||
    statusStr === 'PICKUP SCHEDULED' ||
    statusStr === 'OUT FOR PICKUP' ||
    statusStr === 'OFP'
  ) {
    return {
      shipmentStatus: 'PICKUP_SCHEDULED',
      orderStatus: 'processing',
      isTerminal: false
    };
  }

  // 6. AWB ASSIGNED / MANIFESTED
  if (
    codeNum === 1 ||
    codeNum === 2 ||
    codeNum === 5 ||
    statusStr === 'AWB_ASSIGNED' ||
    statusStr === 'AWB ASSIGNED' ||
    statusStr === 'MANIFEST_GENERATED' ||
    statusStr === 'DATA RECEIVED' ||
    statusStr === 'DRC'
  ) {
    return {
      shipmentStatus: 'AWB_ASSIGNED',
      orderStatus: 'processing',
      isTerminal: false
    };
  }

  // 7. NDR (Non-Delivery Report) / UNDELIVERED
  if (
    codeNum === 22 ||
    statusStr === 'NDR' ||
    statusStr === 'UNDELIVERED' ||
    statusStr.includes('UNDELIVERED')
  ) {
    return {
      shipmentStatus: 'NDR',
      orderStatus: 'shipped', // Remains under in-flight shipping
      isTerminal: false
    };
  }

  // 8. RTO INITIATED
  if (
    codeNum === 9 ||
    codeNum === 14 ||
    codeNum === 20 ||
    statusStr === 'RTO_INITIATED' ||
    statusStr === 'RTO INITIATED'
  ) {
    return {
      shipmentStatus: 'RTO_INITIATED',
      orderStatus: 'shipped',
      isTerminal: false
    };
  }

  // 9. RTO DELIVERED
  if (
    codeNum === 10 ||
    codeNum === 21 ||
    statusStr === 'RTO_DELIVERED' ||
    statusStr === 'RTO DELIVERED'
  ) {
    return {
      shipmentStatus: 'RTO_DELIVERED',
      orderStatus: 'cancelled',
      isTerminal: true
    };
  }

  // 10. CANCELLED
  if (
    codeNum === 8 ||
    statusStr === 'CANCELED' ||
    statusStr === 'CANCELLED'
  ) {
    return {
      shipmentStatus: 'CANCELLED',
      orderStatus: 'cancelled',
      isTerminal: true
    };
  }

  // Default fallback
  return {
    shipmentStatus: 'CREATED',
    orderStatus: 'processing',
    isTerminal: false
  };
};

/**
 * Validates whether a shipment status transition is legally permitted.
 * Strictly prevents out-of-order scans (e.g. IN_TRANSIT) from overwriting
 * a confirmed terminal state (e.g. DELIVERED).
 */
export const canTransitionShipmentStatus = (currentStatus, targetStatus) => {
  if (!currentStatus) return true;
  if (currentStatus === targetStatus) return true;

  // Once DELIVERED, cannot revert to non-terminal states
  if (currentStatus === 'DELIVERED' && targetStatus !== 'DELIVERED') {
    return false;
  }

  // Once RTO_DELIVERED, cannot revert
  if (currentStatus === 'RTO_DELIVERED') {
    return false;
  }

  const currentRank = SHIPMENT_STATUS_PRECEDENCE[currentStatus] || 0;
  const targetRank = SHIPMENT_STATUS_PRECEDENCE[targetStatus] || 0;

  // Do not downgrade progress unless it is NDR, RTO, or CANCELLED
  if (targetRank < currentRank) {
    if (['NDR', 'RTO_INITIATED', 'CANCELLED'].includes(targetStatus)) {
      return true;
    }
    return false;
  }

  return true;
};
