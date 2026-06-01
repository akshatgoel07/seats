"use client";
import React from "react";
import StandingSectionTicket from "./StandingSectionTicket";

const StandingSectionModal = ({
  isOpen,
  onClose,
  selectedStandingSection,
  standingQuantity,
  onQuantityChange,
  onPurchase,
  availableSeats,
  layoutData,
}) => {
  if (!isOpen || !selectedStandingSection) {
    return null;
  }

  return (
    <StandingSectionTicket
      selectedStandingSection={selectedStandingSection}
      standingQuantity={standingQuantity}
      onQuantityChange={onQuantityChange}
      onClose={onClose}
      onPurchase={onPurchase}
      availableSeats={availableSeats}
      layoutData={layoutData}
    />
  );
};

export default StandingSectionModal;
