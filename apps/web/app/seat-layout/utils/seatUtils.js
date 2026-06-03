/**
 * Seat-specific utility functions for seat layout
 */

import {
  BLOCKED_RESERVE_TYPES,
  SEAT_STATUS_AVAILABLE,
  OPEN_SEATING_AREA_FLAG,
} from "./constants.js";

/**
 * Check if a seat is disabled (unavailable for selection)
 * @param {Object} seat - Seat object with status and properties
 * @returns {boolean} True if seat is disabled
 */
export function isSeatDisabled(seat) {
  return (
    seat.sl_seat_status !== SEAT_STATUS_AVAILABLE ||
    seat.covidBlocked ||
    seat.isVipReserved ||
    BLOCKED_RESERVE_TYPES.includes(seat.seat_reserve_type_id)
  );
}

/**
 * R17 level-of-detail aggregation. Groups seats into one bounding box per row so
 * the zoomed-out overview can draw ~(rows) rects instead of thousands of seats.
 * Pure + unit-tested. Returns world-coordinate boxes with availability counts.
 * @param {Record<string, any>} seatMap
 * @returns {Array<{ id: string, x: number, y: number, width: number, height: number, total: number, available: number }>}
 */
export function buildRowAggregates(seatMap) {
  const groups = new Map();
  for (const seat of Object.values(seatMap || {})) {
    const pos = seat && seat.position;
    if (!pos) continue;
    const key = seat.rowId || `__solo_${seat.sl_id}`;
    const halfW = ((seat.dimensions && seat.dimensions.width) || 20) / 2;
    const halfH = ((seat.dimensions && seat.dimensions.height) || 20) / 2;
    let g = groups.get(key);
    if (!g) {
      g = {
        id: key,
        minX: Infinity,
        minY: Infinity,
        maxX: -Infinity,
        maxY: -Infinity,
        total: 0,
        available: 0,
      };
      groups.set(key, g);
    }
    if (pos.x - halfW < g.minX) g.minX = pos.x - halfW;
    if (pos.y - halfH < g.minY) g.minY = pos.y - halfH;
    if (pos.x + halfW > g.maxX) g.maxX = pos.x + halfW;
    if (pos.y + halfH > g.maxY) g.maxY = pos.y + halfH;
    g.total += 1;
    if (!isSeatDisabled(seat)) g.available += 1;
  }

  const result = [];
  groups.forEach((g) => {
    result.push({
      id: g.id,
      x: g.minX,
      y: g.minY,
      width: g.maxX - g.minX,
      height: g.maxY - g.minY,
      total: g.total,
      available: g.available,
    });
  });
  return result;
}

/**
 * Check if a seat is blocked by reserve type
 * @param {Object} seat - Seat object
 * @returns {boolean} True if blocked by reserve type
 */
export function isBlockedByReserveType(seat) {
  return BLOCKED_RESERVE_TYPES.includes(seat.seat_reserve_type_id);
}

/**
 * Check if a seat should be filtered out based on legend selection
 * @param {Object} seat - Seat object
 * @param {boolean} isSelected - Whether the seat is selected
 * @param {Object|null} selectedLegendType - Currently selected legend filter
 * @returns {boolean} True if seat should have reduced opacity
 */
export function shouldApplyOpacityFilter(seat, isSelected, selectedLegendType) {
  if (!selectedLegendType) return false;

  const isDisabled = isSeatDisabled(seat);

  if (selectedLegendType.sst_seat_type === "selected") {
    // Show only selected seats (green)
    return !isSelected;
  } else if (selectedLegendType.sst_seat_type === "unavailable") {
    // Show only unavailable seats (gray)
    return !isDisabled;
  } else {
    // Show only seats of selected type
    return seat.sst_seat_type !== selectedLegendType.sst_seat_type;
  }
}

/**
 * Build a seat map from canvas scene data and seat status map
 * @param {Object} canvasSceneData - Canvas scene data with seats
 * @param {Object} seatStatusMap - Map of seat IDs to their API status
 * @returns {Object} Map of seat IDs to complete seat data
 */
export function buildSeatMap(canvasSceneData, seatStatusMap) {
  if (!canvasSceneData || !canvasSceneData.seats) return {};

  const map = {};
  const rows = canvasSceneData.rows || {};
  const seats = canvasSceneData.seats || {};
  const sections = canvasSceneData.sections || {};

  // Precompute each row's seat centroid ONCE (O(n)). Previously every seat in a
  // rotated row recomputed it via Object.values(seats).filter(...) — O(n^2) at
  // load for a layout with rotated rows.
  const rowCentroids = new Map();
  {
    const sums = new Map();
    Object.values(seats).forEach((s) => {
      if (!s.rowId) return;
      let acc = sums.get(s.rowId);
      if (!acc) {
        acc = { x: 0, y: 0, n: 0 };
        sums.set(s.rowId, acc);
      }
      acc.x += s.localX || 0;
      acc.y += s.localY || 0;
      acc.n += 1;
    });
    sums.forEach((acc, rowId) => {
      rowCentroids.set(rowId, { x: acc.x / acc.n, y: acc.y / acc.n });
    });
  }

  Object.entries(seats).forEach(([seatId, seatData]) => {
    const apiData = seatStatusMap[seatId];
    
    let positionX = seatData.localX || 0;
    let positionY = seatData.localY || 0;
    let rotation = 0;

    if (seatData.rowId && rows[seatData.rowId]) {
      const row = rows[seatData.rowId];
      
      if (row.transform && row.transform.rotation) {
        const centroid = rowCentroids.get(seatData.rowId);

        if (centroid) {
          const centerX = centroid.x;
          const centerY = centroid.y;

          const cos = Math.cos(row.transform.rotation);
          const sin = Math.sin(row.transform.rotation);
          const relativeX = positionX - centerX;
          const relativeY = positionY - centerY;
          const rotatedX = relativeX * cos - relativeY * sin;
          const rotatedY = relativeX * sin + relativeY * cos;
          
          positionX = rotatedX + centerX;
          positionY = rotatedY + centerY;
          rotation = (row.transform.rotation * 180) / Math.PI;
        }
      }

      if (row.sectionId && sections[row.sectionId]) {
        const section = sections[row.sectionId];
        if (section.transform) {
          const cos = Math.cos(section.transform.rotation || 0);
          const sin = Math.sin(section.transform.rotation || 0);
          const rotatedX = positionX * cos - positionY * sin;
          const rotatedY = positionX * sin + positionY * cos;
          positionX = rotatedX + (section.transform.x || 0);
          positionY = rotatedY + (section.transform.y || 0);
        }
      }
    }

    map[seatId] = {
      ...seatData,
      sl_id: seatId,
      sl_seat_status: apiData?.status || seatData.status || "0",
      seat_price: apiData?.price,
      sl_seat_name: apiData?.seatName || seatData.label || seatId,
      covidBlocked: apiData?.covidBlocked || false,
      isVipReserved: apiData?.isVipReserved || false,
      seat_reserve_type_id: apiData?.seat_reserve_type_id,
      sst_seat_type: apiData?.sst_seat_type,
      position: {
        x: positionX,
        y: positionY,
        rotation: rotation,
      },
      dimensions: {
        width: seatData.width || 20,
        height: seatData.height || 20,
        radius: seatData.radius || 10,
      },
    };
  });

  return map;
}

/**
 * Build a status map from API seat records
 * @param {Array} seats - Array of seat records from API
 * @returns {Object} Map of seat IDs to their status information
 */
export function buildSeatStatusMap(seats) {
  if (!seats || !Array.isArray(seats)) return {};

  const statusMap = {};

  seats.forEach((seat) => {
    try {
      const apiMeta = JSON.parse(seat.sl_meta_data);
      if (apiMeta && apiMeta.id) {
        statusMap[apiMeta.id] = {
          status: seat.sl_seat_status,
          price: seat.seat_price,
          seatName: seat.sl_seat_name,
          covidBlocked: seat.covidBlocked,
          isVipReserved: seat.isVipReserved,
          seat_reserve_type_id: seat.seat_reserve_type_id,
          sl_id: seat.sl_id,
          sl_row_num: seat.sl_row_num,
          sl_col_num: seat.sl_col_num,
          sst_seat_type: seat.sst_seat_type,
        };
      }
    } catch (e) {
      // Skip seats with invalid metadata
    }
  });

  return statusMap;
}

/**
 * Get available standing section seats for a specific section
 * @param {Array} seats - Array of all seat records
 * @param {string} standingSectionId - ID of the standing section
 * @returns {Array} Array of available standing section seats
 */
export function getAvailableStandingSeats(seats, standingSectionId) {
  if (!seats || !Array.isArray(seats)) return [];

  return seats.filter((seat) => {
    try {
      const apiMeta = JSON.parse(seat.sl_meta_data);
      return (
        seat.is_open_seating_area === OPEN_SEATING_AREA_FLAG &&
        seat.sl_seat_status === SEAT_STATUS_AVAILABLE &&
        apiMeta?.standingSectionId === standingSectionId &&
        !BLOCKED_RESERVE_TYPES.includes(seat.seat_reserve_type_id)
      );
    } catch (e) {
      return false;
    }
  });
}

/**
 * Build selected seats array with complete data
 * @param {Set} selectedSeats - Set of selected seat IDs
 * @param {Array} apiSeats - Array of API seat records
 * @param {Object} seatMap - Map of seat IDs to seat data
 * @param {Array} standingTickets - Array of standing ticket data
 * @returns {Array} Array of complete seat data for selected seats
 */
export function buildSelectedSeatsArray(
  selectedSeats,
  apiSeats,
  seatMap,
  standingTickets
) {
  return Array.from(selectedSeats)
    .map((seatId) => {
      // Check if this is a standing section ticket
      if (seatId.startsWith("standing-")) {
        const standingTicket = standingTickets.find(
          (ticket) => ticket.id === seatId
        );
        return standingTicket || null;
      }

      // Find the original API seat data
      const apiSeat = apiSeats.find((seat) => {
        try {
          const apiMeta = JSON.parse(seat.sl_meta_data);
          return apiMeta && apiMeta.id === seatId;
        } catch (e) {
          return seat.sl_id && seat.sl_id.toString() === seatId;
        }
      });

      if (apiSeat) {
        const seat = seatMap[seatId];
        return {
          ...apiSeat,
          position: seat?.position,
          dimensions: seat?.dimensions,
        };
      }

      return null;
    })
    .filter((seat) => seat !== null);
}

/**
 * Parse canvas scene data from screen details
 * @param {Object} screenDetails - Screen details object from API
 * @returns {Object} Parsed canvas scene data with rows
 */
export function parseCanvasSceneData(screenDetails) {
  let parsedCanvasSceneData = null;
  let parsedRows = {};

  try {
    if (screenDetails?.screen_meta_data) {
      parsedCanvasSceneData = JSON.parse(screenDetails.screen_meta_data);
      parsedRows = parsedCanvasSceneData.rows || {};
    }
  } catch (error) {
    console.warn("Error parsing canvas scene data:", error);
  }

  return { canvasSceneData: parsedCanvasSceneData, rows: parsedRows };
}

/**
 * Create standing ticket objects from selected seats
 * @param {Array} selectedStandingSeats - Array of standing section seats
 * @param {Object} selectedStandingSection - Standing section element
 * @param {number} standingQuantity - Number of tickets
 * @returns {Array} Array of standing ticket objects
 */
export function createStandingTickets(
  selectedStandingSeats,
  selectedStandingSection,
  standingQuantity
) {
  return selectedStandingSeats.map((seat) => {
    try {
      const apiMeta = JSON.parse(seat.sl_meta_data);
      return {
        ...seat,
        position: {
          x: apiMeta?.Xposition || 0,
          y: apiMeta?.Yposition || 0,
        },
        dimensions: {
          width: selectedStandingSection.width / Math.max(standingQuantity, 1),
          height:
            selectedStandingSection.height / Math.max(standingQuantity, 1),
        },
      };
    } catch (e) {
      return {
        ...seat,
        position: { x: 0, y: 0 },
        dimensions: {
          width: selectedStandingSection.width / Math.max(standingQuantity, 1),
          height:
            selectedStandingSection.height / Math.max(standingQuantity, 1),
        },
      };
    }
  });
}
