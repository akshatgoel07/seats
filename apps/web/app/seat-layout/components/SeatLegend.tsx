"use client";
import React from "react";

const SeatLegend = ({ seatTypes, selectedLegendType, onLegendClick }) => {
  const activeSeatTypes = seatTypes.filter(
    (seatType) => seatType.sst_is_active === "Y",
  );

  return (
    <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-20 select-none">
      {/* Main Legend Panel - Horizontal Bar */}
      <div className="bg-white/95 backdrop-blur-sm rounded-2xl border border-gray-200 shadow-xl px-2 py-1">
        <div className="flex items-center gap-2 flex-wrap justify-center">
          {activeSeatTypes.map((seatType) => {
            const isSelected = selectedLegendType?.sst_id === seatType.sst_id;
            return (
              <div
                key={seatType.sst_id}
                className={`flex items-center gap-2 px-1 py-1.5 rounded-lg cursor-pointer transition-all duration-200 ${
                  isSelected
                    ? "bg-blue-50 border-2 border-blue-400"
                    : "hover:bg-gray-50 border-2 border-transparent"
                }`}
                onClick={() => onLegendClick(seatType)}
              >
                {/* Color Indicator */}
                <div className="relative flex-shrink-0">
                  <svg width="20" height="20">
                    <rect
                      x="2"
                      y="2"
                      width="16"
                      height="16"
                      rx="3"
                      ry="3"
                      fill={seatType.sst_seat_color_code || "#74b9ff"}
                      stroke={isSelected ? "#3b82f6" : "#d1d5db"}
                      strokeWidth={isSelected ? "2" : "1"}
                    />
                  </svg>
                  {isSelected && (
                    <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-blue-500 rounded-full" />
                  )}
                </div>

                {/* Text Content */}
                <div className="flex flex-col">
                  {/* <span className="text-xs font-semibold text-gray-900 capitalize leading-tight">
                    {seatType.sst_seat_type}
                  </span> */}
                  {seatType.seat_price && (
                    <span className="text-xs font-bold text-gray-700 leading-tight">
                      {seatType.seat_price} AED
                    </span>
                  )}
                </div>

                {/* Check Icon */}
                {isSelected && (
                  <svg
                    className="w-4 h-4 text-blue-500 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default SeatLegend;
