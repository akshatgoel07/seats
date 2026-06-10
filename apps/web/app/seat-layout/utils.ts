/**
 * Utility functions for seat layout calculations
 */

/**
 * Safely check if a seat is an open seating area, handling missing or undefined values
 * @param {Object} seat - The seat object
 * @returns {boolean} - True if the seat is an open seating area, false otherwise
 */
function isOpenSeatingArea(seat) {
  // Handle cases where the field doesn't exist in the object
  if (!seat || !seat.hasOwnProperty("is_open_seating_area")) {
    return false;
  }

  // Handle cases where the field exists but is null, undefined, or empty
  if (
    seat.is_open_seating_area === null ||
    seat.is_open_seating_area === undefined ||
    seat.is_open_seating_area === ""
  ) {
    return false;
  }

  // Only return true if the field explicitly equals "Y"
  return seat.is_open_seating_area === "Y";
}

/**
 * Safely check if a seat is blocked by reserve type
 * @param {Object} seat - The seat object
 * @returns {boolean} - True if blocked by reserve type 8, 12, or 13
 */
function isBlockedByReserveType(seat) {
  // Handle cases where the field doesn't exist in the object
  if (!seat || !seat.hasOwnProperty("seat_reserve_type_id")) {
    return false; // Not blocked if field is missing
  }

  // Handle cases where the field exists but is null or undefined
  if (
    seat.seat_reserve_type_id === null ||
    seat.seat_reserve_type_id === undefined
  ) {
    return false; // Not blocked if field is null/undefined
  }

  const reserveTypeId = Number(seat.seat_reserve_type_id);
  return reserveTypeId === 8 || reserveTypeId === 12 || reserveTypeId === 13;
}

/**
 * Calculate the total number of open seats based on the specified criteria
 *
 * Open seats are defined as seats that:
 * 1. Have is_open_seating_area = "Y" (handles missing/undefined values gracefully)
 * 2. Have seat_reserve_type_id NOT in [8, 12, 13] (not reserved or blocked)
 *
 * @param {Array} seats - Array of seat records from the API
 * @returns {Object} - Object containing count and detailed breakdown
 */
export function calculateOpenSeats(seats) {
  if (!Array.isArray(seats)) {
    return {
      totalOpenSeats: 0,
      totalSeats: 0,
      openSeatingAreaSeats: 0,
      blockedByReserveType: 0,
      missingFields: 0,
      details: {
        criteria:
          'is_open_seating_area="Y" AND seat_reserve_type_id NOT IN [8,12,13]',
        filters: {
          openSeatingArea:
            'is_open_seating_area === "Y" (handles missing/undefined)',
          notBlockedByReserveType:
            "seat_reserve_type_id !== 8 && seat_reserve_type_id !== 12 && seat_reserve_type_id !== 13",
        },
      },
    };
  }

  let totalOpenSeats = 0;
  let openSeatingAreaSeats = 0;
  let blockedByReserveType = 0;
  let missingFields = 0;

  seats.forEach((seat) => {
    try {
      // Parse seat metadata to get seat information
      const apiMeta = JSON.parse(seat.sl_meta_data);
      if (!apiMeta) return;

      // Check if this is an open seating area seat (with safe handling)
      const seatIsOpenSeatingArea = isOpenSeatingArea(seat);

      // Check if seat is blocked by reserve type (with safe handling)
      const seatIsBlockedByReserveType = isBlockedByReserveType(seat);

      // Check for missing fields - count each missing field separately
      const missingOpenSeatingArea = !seat.hasOwnProperty(
        "is_open_seating_area",
      );
      const missingReserveTypeId = !seat.hasOwnProperty("seat_reserve_type_id");

      if (missingOpenSeatingArea || missingReserveTypeId) {
        missingFields++;
      }

      if (seatIsOpenSeatingArea) {
        openSeatingAreaSeats++;
      }

      if (seatIsBlockedByReserveType) {
        blockedByReserveType++;
      }

      // Count as open seat if it's open seating area AND not blocked by reserve type
      if (seatIsOpenSeatingArea && !seatIsBlockedByReserveType) {
        totalOpenSeats++;
      }
    } catch (error) {
      // If there's an error parsing metadata, skip this seat
      console.warn("Error parsing seat metadata:", error, seat);
      return;
    }
  });

  return {
    totalOpenSeats,
    totalSeats: seats.length,
    openSeatingAreaSeats,
    blockedByReserveType,
    missingFields,
    details: {
      criteria:
        'is_open_seating_area="Y" AND seat_reserve_type_id NOT IN [8,12,13]',
      filters: {
        openSeatingArea:
          'is_open_seating_area === "Y" (handles missing/undefined)',
        notBlockedByReserveType:
          "seat_reserve_type_id !== 8 && seat_reserve_type_id !== 12 && seat_reserve_type_id !== 13",
      },
    },
  };
}

/**
 * Get detailed breakdown of seat availability by category
 * @param {Array} seats - Array of seat records from the API
 * @returns {Object} - Detailed breakdown by seat categories
 */
export function getSeatAvailabilityBreakdown(seats) {
  if (!Array.isArray(seats)) {
    return {
      openSeatingArea: {
        total: 0,
        available: 0,
        blocked: 0,
        reserved: 0,
      },
      regularSeats: {
        total: 0,
        available: 0,
        blocked: 0,
        reserved: 0,
      },
      missingFields: 0,
    };
  }

  const breakdown = {
    openSeatingArea: {
      total: 0,
      available: 0,
      blocked: 0,
      reserved: 0,
    },
    regularSeats: {
      total: 0,
      available: 0,
      blocked: 0,
      reserved: 0,
    },
    missingFields: 0,
  };

  seats.forEach((seat) => {
    try {
      const apiMeta = JSON.parse(seat.sl_meta_data);
      if (!apiMeta) return; // Skip seat if metadata is invalid or empty

      // Use safe helper functions to check seat properties
      const seatIsOpenSeatingArea = isOpenSeatingArea(seat);
      const seatIsBlockedByReserveType = isBlockedByReserveType(seat);

      // Check for missing fields - count each missing field separately
      const missingOpenSeatingArea = !seat.hasOwnProperty(
        "is_open_seating_area",
      );
      const missingReserveTypeId = !seat.hasOwnProperty("seat_reserve_type_id");

      if (missingOpenSeatingArea || missingReserveTypeId) {
        breakdown.missingFields++;
      }

      if (seatIsOpenSeatingArea) {
        breakdown.openSeatingArea.total++;
        if (seatIsBlockedByReserveType) {
          breakdown.openSeatingArea.blocked++;
        } else {
          breakdown.openSeatingArea.available++;
        }
      } else {
        breakdown.regularSeats.total++;
        if (seatIsBlockedByReserveType) {
          breakdown.regularSeats.blocked++;
        } else {
          breakdown.regularSeats.available++;
        }
      }
    } catch (error) {
      // Skip seat entirely if JSON parsing fails
      console.warn("Error parsing seat metadata:", error, seat);
      return;
    }
  });

  return breakdown;
}
