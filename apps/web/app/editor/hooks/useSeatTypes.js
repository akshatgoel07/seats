"use client";

import { useState, useEffect } from "react";
import { ApiService } from "@/services/api.js";

// Loads the seat categories for a layout from the Go backend and adapts them to
// the legacy `sst_*` shape the editor UI still expects. The route param is the
// layoutId; categories live inside the layout's scene (venue.categories), which
// is how the editor authors and persists them.
export function useSeatTypes(layoutId) {
  const [seatTypes, setSeatTypes] = useState(/** @type {any[]} */ ([]));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(/** @type {any} */ (null));

  useEffect(() => {
    let cancelled = false;

    // This effect synchronizes with an external system (the backend): the seat
    // categories cannot be derived during render, they must be fetched. All
    // fetch-lifecycle state is set inside the async flow rather than
    // synchronously at the top, so it isn't mistaken for state mirrored off the
    // layoutId prop.
    (async () => {
      if (!layoutId) {
        setSeatTypes([]);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const layout = await ApiService.getLayout(layoutId);
        const categories = layout?.scene?.venue?.categories || [];

        // Adapt scene category -> legacy sst_* shape used by the editor UI.
        const adapted = categories.map((c, i) => ({
          sst_id: c.id,
          sst_seat_type: c.name,
          sst_seat_color_code: c.color,
          sst_order: i,
          is_open_seating_area: c.is_open_seating_area || "N",
        }));

        if (!cancelled) setSeatTypes(adapted);
      } catch (err) {
        console.error("Error fetching categories:", err);
        if (!cancelled) {
          setError(err);
          setSeatTypes([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [layoutId]);

  // Separate regular seat types from open seating areas (standing sections).
  const regularSeatTypes = seatTypes.filter(
    (type) => type.is_open_seating_area !== "Y",
  );
  const standingSections = seatTypes.filter(
    (type) => type.is_open_seating_area === "Y",
  );

  return {
    seatTypes,
    regularSeatTypes,
    standingSections,
    loading,
    error,
  };
}
