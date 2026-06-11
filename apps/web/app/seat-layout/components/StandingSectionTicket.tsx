"use client";
import { X, Ticket, Info } from "lucide-react";
import React, { useState, useEffect } from "react";
import type { LayoutData, StandingSectionElement } from "../types.ts";

export type StandingSectionTicketProps = {
  selectedStandingSection: StandingSectionElement;
  standingQuantity?: number;
  onQuantityChange: (quantity: number) => void;
  onPurchase: () => void;
  onClose: () => void;
  availableSeats?: number;
  layoutData: LayoutData | null;
};

const StandingSectionTicket = ({
  selectedStandingSection,
  standingQuantity = 1,
  onQuantityChange,
  onPurchase,
  onClose,
  availableSeats = 0,
  layoutData,
}: StandingSectionTicketProps) => {
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const ticketPrice = selectedStandingSection?.price || 100;
  const totalPrice = ticketPrice * standingQuantity;

  // Dynamic values based on available seats
  const dynamicMaxTickets = Math.min(10, Math.max(0, availableSeats)); // Max 10 or available seats, whichever is smaller
  const maxTickets = dynamicMaxTickets;
  const availableTickets = availableSeats;

  // Check if sold out
  const isSoldOut = availableSeats <= 0;

  // Handle ESC key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, []);

  const handleClose = () => {
    // Start closing animation
    setIsClosing(true);

    // Close modal after animation completes
    setTimeout(() => {
      onClose();
      setIsClosing(false);
    }, 200);
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  const handleQuantityChange = (newQuantity: number) => {
    if (isSoldOut) return; // Don't allow changes if sold out

    if (newQuantity >= 0 && newQuantity <= maxTickets) {
      onQuantityChange(newQuantity);
    }
  };

  const handlePurchase = async () => {
    if (standingQuantity === 0 || isSoldOut) return;

    setIsPurchasing(true);

    // Simulate purchase process
    await new Promise((resolve) => setTimeout(resolve, 800));

    onPurchase();
  };

  return (
    <div
      className={`fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 transition-opacity duration-200 ${
        isClosing ? "opacity-0" : "opacity-100"
      }`}
      onClick={isClosing ? undefined : handleBackdropClick}
    >
      <div
        className={`bg-white rounded-2xl w-full max-w-xl mx-4 p-6 relative border border-gray-100 transition-all duration-200 ${
          isClosing ? "opacity-0 scale-95" : "opacity-100 scale-100"
        }`}
      >
        {/* Close button */}
        <button
          onClick={isClosing ? undefined : handleClose}
          className={`absolute top-4 right-4 rounded-full p-1.5 disabled:opacity-50 disabled:cursor-not-allowed ${
            isClosing
              ? "text-gray-300 cursor-not-allowed"
              : "text-gray-400 hover:text-gray-700 hover:bg-gray-100"
          }`}
          aria-label="Close modal"
          disabled={isClosing}
        >
          <X className="w-4 h-4" />
        </button>

        {/* Title */}
        <div className="flex items-center gap-2 mb-1.5">
          {/* <Ticket className="w-4 h-4 text-blue-500" /> */}
          <h3 className="text-lg font-bold text-gray-900 tracking-tight">
            {selectedStandingSection?.name || "FAN PIT STANDING"}
          </h3>
        </div>

        {/* Availability indicator */}
        <div className="flex items-center gap-2 mb-5">
          <span className="text-xs text-gray-500">Best available tickets</span>
          {isSoldOut ? (
            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
              Sold Out
            </span>
          ) : (
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                availableTickets <= 2
                  ? "bg-red-100 text-red-700"
                  : availableTickets <= 5
                  ? "bg-orange-100 text-orange-700"
                  : "bg-green-100 text-green-700"
              }`}
            >
              {availableTickets} left
            </span>
          )}
        </div>

        {/* Ticket selection box */}
        <div className="border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50/30 rounded-xl px-5 py-4 mb-5">
          <div className="flex items-center justify-between">
            {/* Left side: Price */}
            <div>
              <div className="text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">
                Price per ticket
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold text-gray-900">
                  {ticketPrice.toFixed(2)}
                </span>
                <span className="text-xs font-medium text-gray-500">AED</span>
              </div>
            </div>

            {/* Right side: Quantity controls */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleQuantityChange(standingQuantity - 1)}
                className={`w-9 h-9 rounded-lg border-2 flex items-center justify-center text-gray-600 hover:bg-gray-100 hover:border-gray-400 disabled:opacity-30 disabled:cursor-not-allowed ${
                  isSoldOut
                    ? "border-gray-200 cursor-not-allowed"
                    : "border-gray-300"
                }`}
                disabled={standingQuantity <= 0 || isSoldOut}
                aria-label="Decrease quantity"
              >
                <span className="text-xl leading-none mb-0.5 font-light">
                  −
                </span>
              </button>

              <span
                className={`text-xl font-bold w-8 text-center ${
                  isSoldOut ? "text-gray-400" : "text-gray-900"
                }`}
              >
                {standingQuantity}
              </span>

              <button
                onClick={() => handleQuantityChange(standingQuantity + 1)}
                className={`w-9 h-9 rounded-lg border-2 flex items-center justify-center text-white hover:bg-blue-600 hover:border-blue-600 disabled:opacity-30 disabled:cursor-not-allowed ${
                  isSoldOut
                    ? "border-gray-200 bg-gray-200 cursor-not-allowed"
                    : "border-blue-500 bg-blue-500 hover:bg-blue-600 hover:border-blue-600"
                }`}
                disabled={standingQuantity >= maxTickets || isSoldOut}
                aria-label="Increase quantity"
              >
                <span className="text-xl leading-none mb-0.5 font-light">
                  +
                </span>
              </button>
            </div>
          </div>

          {/* Quantity limit indicator */}
          <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-500 flex items-center justify-between">
            <span>
              {isSoldOut
                ? "No tickets available"
                : `Maximum ${maxTickets} tickets per order`}
            </span>
            {standingQuantity >= maxTickets && !isSoldOut && (
              <span className="text-orange-600 font-medium">Limit reached</span>
            )}
          </div>
        </div>

        {/* Total price section */}
        {standingQuantity > 0 && !isSoldOut && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl px-5 py-3.5 mb-5 border border-blue-100">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-medium text-gray-600 mb-1 uppercase tracking-wide">
                  Total Amount
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-gray-900">
                    {totalPrice.toFixed(2)}
                  </span>
                  <span className="text-sm font-medium text-gray-600">AED</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-600">
                  {standingQuantity} × {ticketPrice.toFixed(2)} AED
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Incl. all fees
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Sold out message */}
        {isSoldOut && (
          <div className="bg-gradient-to-r from-red-50 to-red-100 rounded-xl px-5 py-3.5 mb-5 border border-red-200">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
              <div className="text-sm font-medium text-red-800">
                Sorry, this standing section is sold out
              </div>
            </div>
          </div>
        )}

        {/* Info section */}
        {standingQuantity === 0 && !isSoldOut && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 mb-5">
            <Info className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-800">
              Select at least 1 ticket to continue
            </p>
          </div>
        )}

        {/* Sold out info */}
        {isSoldOut && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 mb-5">
            <Info className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-red-800">
              No tickets available for this standing section
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={isClosing ? undefined : handleClose}
            className="flex-1 bg-gray-100 text-gray-700 font-semibold py-3 rounded-xl hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isClosing}
          >
            Cancel
          </button>
          <button
            onClick={handlePurchase}
            disabled={
              standingQuantity === 0 || isPurchasing || isClosing || isSoldOut
            }
            className={`flex-1 font-semibold py-3 rounded-xl disabled:cursor-not-allowed ${
              isSoldOut
                ? "bg-red-300 text-red-700"
                : standingQuantity === 0
                ? "bg-gray-300 text-gray-500"
                : "bg-blue-500 text-white hover:bg-blue-600"
            }`}
          >
            {isPurchasing ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Processing...
              </span>
            ) : isSoldOut ? (
              "Sold Out"
            ) : (
              `Purchase ${standingQuantity > 0 ? `(${standingQuantity})` : ""}`
            )}
          </button>
        </div>

        {/* Popular choice indicator */}
      </div>
    </div>
  );
};

export default StandingSectionTicket;
