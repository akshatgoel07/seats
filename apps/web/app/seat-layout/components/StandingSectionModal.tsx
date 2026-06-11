"use client";
import React from "react";
import StandingSectionTicket from "./StandingSectionTicket.tsx";
import type { LayoutData, StandingSectionElement } from "../types.ts";

type StandingSectionModalProps = {
  isOpen: boolean;
  onClose: () => void;
  selectedStandingSection: StandingSectionElement | null;
  standingQuantity: number;
  onQuantityChange: (quantity: number) => void;
  onPurchase: () => void;
  availableSeats: number;
  layoutData: LayoutData | null;
};

const StandingSectionModal = ({
  isOpen,
  onClose,
  selectedStandingSection,
  standingQuantity,
  onQuantityChange,
  onPurchase,
  availableSeats,
  layoutData,
}: StandingSectionModalProps) => {
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
