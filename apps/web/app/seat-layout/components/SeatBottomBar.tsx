"use client";
import React from "react";

const SeatBottomBar = ({
  openSeatsCount,
  seatTypes,
  selectedLegendType,
  onLegendClick,
}) => {
  return (
    <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-white/95 backdrop-blur-sm rounded-xl shadow-xl px-4 py-3 z-20 border border-white/20">
      <div className="flex items-center gap-6">
        <div
          className="flex items-center gap-2 px-3 py-1 bg-green-50 rounded-lg border border-green-200"
          title="Open seating areas that are not reserved (reserve types 8, 12, 13). Handles missing/undefined field values gracefully."
        >
          <svg
            className="w-4 h-4 text-green-600"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
          <span className="text-sm font-semibold text-green-800">
            Open Seats: {openSeatsCount}
          </span>
        </div>

        <div className="flex items-center gap-4">
          {/* Dynamic Seat Type Filters with Prices */}
          {seatTypes
            .filter((seatType) => seatType.sst_is_active === "Y")
            .map((seatType) => {
              const isSelected = selectedLegendType?.sst_id === seatType.sst_id;
              return (
                <div
                  key={seatType.sst_id}
                  className={`group relative flex items-center gap-2 px-2 py-1 rounded-lg cursor-pointer transition-all duration-200  ${
                    isSelected
                      ? "bg-blue-50 border border-blue-300"
                      : " border border-transparent hover:border-gray-200"
                  }`}
                  onClick={() => onLegendClick(seatType)}
                >
                  <svg width="16" height="16" className="drop-shadow-sm">
                    <rect
                      x="2"
                      y="2"
                      width="12"
                      height="12"
                      rx="3"
                      ry="3"
                      fill={seatType.sst_seat_color_code || "#74b9ff"}
                      stroke={isSelected ? "#1e40af" : "#6b7280"}
                      strokeWidth={isSelected ? "2" : "1"}
                      className="transition-all duration-200"
                    />
                  </svg>
                  <span
                    className={`text-xs font-bold ${
                      isSelected
                        ? "text-blue-800"
                        : "text-gray-700 group-hover:text-gray-900"
                    }`}
                  >
                    {seatType.sst_seat_type}
                  </span>
                  {isSelected && (
                    <svg
                      className="w-3 h-3 text-blue-600"
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

          {/* Selected Filter */}
          <div
            className={`group relative flex items-center gap-2 px-2 py-1 rounded-lg cursor-pointer transition-all duration-200  ${
              selectedLegendType?.sst_seat_type === "selected"
                ? "bg-green-50 border border-green-300"
                : "border border-transparent hover:border-gray-200"
            }`}
            onClick={() => {
              // Handle selected filter click
              onLegendClick({
                sst_seat_type: "selected",
                sst_seat_color_code: "#51cf66",
                sst_id: "selected-filter",
              });
            }}
          >
            <svg width="16" height="16" className="drop-shadow-sm">
              <rect
                x="2"
                y="2"
                width="12"
                height="12"
                rx="3"
                ry="3"
                fill="#51cf66"
                stroke={
                  selectedLegendType?.sst_seat_type === "selected"
                    ? "#15803d"
                    : "#6b7280"
                }
                strokeWidth={
                  selectedLegendType?.sst_seat_type === "selected" ? "2" : "1"
                }
                className="transition-all duration-200"
              />
            </svg>
            <span
              className={`text-xs font-bold ${
                selectedLegendType?.sst_seat_type === "selected"
                  ? "text-green-800"
                  : "text-gray-700 group-hover:text-gray-900"
              }`}
            >
              Selected
            </span>
            {selectedLegendType?.sst_seat_type === "selected" && (
              <svg
                className="w-3 h-3 text-green-600"
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

          {/* Unavailable Filter */}
          <div
            className={`group relative flex items-center gap-2 px-2 py-1 rounded-lg cursor-pointer transition-all duration-200  ${
              selectedLegendType?.sst_seat_type === "unavailable"
                ? "bg-gray-50 border border-gray-300"
                : "border border-transparent hover:border-gray-200"
            }`}
            onClick={() => {
              // Handle unavailable filter click
              onLegendClick({
                sst_seat_type: "unavailable",
                sst_seat_color_code: "#939597",
                sst_id: "unavailable-filter",
              });
            }}
          >
            <svg width="16" height="16" className="drop-shadow-sm">
              <rect
                x="2"
                y="2"
                width="12"
                height="12"
                rx="3"
                ry="3"
                fill="#939597"
                stroke={
                  selectedLegendType?.sst_seat_type === "unavailable"
                    ? "#374151"
                    : "#6b7280"
                }
                strokeWidth={
                  selectedLegendType?.sst_seat_type === "unavailable"
                    ? "2"
                    : "1"
                }
                className="transition-all duration-200"
              />
            </svg>
            <span
              className={`text-xs font-bold ${
                selectedLegendType?.sst_seat_type === "unavailable"
                  ? "text-gray-800"
                  : "text-gray-700 group-hover:text-gray-900"
              }`}
            >
              Unavailable
            </span>
            {selectedLegendType?.sst_seat_type === "unavailable" && (
              <svg
                className="w-3 h-3 text-gray-600"
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
        </div>
      </div>
    </div>
  );
};

export default SeatBottomBar;
