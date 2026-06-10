/**
 * Color utility functions for seat layout
 */

import {
  COLOR_SELECTED,
  COLOR_UNAVAILABLE,
  COLOR_BLOCKED,
  COLOR_DEFAULT,
} from "./constants.ts";

/**
 * Module-level memo cache for darkenColor. A layout only uses a handful of
 * distinct (color, factor) pairs, but darkenColor is called once per seat when
 * (re)building the seat color maps, so caching turns thousands of hex parses +
 * string allocations into a single Map lookup.
 * @type {Map<string, string>}
 */
const darkenColorCache = new Map();

/**
 * Convert hex color to darker version by reducing RGB values
 * @param {string} hexColor - Hex color string (e.g., "#ff0000")
 * @param {number} factor - Darkening factor (0-1, default 0.4 = 40% darker)
 * @returns {string} Darker hex color
 */
export function darkenColor(hexColor, factor = 0.4) {
  const cacheKey = `${hexColor}|${factor}`;
  const cached = darkenColorCache.get(cacheKey);
  if (cached !== undefined) return cached;

  // Remove # if present
  const hex = hexColor.replace("#", "");

  // Parse RGB components
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);

  // Darken each component
  const darkR = Math.max(0, Math.floor(r * (1 - factor)));
  const darkG = Math.max(0, Math.floor(g * (1 - factor)));
  const darkB = Math.max(0, Math.floor(b * (1 - factor)));

  // Convert back to hex
  const result = `#${darkR.toString(16).padStart(2, "0")}${darkG
    .toString(16)
    .padStart(2, "0")}${darkB.toString(16).padStart(2, "0")}`;
  darkenColorCache.set(cacheKey, result);
  return result;
}

/**
 * Get seat color based on seat status and properties
 * @param {Object} seat - Seat object with status and properties
 * @param {boolean} isSelected - Whether the seat is currently selected
 * @param {Map} seatTypesMap - Map of seat types to their color codes
 * @returns {string} Hex color code for the seat
 */
export function getSeatColor(seat, isSelected, seatTypesMap) {
  const isBlockedByReserveType =
    seat.seat_reserve_type_id === 8 ||
    seat.seat_reserve_type_id === 12 ||
    seat.seat_reserve_type_id === 13;

  const isDisabled =
    seat.sl_seat_status !== "0" || seat.covidBlocked || seat.isVipReserved;

  if (isDisabled) return COLOR_UNAVAILABLE;
  if (isBlockedByReserveType) return COLOR_BLOCKED;
  if (isSelected) return COLOR_SELECTED;

  return seatTypesMap.get(seat.sst_seat_type) || COLOR_DEFAULT;
}

/**
 * Build a map of seat IDs to their colors
 * @param {Object} seatMap - Map of seat IDs to seat data
 * @param {Set} selectedSeats - Set of selected seat IDs
 * @param {Map} seatTypesMap - Map of seat types to their color codes
 * @returns {Map} Map of seat IDs to color codes
 */
export function buildSeatColorsMap(seatMap, selectedSeats, seatTypesMap) {
  const colorsMap = new Map();

  Object.values(seatMap).forEach((seat) => {
    const isSelected = selectedSeats.has(seat.sl_id);
    const color = getSeatColor(seat, isSelected, seatTypesMap);
    colorsMap.set(seat.sl_id, color);
  });

  return colorsMap;
}

/**
 * Build a map of seat IDs to their darkened colors
 * @param {Map} seatColorsMap - Map of seat IDs to their base colors
 * @param {number} factor - Darkening factor (0-1, default 0.4)
 * @returns {Map} Map of seat IDs to darkened color codes
 */
export function buildDarkenColorsMap(seatColorsMap, factor = 0.4) {
  const darkMap = new Map();

  seatColorsMap.forEach((color, seatId) => {
    darkMap.set(seatId, darkenColor(color, factor));
  });

  return darkMap;
}

/**
 * Get standing section colors based on sold out status
 * @param {boolean} isSoldOut - Whether the standing section is sold out
 * @param {Object} element - Standing section element with color properties
 * @returns {Object} Object with fillColor and strokeColor
 */
export function getStandingSectionColors(isSoldOut, element) {
  if (isSoldOut) {
    return {
      fillColor: "#f3f4f6", // Gray background when sold out
      strokeColor: "#d1d5db", // Gray border when sold out
      textColor: "#6b7280", // Gray text when sold out
    };
  }

  return {
    fillColor: element.fillColor || "#e5e7eb",
    strokeColor: element.strokeColor || "#6b7280",
    textColor: "#000000",
  };
}
