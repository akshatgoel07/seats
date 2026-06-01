/**
 * SeatElement component
 * Renders an individual seat in the SVG layout
 */

import React, { useCallback } from "react";
import { isSeatDisabled, shouldApplyOpacityFilter } from "../../utils/index";

export const SeatElement = React.memo(function SeatElement(
  /**
   * @type {{
   *   seat: any,
   *   seatId: any,
   *   isSelected: any,
   *   selectedLegendType: any,
   *   getSeatColor: (seat: any) => any,
   *   getDarkenedSeatColor: (seat: any) => any,
   *   onSeatClick: (seatId: any, seat: any) => void,
   *   onMouseEnter: (seat: any) => void,
   *   onMouseLeave: (value: any) => void,
   * }}
   */
  {
    seat,
    seatId,
    isSelected,
    selectedLegendType,
    getSeatColor,
    getDarkenedSeatColor,
    onSeatClick,
    onMouseEnter,
    onMouseLeave,
  },
) {
  const { position, dimensions } = seat;
  const seatColor = getSeatColor(seat);
  const darkColor = getDarkenedSeatColor(seat);
  const isDisabled = isSeatDisabled(seat);

  // Apply opacity filter based on selected legend type
  const shouldApplyOpacity = shouldApplyOpacityFilter(
    seat,
    isSelected(seatId),
    selectedLegendType,
  );
  const seatOpacity = shouldApplyOpacity ? 0.3 : 1;

  // Apply size factor to create visual spacing between seats
  // Using 88% of original size creates visible gaps while keeping seats clearly visible
  const sizeFactor = 0.88;
  const seatWidth = (dimensions?.width || 20) * sizeFactor;
  const seatHeight = (dimensions?.height || 20) * sizeFactor;
  const seatRadius = Math.min(seatWidth / 2, seatHeight / 2);

  const handleTouchStart = useCallback((e) => {
    if (!isDisabled) {
      e.stopPropagation();
    }
  }, [isDisabled]);

  const handleTouchEnd = useCallback((e) => {
    if (!isDisabled) {
      e.stopPropagation();
      e.preventDefault();
      onSeatClick(seatId, seat);
    }
  }, [isDisabled, onSeatClick, seatId, seat]);

  const handleClick = useCallback((e) => {
    if (!isDisabled) {
      onSeatClick(seatId, seat);
    }
  }, [isDisabled, onSeatClick, seatId, seat]);

  const handleMouseEnter = useCallback(() => {
    onMouseEnter(seat);
  }, [onMouseEnter, seat]);

  const handleMouseLeave = useCallback(() => {
    onMouseLeave(null);
  }, [onMouseLeave]);

  return (
    <g
      transform={`translate(${position.x}, ${position.y}) rotate(${position.rotation})`}
      className={`cursor-pointer ${isDisabled ? "cursor-not-allowed" : ""}`}
      data-seat-element="true"
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ cursor: isDisabled ? "not-allowed" : "pointer" }}
    >
      <rect
        x={-seatWidth / 2}
        y={-seatHeight / 2}
        width={seatWidth}
        height={seatHeight}
        rx={seatRadius}
        ry={seatRadius}
        fill={seatColor}
        stroke={darkColor}
        strokeWidth="0.5"
        opacity={seatOpacity}
        className={`transition-all ${isSelected(seatId) ? "drop-shadow-lg" : ""}`}
        pointerEvents="auto"
      />
    </g>
  );
});
