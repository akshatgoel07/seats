/**
 * Custom hook for seat layout data fetching and processing
 * Handles:
 * - API data fetching
 * - Parsing canvas scene data
 * - Building seat maps and status maps
 * - Content bounds calculation
 * - Seat types management
 */

import { useState, useEffect, useMemo } from "react";
import ApiService from "@/services/api";
import { calculateOpenSeats } from "../utils.ts";
import {
  buildSeatMap,
  buildSeatStatusMap,
  calculateContentBounds,
} from "../utils/index.ts";

/**
 * Adapt the Go API's getShowSeats payload to the legacy `layoutData` shape that
 * the renderer (useSeatSelection, StandingSectionModal, buildSeatStatusMap,
 * buildSeatMap, calculateOpenSeats) was written against. This keeps the whole
 * render pipeline unchanged while the transport moves to the new backend.
 *
 * Input:  { show, scene, seats: FlatSeat[], status: SeatStatus[] }
 * Output: { status:true, Records:[...], screen_seat_type:[...], screenDetails:[...] }
 */
function buildLegacyLayoutData(data) {
  const scene = data.scene || {};
  const categories = scene?.venue?.categories || [];

  const catById = {};
  categories.forEach((c) => {
    catById[c.id] = c;
  });

  const statusByUid = {};
  (data.status || []).forEach((s) => {
    statusByUid[s.seatUid] = s;
  });

  const Records = (data.seats || []).map((seat) => {
    const st = statusByUid[seat.seatUid] || {};
    const cat = catById[seat.categoryId] || {};
    const available = (st.state ?? 0) === 0;
    return {
      sl_id: seat.seatUid,
      sl_seat_name: seat.label,
      sl_seat_status: available ? "0" : "1", // "0" = available
      seat_price: (st.priceCents ?? 0) / 100,
      seat_reserve_type_id: st.reserveType ?? 1,
      screen_seat_type_id: seat.categoryId,
      is_open_seating_area: seat.isStanding ? "Y" : "N",
      sl_row_num: seat.rowNum,
      sl_col_num: seat.colNum,
      sst_seat_type: cat.name || "",
      sl_meta_data: JSON.stringify({
        id: seat.seatUid,
        Xposition: seat.x,
        Yposition: seat.y,
        rotation: 0,
        ...(seat.standingSectionId
          ? { standingSectionId: seat.standingSectionId }
          : {}),
      }),
    };
  });

  const screen_seat_type = categories.map((c, i) => ({
    sst_id: c.id,
    sst_seat_type: c.name,
    sst_seat_color_code: c.color,
    sst_order: i,
    is_open_seating_area: c.is_open_seating_area || "N",
  }));

  return {
    status: true,
    Records,
    screen_seat_type,
    screenDetails: [
      {
        screen_meta_data: JSON.stringify(scene),
        screen_name: data.show?.name || "",
      },
    ],
  };
}

/**
 * Custom hook for managing seat layout data
 * @param {string} screenId - Layout ID from route params
 * @param {string} ssId - Show ID from query params
 * @param {string} mdId - unused (legacy)
 * @returns {Object} Layout data and derived state
 */
export function useSeatLayout(screenId, ssId, mdId) {
  const [layoutData, setLayoutData] = useState(/** @type {any} */ (null));
  const [seatTypes, setSeatTypes] = useState(/** @type {any[]} */ ([]));
  const [seatTypesMap, setSeatTypesMap] = useState(
    /** @type {Map<any, any>} */ (new Map()),
  );
  const [openSeatsCount, setOpenSeatsCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(/** @type {string | null} */ (null));

  // Fetch show + availability from the Go API and adapt it to the legacy
  // `layoutData` shape the rest of the renderer consumes. The query param `ssId`
  // carries the showId in the new backend.
  useEffect(() => {
    const showId = ssId;
    const fetchSeatLayout = async () => {
      if (!showId) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        const data = await ApiService.getShowSeats(showId);
        // data = { show, scene, seats: FlatSeat[], status: SeatStatus[] }
        if (!data || !data.scene) {
          setError("Invalid seat layout data received");
          return;
        }
        setLayoutData(buildLegacyLayoutData(data));
      } catch (err) {
        console.error("Error fetching seat layout:", err);
        setError(err.message || "Failed to fetch seat layout");
      } finally {
        setIsLoading(false);
      }
    };

    fetchSeatLayout();
  }, [screenId, ssId, mdId]);

  // Extract seat types from layout data for legend
  useEffect(() => {
    if (layoutData?.screen_seat_type) {
      const seatTypesData = layoutData.screen_seat_type;
      setSeatTypes(seatTypesData);

      // Create a map for faster lookups
      const typesMap = new Map();
      seatTypesData.forEach((type) => {
        if (type.sst_seat_type && type.sst_seat_color_code) {
          typesMap.set(type.sst_seat_type, type.sst_seat_color_code);
        }
      });
      setSeatTypesMap(typesMap);
    } else {
      // Fallback: create empty arrays/maps if seat type data is not available
      setSeatTypes([]);
      setSeatTypesMap(new Map());
    }
  }, [layoutData]);

  // Calculate open seats count based on user's criteria
  useEffect(() => {
    if (layoutData?.Records && Array.isArray(layoutData.Records)) {
      const result = calculateOpenSeats(layoutData.Records);
      setOpenSeatsCount(result.totalOpenSeats);
    }
  }, [layoutData]);

  // Memoize seatStatusMap to avoid recalculating on every render
  const seatStatusMap = useMemo(() => {
    if (!layoutData) return {};
    const seats = layoutData.Records || [];
    return buildSeatStatusMap(seats);
  }, [layoutData]);

  // Memoize canvasSceneData and rows
  const { canvasSceneData, rows, showSectionBoundaryInRenderer } =
    useMemo(() => {
      if (!layoutData)
        return {
          canvasSceneData: null,
          rows: {},
          showSectionBoundaryInRenderer: false,
        };

      const screenDetails = layoutData.screenDetails?.[0];
      let parsedCanvasSceneData = null;
      let parsedRows = {};
      let showSectionBoundary = false;

      try {
        if (screenDetails?.screen_meta_data) {
          parsedCanvasSceneData = JSON.parse(screenDetails.screen_meta_data);
          parsedRows = parsedCanvasSceneData.rows || {};
          showSectionBoundary =
            parsedCanvasSceneData.showSectionBoundaryInRenderer || false;
        }
      } catch (error) {
        console.error("Error parsing canvas scene data:", error);
      }

      return {
        canvasSceneData: parsedCanvasSceneData,
        rows: parsedRows,
        showSectionBoundaryInRenderer: showSectionBoundary,
      };
    }, [layoutData]);

  // Memoize seatMap to avoid recalculating on every render
  const seatMap = useMemo(() => {
    if (!canvasSceneData || !canvasSceneData.seats) return {};
    return buildSeatMap(canvasSceneData, seatStatusMap);
  }, [canvasSceneData, seatStatusMap]);

  // Calculate bounding box of all seats and elements to prevent zooming out too far
  const contentBounds = useMemo(() => {
    return calculateContentBounds(canvasSceneData);
  }, [canvasSceneData]);

  // Get screen details for display
  const screenDetails = useMemo(() => {
    return layoutData?.screenDetails?.[0] || null;
  }, [layoutData]);

  // Get all seat records
  const seats = useMemo(() => {
    return layoutData?.Records || [];
  }, [layoutData]);

  return {
    // Raw data
    layoutData,
    seats,
    screenDetails,

    // Processed data
    canvasSceneData,
    rows,
    seatMap,
    seatStatusMap,
    contentBounds,
    showSectionBoundaryInRenderer,

    // Seat types
    seatTypes,
    seatTypesMap,

    // Counts
    openSeatsCount,

    // Loading state
    isLoading,
    error,
  };
}
