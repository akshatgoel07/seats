/**
 * Custom hook for seat color management
 * Handles:
 * - Seat color calculation based on status, type, and selection
 * - Darkened color variants for borders/shadows
 *
 * R10: previously this rebuilt a full Map<seatId,color> (and a darkened Map)
 * on every selection change — O(seats) work + new Map identities that defeated
 * SeatElement's memo. Selection touches one seat, so instead the getters resolve
 * a single seat in O(1): the base color comes from the pure getSeatColor and the
 * selection is a cheap Set lookup. darkenColor is module-cached (R6), so the
 * darkened getter is O(1) too. Callers pass the resolved colors to SeatElement
 * as primitive props (R3) so only toggled seats re-render.
 */

import { useCallback } from "react";
import { darkenColor, getSeatColor as resolveSeatColor } from "../utils/index";

/**
 * Custom hook for managing seat colors
 * @param {Object} seatMap - Map of seat IDs to seat data (unused now, kept for API stability)
 * @param {Set} selectedSeats - Set of selected seat IDs
 * @param {Map} seatTypesMap - Map of seat type IDs to colors
 * @returns {{ getSeatColor: (seat: any) => string, getDarkenedSeatColor: (seat: any) => string }}
 */
export function useSeatColors(seatMap, selectedSeats, seatTypesMap) {
  const getSeatColor = useCallback(
    (seat) =>
      resolveSeatColor(seat, selectedSeats.has(seat.sl_id), seatTypesMap),
    [selectedSeats, seatTypesMap],
  );

  const getDarkenedSeatColor = useCallback(
    (seat) => darkenColor(getSeatColor(seat), 0.4),
    [getSeatColor],
  );

  return {
    getSeatColor,
    getDarkenedSeatColor,
  };
}
