/**
 * Custom hook for standing section modal management
 * Handles:
 * - Modal visibility state
 * - Standing section selection
 * - Quantity management with validation
 * - Purchase flow
 * - Sold out detection
 * - Available seats calculation
 */

import { useState, useCallback, useEffect } from "react";
import { getAvailableStandingSeats } from "../utils/index.ts";
import { showToast } from "@/app/lib/toast";
import type {
  LayoutData,
  LayoutRecord,
  RendererSeat,
  StandingSectionElement,
} from "../types.ts";

/**
 * Custom hook for managing standing section modal
 * @param {any} layoutData - Layout data containing seat records
 * @param {Function} addStandingTickets - Function to add standing tickets from useSeatSelection
 * @param {Function} zoomToElement - Function to zoom to a specific element
 * @returns {Object} Standing section state and handlers
 */
export function useStandingSection(
  layoutData: LayoutData | null,
  addStandingTickets: (tickets: RendererSeat[]) => void,
  zoomToElement?: (element: StandingSectionElement, paddingMultiplier?: number) => void,
) {
  const [showStandingPopup, setShowStandingPopup] = useState(false);
  const [selectedStandingSection, setSelectedStandingSection] =
    useState<StandingSectionElement | null>(null);
  const [standingQuantity, setStandingQuantity] = useState(0);
  const [showSoldOutMessage, setShowSoldOutMessage] = useState(false);

  // Handle escape key to close popup
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showStandingPopup) {
        setShowStandingPopup(false);
      }
    };

    if (showStandingPopup) {
      document.addEventListener("keydown", handleKeyDown);
      // Prevent body scroll when popup is open
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [showStandingPopup]);

  /**
   * Handle standing section click
   */
  const handleStandingSectionClick = useCallback(
    (element: StandingSectionElement) => {
      if (!layoutData) return;

      const seats = layoutData.Records || [];

      // Find available standing section seats for this specific section
      const availableStandingSeats = getAvailableStandingSeats(
        seats,
        element.id,
      );

      // Check if there are any available seats for this specific standing section
      if (availableStandingSeats.length <= 0) {
        // Show sold out message instead of alert
        setShowSoldOutMessage(true);
        // Auto-hide the message after 3 seconds
        setTimeout(() => setShowSoldOutMessage(false), 3000);
        return;
      }

      // Zoom to the standing section element before showing the modal
      if (zoomToElement) {
        zoomToElement(element, 2.5); // Show element with 2.5x its size for context
      }

      setSelectedStandingSection(element);
      // Don't reset quantity - preserve it when reopening the modal
      setShowStandingPopup(true);
    },
    [layoutData, zoomToElement],
  );

  /**
   * Handle standing section quantity change
   */
  const handleStandingQuantityChange = useCallback(
    (newQuantity: number) => {
      if (selectedStandingSection && layoutData) {
        const seats = layoutData.Records || [];

        // Find available standing section seats for this specific section
        const availableStandingSeats = getAvailableStandingSeats(
          seats,
          selectedStandingSection.id,
        );

        const maxQuantity = Math.min(10, availableStandingSeats.length);
        const finalQuantity = Math.max(0, Math.min(newQuantity, maxQuantity));

        setStandingQuantity(finalQuantity);
      } else {
        setStandingQuantity(Math.max(0, newQuantity));
      }
    },
    [selectedStandingSection, layoutData],
  );

  /**
   * Handle standing section purchase
   */
  const handleStandingPurchase = useCallback(() => {
    if (standingQuantity > 0 && selectedStandingSection && layoutData) {
      const seats = layoutData.Records || [];

      // Find available standing section seats from API data
      const availableStandingSeats = getAvailableStandingSeats(
        seats,
        selectedStandingSection.id,
      );

      // Check if we have enough available seats
      if (availableStandingSeats.length < standingQuantity) {
        // alert(`Only ${availableStandingSeats.length} standing seats available`);
        showToast(
          `Only ${availableStandingSeats.length} standing seats available`,
          "",
        );
        return;
      }

      // Select the first N standing seats based on quantity
      const selectedStandingSeats = availableStandingSeats.slice(
        0,
        standingQuantity,
      );

      // Store the standing seats data using the actual API structure
      const newStandingTickets = selectedStandingSeats.map((seat: LayoutRecord) => {
        try {
          const apiMeta = JSON.parse(seat.sl_meta_data);
          return {
            ...seat, // Include all original API data
            position: {
              x: apiMeta?.Xposition || 0,
              y: apiMeta?.Yposition || 0,
            },
            dimensions: {
              width:
                selectedStandingSection.width / Math.max(standingQuantity, 1),
              height:
                selectedStandingSection.height / Math.max(standingQuantity, 1),
            },
          };
        } catch (e) {
          return {
            ...seat,
            position: { x: 0, y: 0 },
            dimensions: {
              width:
                selectedStandingSection.width / Math.max(standingQuantity, 1),
              height:
                selectedStandingSection.height / Math.max(standingQuantity, 1),
            },
          };
        }
      });

      // Use hook's method to add standing tickets
      addStandingTickets(newStandingTickets);

      setShowStandingPopup(false);
      // Keep the quantity so user can see what they purchased when reopening
    }
  }, [
    standingQuantity,
    selectedStandingSection,
    layoutData,
    addStandingTickets,
  ]);

  /**
   * Close the standing popup modal
   */
  const closeStandingPopup = useCallback(() => {
    setShowStandingPopup(false);
  }, []);

  /**
   * Get available seats count for a specific standing section
   */
  const getAvailableSeatsCount = useCallback(
    (standingSectionId: string) => {
      if (!layoutData) return 0;

      const seats = layoutData.Records || [];
      const availableSeats = getAvailableStandingSeats(
        seats,
        standingSectionId,
      );
      return availableSeats.length;
    },
    [layoutData],
  );

  return {
    showStandingPopup,
    selectedStandingSection,
    standingQuantity,
    showSoldOutMessage,
    setShowSoldOutMessage,
    handleStandingSectionClick,
    handleStandingQuantityChange,
    handleStandingPurchase,
    closeStandingPopup,
    getAvailableSeatsCount,
  };
}
