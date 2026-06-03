/**
 * SeatElement component
 * Renders an individual seat in the SVG layout.
 *
 * R3: receives fully-resolved PRIMITIVE props (seatColor, darkColor, isSelected,
 * isDisabled, seatOpacity) instead of function props (getSeatColor/isSelected/...)
 * that changed identity on every selection. With primitives, React.memo's shallow
 * compare holds, so selecting one seat re-renders only the toggled seats rather
 * than every visible seat.
 *
 * R16: dropped the blanket `transition-all` class (it animated every property —
 * fill/stroke/opacity/filter — forcing paint on hover/select across all seats).
 */

import React, { useCallback } from "react";

export const SeatElement = React.memo(function SeatElement(
  /**
   * @type {{
   *   seat: any,
   *   seatId: any,
   *   seatColor: string,
   *   darkColor: string,
   *   isSelected: boolean,
   *   isDisabled: boolean,
   *   seatOpacity: number,
   *   onSeatClick: (seatId: any, seat: any) => void,
   *   onMouseEnter: (seat: any) => void,
   *   onMouseLeave: (value: any) => void,
   * }}
   */
  {
    seat,
    seatId,
    seatColor,
    darkColor,
    isSelected,
    isDisabled,
    seatOpacity,
    onSeatClick,
    onMouseEnter,
    onMouseLeave,
  },
) {
  const { position, dimensions } = seat;

  // Apply size factor to create visual spacing between seats
  // Using 88% of original size creates visible gaps while keeping seats clearly visible
  const sizeFactor = 0.88;
  const seatWidth = (dimensions?.width || 20) * sizeFactor;
  const seatHeight = (dimensions?.height || 20) * sizeFactor;
  const seatRadius = Math.min(seatWidth / 2, seatHeight / 2);

  const handleTouchStart = useCallback(
    (e) => {
      if (!isDisabled) {
        e.stopPropagation();
      }
    },
    [isDisabled],
  );

  const handleTouchEnd = useCallback(
    (e) => {
      if (!isDisabled) {
        e.stopPropagation();
        e.preventDefault();
        onSeatClick(seatId, seat);
      }
    },
    [isDisabled, onSeatClick, seatId, seat],
  );

  const handleClick = useCallback(() => {
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
      data-seat-id={seatId}
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
        className={isSelected ? "drop-shadow-lg" : ""}
        pointerEvents="auto"
      />
    </g>
  );
});
