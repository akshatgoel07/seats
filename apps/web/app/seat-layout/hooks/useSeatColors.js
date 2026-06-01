/**
 * Custom hook for seat color management
 * Handles:
 * - Seat color calculation based on status, type, and selection
 * - Darkened color variants for borders/shadows
 * - Memoization for performance
 */

import { useMemo, useCallback } from "react";
import {
  darkenColor,
  COLOR_UNAVAILABLE,
  COLOR_BLOCKED,
  COLOR_SELECTED,
  COLOR_DEFAULT,
  BLOCKED_RESERVE_TYPES,
} from "../utils/index";

/**
 * Custom hook for managing seat colors
 * @param {Object} seatMap - Map of seat IDs to seat data
 * @param {Set} selectedSeats - Set of selected seat IDs
 * @param {Map} seatTypesMap - Map of seat type IDs to colors
 * @returns {Object} Color maps and getter functions
 */
export function useSeatColors(seatMap, selectedSeats, seatTypesMap) {
  /**
   * Build seat colors map
   */
  const seatColorsMap = useMemo(() => {
    const colorsMap = new Map();
    Object.values(seatMap).forEach((seat) => {
      const isSelected = selectedSeats.has(seat.sl_id);
      const isBlockedByReserveType = BLOCKED_RESERVE_TYPES.includes(
        seat.seat_reserve_type_id
      );
      const isDisabled =
        seat.sl_seat_status !== "0" || seat.covidBlocked || seat.isVipReserved;

      let color;
      if (isDisabled) color = COLOR_UNAVAILABLE;
      else if (isBlockedByReserveType) color = COLOR_BLOCKED;
      else if (isSelected) color = COLOR_SELECTED;
      else color = seatTypesMap.get(seat.sst_seat_type) || COLOR_DEFAULT;

      colorsMap.set(seat.sl_id, color);
    });
    return colorsMap;
  }, [seatMap, selectedSeats, seatTypesMap]);

  /**
   * Build darkened colors map for borders/shadows
   */
  const darkenColorsMap = useMemo(() => {
    const darkMap = new Map();
    seatColorsMap.forEach((color, seatId) => {
      darkMap.set(seatId, darkenColor(color, 0.4));
    });
    return darkMap;
  }, [seatColorsMap]);

  /**
   * Get seat color by seat ID
   */
  const getSeatColor = useCallback(
    (seat) => {
      return seatColorsMap.get(seat.sl_id) || COLOR_DEFAULT;
    },
    [seatColorsMap]
  );

  /**
   * Get darkened seat color by seat ID
   */
  const getDarkenedSeatColor = useCallback(
    (seat) => {
      return darkenColorsMap.get(seat.sl_id) || darkenColor(COLOR_DEFAULT, 0.4);
    },
    [darkenColorsMap]
  );

  return {
    seatColorsMap,
    darkenColorsMap,
    getSeatColor,
    getDarkenedSeatColor,
  };
}
