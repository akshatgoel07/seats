"use client";
import React, { useState, useRef, useCallback, useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  StandingSectionModal,
  SeatLegend,
  SeatBottomBar,
  SeatPreview,
} from "../components";
import {
  SeatElement,
  CircleElement,
  RectangleElement,
  TextElement,
  ImageElement,
} from "../components/svg-elements";
import { useSeatLayout } from "../hooks/useSeatLayout";
import { useSeatSelection } from "../hooks/useSeatSelection";
import { useViewportControls } from "../hooks/useViewportControls";
import { useStandingSection } from "../hooks/useStandingSection";
import { useSeatColors } from "../hooks/useSeatColors";
import { useFPS } from "../hooks/useFPS";
import {
  SEATING_SECTION_HIDE_IMAGE_THRESHOLD,
  SEATING_SECTION_SHOW_LABEL_THRESHOLD,
  SEATING_SECTION_RENDER_PREVIEW_THRESHOLD,
  SEAT_HIDE_THRESHOLD,
  VIEWPORT_PADDING_DESKTOP,
  VIEWPORT_PADDING_MOBILE,
  SHOW_FPS_STATS,
  RENDER_PATHS,
  RENDER_IMAGES,
  RENDER_SEATING_SECTION_IMAGES,
  RENDER_SEATS,
  RENDER_CANVAS_ELEMENTS,
  DEFAULT_VIEWBOX,
  TEXT_HIDE_THRESHOLD,
  SHOW_SEAT_PREVIEW,
  SHOW_TOOLTIP,
  getViewportPadding,
  isSeatDisabled,
  shouldApplyOpacityFilter,
} from "../utils/index";

const SeatLayout = () => {
  // Get route params
  const params = useParams();
  const searchParams = useSearchParams();
  const screenId = /** @type {string} */ (params.screenId);
  const ssId = searchParams.get("ssId");
  const mdId = searchParams.get("mdId");

  // UI State
  const [hoveredSeat, setHoveredSeat] = useState(
    /** @type {any} */ (null),
  );
  const [tooltipSeat, setTooltipSeat] = useState(/** @type {any} */ (null)); // Seat data for tooltip (persists during fade out)
  const [isTooltipVisible, setIsTooltipVisible] = useState(false); // Controls opacity (fade in/out)
  const [selectedLegendType, setSelectedLegendType] = useState(
    /** @type {any} */ (null),
  );

  const svgRef = useRef(/** @type {SVGSVGElement | null} */ (null));

  // Use custom hook for seat layout data
  const {
    layoutData,
    seats,
    screenDetails,
    canvasSceneData,
    rows,
    seatMap,
    seatStatusMap,
    contentBounds,
    seatTypes,
    seatTypesMap,
    openSeatsCount,
    isLoading,
    error,
    showSectionBoundaryInRenderer,
  } = useSeatLayout(
    screenId,
    /** @type {any} */ (ssId),
    /** @type {any} */ (mdId),
  );

  // Use custom hook for viewport controls
  const {
    viewBox,
    setViewBox,
    isDragging,
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    zoomIn,
    zoomOut,
    resetToCenter,
    zoomToElement,
    viewBoxRef, // Added viewBoxRef
  } = useViewportControls(contentBounds, svgRef);

  // Use custom hook  // Seat selection state
  // Using viewBoxRef for event handlers to prevent re-renders, but updating viewBox state for rendering
  const {
    selectedSeats,
    standingTickets,
    handleSeatClick,
    addStandingTickets,
    clearSelection,
    isSeatSelected,
  } = useSeatSelection(layoutData, seatMap, viewBoxRef, setViewBox);

  // Memoized handlers to prevent SeatElement re-renders
  const handleMouseEnter = useCallback((seat) => {
    setHoveredSeat(seat);
  }, []);

  // Handle tooltip state with delay for fade-out animation
  React.useEffect(() => {
    let timeoutId;

    if (hoveredSeat) {
      // If hovering a new seat, show it immediately
      setTooltipSeat(hoveredSeat);
      // Small delay to ensure render happens before opacity transition
      requestAnimationFrame(() => {
        setIsTooltipVisible(true);
      });
    } else {
      // If leaving a seat, start fade out
      setIsTooltipVisible(false);
      // Wait for transition to finish before removing data
      timeoutId = setTimeout(() => {
        setTooltipSeat(null);
      }, 300); // Match Tailwind duration-300
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [hoveredSeat]);

  const handleMouseLeave = useCallback(() => {
    setHoveredSeat(null);
  }, []);

  // Use custom hook for standing section modal
  const {
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
  } = useStandingSection(layoutData, addStandingTickets, zoomToElement);

  // Use custom hook for seat colors
  const { getSeatColor, getDarkenedSeatColor } = useSeatColors(
    seatMap,
    selectedSeats,
    seatTypesMap,
  );

  // Use FPS monitoring hook
  const { fps, avgFps, minFps, reset } = useFPS();

  // Calculate viewport padding based on device type
  const viewportPadding = useMemo(() => {
    return getViewportPadding(
      VIEWPORT_PADDING_DESKTOP,
      VIEWPORT_PADDING_MOBILE,
    );
  }, []);

  // Handle legend item click
  const handleLegendClick = useCallback((seatType) => {
    setSelectedLegendType((prev) => {
      // Handle special filters (selected, unavailable)
      if (
        seatType.sst_seat_type === "selected" ||
        seatType.sst_seat_type === "unavailable"
      ) {
        return prev?.sst_seat_type === seatType.sst_seat_type ? null : seatType;
      }
      // Handle regular seat types
      return prev?.sst_id === seatType.sst_id ? null : seatType;
    });
  }, []);

  // Handle seating section click - zoom to the section
  const handleSeatingSectionClick = useCallback(
    (element) => {
      if (element && zoomToElement) {
        // Only zoom when showing the solid overlay (not when already zoomed in)
        if (viewBox.width >= SEATING_SECTION_HIDE_IMAGE_THRESHOLD) {
          zoomToElement(element, 2.5); // Show element with 2.5x its size for context
        }
      }
    },
    [zoomToElement, viewBox.width],
  );

  // Get visible seats only (viewport culling for performance)
  // Also filter out seats that are behind seating section images when images are visible
  // Get visible seats only (viewport culling for performance)
  // Also filter out seats that are behind seating section images when images are visible
  const visibleSeats = useMemo(() => {
    // Hide all seats when zoomed out beyond threshold (improves performance)
    // Skip this logic if showSectionBoundaryInRenderer is false
    if (showSectionBoundaryInRenderer && viewBox.width > SEAT_HIDE_THRESHOLD) {
      return [];
    }

    // Use device-aware viewport padding for consistent rendering threshold
    const minX = viewBox.x - viewportPadding;
    const minY = viewBox.y - viewportPadding;
    const maxX = viewBox.x + viewBox.width + viewportPadding;
    const maxY = viewBox.y + viewBox.height + viewportPadding;

    // Check if seating section overlays should be visible (not zoomed in too much)
    const shouldHideOverlays =
      viewBox.width < SEATING_SECTION_HIDE_IMAGE_THRESHOLD;

    // Get all seating sections with visible overlays (images or paths)
    const visibleSeatingSections = [];
    if (canvasSceneData?.elements && !shouldHideOverlays) {
      Object.values(canvasSceneData.elements).forEach((element) => {
        if (
          element.type === "seating-section" &&
          viewBox.width >= SEATING_SECTION_RENDER_PREVIEW_THRESHOLD
        ) {
          // Handle rectangle-based seating sections with background images
          if (element.backgroundImage) {
            const scale = element.scale || 1.0;
            const scaledWidth = element.width * scale;
            const scaledHeight = element.height * scale;
            visibleSeatingSections.push({
              type: "rectangle",
              x: element.x,
              y: element.y,
              width: scaledWidth,
              height: scaledHeight,
              rotation: element.rotation || 0,
            });
          }
          // Handle path-based seating sections
          else if (
            element.pathBoundary &&
            element.pathBoundary.points &&
            element.pathBoundary.points.length > 0
          ) {
            visibleSeatingSections.push({
              type: "path",
              points: element.pathBoundary.points,
            });
          }
        }
      });
    }

    // Helper function to check if a point is inside a rotated rectangle
    const isPointInRotatedRect = (pointX, pointY, rect) => {
      const { x, y, width, height, rotation } = rect;
      const halfWidth = width / 2;
      const halfHeight = height / 2;

      // Translate point to rectangle's local coordinate system
      const dx = pointX - x;
      const dy = pointY - y;

      // Rotate point back to rectangle's local space (inverse rotation)
      const cos = Math.cos(-rotation);
      const sin = Math.sin(-rotation);
      const rotatedX = dx * cos - dy * sin;
      const rotatedY = dx * sin + dy * cos;

      // Check if point is inside the unrotated rectangle
      return (
        rotatedX >= -halfWidth &&
        rotatedX <= halfWidth &&
        rotatedY >= -halfHeight &&
        rotatedY <= halfHeight
      );
    };

    // Helper function to check if a point is inside a closed path using ray casting
    const isPointInPath = (pointX, pointY, points) => {
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const xi = points[i].x,
          yi = points[i].y;
        const xj = points[j].x,
          yj = points[j].y;

        const intersect =
          yi > pointY !== yj > pointY &&
          pointX < ((xj - xi) * (pointY - yi)) / (yj - yi) + xi;
        if (intersect) inside = !inside;
      }
      return inside;
    };

    const result = Object.entries(seatMap).filter(([seatId, seat]) => {
      const { position, dimensions } = seat;
      const halfWidth = (dimensions?.width || 20) / 2;
      const halfHeight = (dimensions?.height || 20) / 2;

      // First check viewport visibility
      const isInViewport =
        position.x + halfWidth >= minX &&
        position.x - halfWidth <= maxX &&
        position.y + halfHeight >= minY &&
        position.y - halfHeight <= maxY;

      if (!isInViewport) {
        return false;
      }

      // Check if seat is behind any visible seating section overlay
      if (visibleSeatingSections.length > 0) {
        const seatCenterX = position.x;
        const seatCenterY = position.y;

        // Check if seat center is inside any visible seating section
        for (const section of visibleSeatingSections) {
          if (section.type === "rectangle") {
            if (isPointInRotatedRect(seatCenterX, seatCenterY, section)) {
              // Seat is behind a visible section rectangle, don't render it
              return false;
            }
          } else if (section.type === "path") {
            if (isPointInPath(seatCenterX, seatCenterY, section.points)) {
              // Seat is behind a visible section path, don't render it
              return false;
            }
          }
        }
      }

      return true;
    });

    return result;
  }, [
    seatMap,
    viewBox,
    canvasSceneData,
    viewportPadding,
    showSectionBoundaryInRenderer,
  ]);

  // convert seat position (svg coords) -> screen coords
  const getScreenCoords = (seatPos) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = seatPos.x;
    pt.y = seatPos.y;
    const screenCTM = svg.getScreenCTM();
    if (screenCTM) {
      const { x, y } = pt.matrixTransform(screenCTM);
      return { x, y };
    }
    return { x: 0, y: 0 };
  };

  // Calculate zoom level as a percentage (100% = default viewBox width)
  const zoomPercentage = useMemo(() => {
    const defaultWidth = DEFAULT_VIEWBOX.width;
    const currentWidth = viewBox.width;
    // Zoom level is inverted: smaller viewBox = more zoomed in (higher %)
    const zoomLevel = (defaultWidth / currentWidth) * 100;
    return Math.round(zoomLevel);
  }, [viewBox.width]);

  // Handle loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="text-gray-500">Loading seat layout...</div>
      </div>
    );
  }

  // Handle error state
  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="text-red-500">Error loading seat layout: {error}</div>
      </div>
    );
  }

  // Handle no data state
  if (!layoutData) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="text-gray-500">No seat layout data available</div>
      </div>
    );
  }

  // Determine if preview should be shown (only for routes with ssId and mdId query params)
  const shouldShowPreview = SHOW_SEAT_PREVIEW && ssId && mdId;

  // Type-only alias: the imported SeatPreview's props are inferred too narrowly
  // (empty object) in checkJs; aliasing as `any` keeps the call site valid
  // without changing runtime behavior.
  const SeatPreviewAny = /** @type {any} */ (SeatPreview);

  return (
    <div className="h-screen overflow-hidden relative bg-[#F9FAFB] flex flex-col">
      {/* Seat Preview - Mini-map in top right */}
      {shouldShowPreview && (
        <SeatPreviewAny
          contentBounds={contentBounds}
          viewBox={viewBox}
          seatMap={seatMap}
          canvasSceneData={canvasSceneData}
          setViewBox={setViewBox}
          getSeatColor={getSeatColor}
          selectedSeats={selectedSeats}
        />
      )}

      {/* Zoom Level Indicator - positioned top left */}
      {/* <div className="absolute top-4 left-4 z-50 bg-white/95 backdrop-blur-sm border border-gray-200 px-4 py-2 rounded-lg shadow-lg">
        <div className="flex items-center gap-2">
          <svg
            className="w-4 h-4 text-gray-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <circle cx="11" cy="11" r="8" strokeWidth="2" />
            <path d="M21 21l-4.35-4.35" strokeWidth="2" strokeLinecap="round" />
            <path d="M11 8v6M8 11h6" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className="text-sm font-semibold text-gray-700">
            {zoomPercentage}%
          </span>
          {isDragging && (
            <span className="text-xs text-gray-500 ml-1">(dragging)</span>
          )}
        </div>
      </div> */}

      {/* FPS Monitor */}
      {SHOW_FPS_STATS && (
        <div className="absolute top-4 right-4 z-50 bg-black/80 text-white px-4 py-3 rounded-lg shadow-lg font-mono text-sm">
          <div className="flex flex-col gap-1">
            <div className="flex justify-between gap-4">
              <span className="text-gray-300">Current:</span>
              <span
                className={
                  fps < 30
                    ? "text-red-400"
                    : fps < 50
                    ? "text-yellow-400"
                    : "text-green-400"
                }
              >
                {fps} FPS
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-300">Average:</span>
              <span
                className={
                  avgFps < 30
                    ? "text-red-400"
                    : avgFps < 50
                    ? "text-yellow-400"
                    : "text-green-400"
                }
              >
                {avgFps} FPS
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-300">Minimum:</span>
              <span
                className={
                  minFps < 30
                    ? "text-red-400"
                    : minFps < 50
                    ? "text-yellow-400"
                    : "text-green-400"
                }
              >
                {minFps} FPS
              </span>
            </div>
            <button
              onClick={reset}
              className="mt-2 px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs"
            >
              Reset Stats
            </button>
          </div>
        </div>
      )}
      {/* header */}
      {/* <div className="bg-white shadow-sm border-b px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            {screenDetails?.screen_name || "Seat Selection"}
          </h1>
          <p className="text-sm text-gray-500">
            Select your seats • {selectedSeats.size} selected
          </p>
        </div>
        {selectedSeats.size > 0 && (
          <div className="text-right">
            <div className="text-lg font-bold text-green-600">
              AED
              {Array.from(selectedSeats).reduce((sum, seatId) => {
                const seat = seatMap[seatId];
                return sum + (seat?.seat_price || 0);
              }, 0)}
            </div>
            <div className="text-sm text-gray-500">Total</div>
          </div>
        )}
      </div> */}

      {/* svg */}
      <div className="flex-1 relative" style={{ touchAction: "none" }}>
        <svg
          ref={svgRef}
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
          className="w-full h-full cursor"
          style={{ touchAction: "none", userSelect: "none" }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* rows - guide lines removed for cleaner customer view */}
          {/*
          Object.values(rows).map((row) => {
            const { geometry, transform } = row;
            if (geometry.kind === "line") {
              return (
                <line
                  key={row.id}
                  x1={geometry.p1.x + (transform?.x || 0)}
                  y1={geometry.p1.y + (transform?.y || 0)}
                  x2={geometry.p2.x + (transform?.x || 0)}
                  y2={geometry.p2.y + (transform?.y || 0)}
                  stroke="#666"
                  strokeWidth="2"
                />
              );
            }
            return null;
          })
          */}

          {/* elements (boundaries, shapes, etc.) */}
          {canvasSceneData?.elements &&
            Object.entries(canvasSceneData.elements).map(
              ([elementId, element]) => {
                if (
                  RENDER_PATHS &&
                  element.type === "path" &&
                  element.points &&
                  element.label === "Boundary"
                ) {
                  // Calculate center point for scaling
                  const centerX =
                    element.points.reduce((sum, p) => sum + p.x, 0) /
                    element.points.length;
                  const centerY =
                    element.points.reduce((sum, p) => sum + p.y, 0) /
                    element.points.length;
                  const scale = element.scale || 1.0;

                  // Apply scaling to points
                  const scaledPoints = element.points.map((point) => {
                    let adjustedX = point.x;
                    let adjustedY = point.y;

                    // Apply scale transformation around center point
                    if (scale !== 1.0) {
                      adjustedX = centerX + (point.x - centerX) * scale;
                      adjustedY = centerY + (point.y - centerY) * scale;
                    }

                    return { x: adjustedX, y: adjustedY };
                  });

                  // Render boundary as curved path
                  // Check if element has proper bezier curve handles (created by editor pen tool)
                  if (
                    element.curveHandles &&
                    Object.keys(element.curveHandles).length > 0
                  ) {
                    // Use bezier curves with control points
                    let pathData = `M ${scaledPoints[0].x} ${scaledPoints[0].y}`;

                    for (let i = 1; i < scaledPoints.length; i++) {
                      const segmentIndex = i - 1;
                      const segmentHandles = element.curveHandles[segmentIndex];

                      if (
                        segmentHandles &&
                        segmentHandles.cp1 &&
                        segmentHandles.cp2
                      ) {
                        // Apply scaling to control points
                        let cp1X = segmentHandles.cp1.x;
                        let cp1Y = segmentHandles.cp1.y;
                        let cp2X = segmentHandles.cp2.x;
                        let cp2Y = segmentHandles.cp2.y;

                        // Apply scale transformation around center point
                        if (scale !== 1.0) {
                          cp1X =
                            centerX + (segmentHandles.cp1.x - centerX) * scale;
                          cp1Y =
                            centerY + (segmentHandles.cp1.y - centerY) * scale;
                          cp2X =
                            centerX + (segmentHandles.cp2.x - centerX) * scale;
                          cp2Y =
                            centerY + (segmentHandles.cp2.y - centerY) * scale;
                        }

                        // Use cubic bezier curve with control points
                        pathData += ` C ${cp1X} ${cp1Y} ${cp2X} ${cp2Y} ${scaledPoints[i].x} ${scaledPoints[i].y}`;
                      } else {
                        // Fallback to straight line if no control points
                        pathData += ` L ${scaledPoints[i].x} ${scaledPoints[i].y}`;
                      }
                    }

                    return (
                      <path
                        key={elementId}
                        d={pathData}
                        stroke={element.strokeColor || "rgba(0, 0, 0, 0.9)"}
                        strokeWidth={element.strokeWidth || 2}
                        fill="none"
                        opacity={element.opacity || 1}
                        pointerEvents="none"
                        style={{ cursor: "default" }}
                      />
                    );
                  } else if (element.points.length > 3) {
                    // Legacy quadratic curve rendering for old paths without curve handles
                    let pathData = `M ${scaledPoints[0].x} ${scaledPoints[0].y}`;
                    for (let i = 1; i < scaledPoints.length - 1; i++) {
                      const xc =
                        (scaledPoints[i].x + scaledPoints[i + 1].x) / 2;
                      const yc =
                        (scaledPoints[i].y + scaledPoints[i + 1].y) / 2;
                      pathData += ` Q ${scaledPoints[i].x} ${scaledPoints[i].y} ${xc} ${yc}`;
                    }
                    if (scaledPoints.length > 1) {
                      const lastPoint = scaledPoints[scaledPoints.length - 1];
                      const secondLastPoint =
                        scaledPoints[scaledPoints.length - 2];
                      pathData += ` Q ${secondLastPoint.x} ${secondLastPoint.y} ${lastPoint.x} ${lastPoint.y}`;
                    }

                    return (
                      <path
                        key={elementId}
                        d={pathData}
                        stroke={element.strokeColor || "rgba(0, 0, 0, 0.9)"}
                        strokeWidth={element.strokeWidth || 2}
                        fill="none"
                        opacity={element.opacity || 1}
                        pointerEvents="none"
                        style={{ cursor: "default" }}
                      />
                    );
                  } else {
                    // Render as straight lines for 2-3 points
                    let pathData = `M ${scaledPoints[0].x} ${scaledPoints[0].y}`;
                    for (let i = 1; i < scaledPoints.length; i++) {
                      pathData += ` L ${scaledPoints[i].x} ${scaledPoints[i].y}`;
                    }

                    return (
                      <path
                        key={elementId}
                        d={pathData}
                        stroke={element.strokeColor || "rgba(0, 0, 0, 0.9)"}
                        strokeWidth={element.strokeWidth || 2}
                        fill="none"
                        opacity={element.opacity || 1}
                        pointerEvents="none"
                        style={{ cursor: "default" }}
                      />
                    );
                  }
                } else if (
                  RENDER_CANVAS_ELEMENTS &&
                  element.type === "circle"
                ) {
                  return (
                    <CircleElement
                      key={elementId}
                      element={element}
                      elementId={elementId}
                    />
                  );
                } else if (
                  RENDER_CANVAS_ELEMENTS &&
                  element.type === "rectangle"
                ) {
                  return (
                    <RectangleElement
                      key={elementId}
                      element={element}
                      elementId={elementId}
                    />
                  );
                } else if (RENDER_IMAGES && element.type === "image") {
                  return (
                    <ImageElement
                      key={elementId}
                      element={element}
                      elementId={elementId}
                    />
                  );
                } else if (
                  RENDER_CANVAS_ELEMENTS &&
                  element.type === "standing-section"
                ) {
                  // Calculate scaling
                  const scale = element.scale || 1.0;
                  const scaledWidth = element.width * scale;
                  const scaledHeight = element.height * scale;

                  // Check if sold out for visual styling
                  const isSoldOut = openSeatsCount <= 0;
                  const fillOpacity = element.opacity || 1;
                  const strokeOpacity = element.opacity || 1;
                  const cursorStyle = isSoldOut ? "not-allowed" : "pointer";
                  const fillColor = isSoldOut
                    ? "#f3f4f6" // Gray background when sold out
                    : element.fillColor || "#e5e7eb";
                  const strokeColor = isSoldOut
                    ? "#d1d5db" // Gray border when sold out
                    : element.strokeColor || "#6b7280";

                  return (
                    <g key={elementId}>
                      {/* Render background image if available */}
                      {element.backgroundImage && (
                        <image
                          x={element.x - scaledWidth / 2}
                          y={element.y - scaledHeight / 2}
                          width={scaledWidth}
                          height={scaledHeight}
                          href={element.backgroundImage}
                          opacity={element.opacity || 1}
                          transform={`rotate(${element.rotation || 0} ${
                            element.x
                          } ${element.y})`}
                          pointerEvents="auto"
                          style={{ cursor: cursorStyle }}
                          preserveAspectRatio="xMidYMid slice"
                          onClick={() => handleStandingSectionClick(element)}
                        />
                      )}

                      {/* Render standing section background rectangle */}
                      {!element.backgroundImage && (
                        <rect
                          x={element.x - scaledWidth / 2}
                          y={element.y - scaledHeight / 2}
                          width={scaledWidth}
                          height={scaledHeight}
                          rx={(element.borderRadius || 8) * scale}
                          ry={(element.borderRadius || 8) * scale}
                          fill={fillColor}
                          stroke={strokeColor}
                          strokeWidth={(element.strokeWidth || 2) * scale}
                          opacity={element.opacity || 1}
                          transform={`rotate(${element.rotation || 0} ${
                            element.x
                          } ${element.y})`}
                          pointerEvents="auto"
                          style={{ cursor: cursorStyle }}
                          onClick={() => handleStandingSectionClick(element)}
                        />
                      )}

                      {/* Render standing section border - only for non-image elements */}
                      {!element.backgroundImage && element.strokeWidth > 0 && (
                        <rect
                          x={element.x - scaledWidth / 2}
                          y={element.y - scaledHeight / 2}
                          width={scaledWidth}
                          height={scaledHeight}
                          rx={(element.borderRadius || 8) * scale}
                          ry={(element.borderRadius || 8) * scale}
                          fill="none"
                          stroke={strokeColor}
                          strokeWidth={(element.strokeWidth || 2) * scale}
                          opacity={element.opacity || 1}
                          transform={`rotate(${element.rotation || 0} ${
                            element.x
                          } ${element.y})`}
                          pointerEvents="auto"
                          style={{ cursor: cursorStyle }}
                          onClick={() => handleStandingSectionClick(element)}
                        />
                      )}

                      {/* Render standing section label */}
                      {element.label &&
                        scaledWidth > 30 &&
                        scaledHeight > 20 && (
                          <text
                            x={element.x}
                            y={element.y}
                            fill={isSoldOut ? "#6b7280" : "#000000"}
                            fontSize={(element.labelFontSize || 12) * scale}
                            fontFamily="Arial"
                            textAnchor="middle"
                            dominantBaseline="middle"
                            opacity={element.opacity || 1}
                            transform={`rotate(${element.rotation || 0} ${
                              element.x
                            } ${element.y})`}
                            pointerEvents="auto"
                            style={{ cursor: cursorStyle, userSelect: "none" }}
                            onClick={() => handleStandingSectionClick(element)}
                          >
                            {isSoldOut
                              ? `${element.label} (Sold Out)`
                              : element.label}
                          </text>
                        )}

                      {/* Sold out overlay indicator */}
                      {isSoldOut && scaledWidth > 60 && scaledHeight > 40 && (
                        <text
                          x={element.x}
                          y={element.y + 12 * scale} // Position below the main label
                          fill="#dc2626"
                          fontSize={
                            (element.labelFontSize || 10) * scale * 0.85
                          }
                          fontFamily="Arial"
                          fontWeight="bold"
                          textAnchor="middle"
                          dominantBaseline="middle"
                          opacity={element.opacity || 1}
                          transform={`rotate(${element.rotation || 0} ${
                            element.x
                          } ${element.y})`}
                          pointerEvents="none"
                          style={{ cursor: cursorStyle, userSelect: "none" }}
                        >
                          SOLD OUT
                        </text>
                      )}
                    </g>
                  );
                } else if (RENDER_CANVAS_ELEMENTS && element.type === "group") {
                  // Calculate scaling
                  const scale = element.scale || 1.0;
                  const scaledWidth = element.width * scale;
                  const scaledHeight = element.height * scale;

                  return (
                    <g key={elementId}>
                      {/* Render group bounding box (non-interactive display only) */}
                      <rect
                        x={element.x - scaledWidth / 2}
                        y={element.y - scaledHeight / 2}
                        width={scaledWidth}
                        height={scaledHeight}
                        fill="none"
                        stroke={element.strokeColor || "rgba(0, 0, 0, 0.9)"}
                        strokeWidth={(element.strokeWidth || 2) * scale}
                        strokeDasharray="5,5"
                        opacity={element.opacity || 1}
                        transform={`rotate(${element.rotation || 0} ${
                          element.x
                        } ${element.y})`}
                        pointerEvents="none"
                        style={{ cursor: "default" }}
                      />

                      {element.label && (
                        <text
                          x={element.x + (element.labelX || 0)}
                          y={
                            element.y -
                            scaledHeight / 2 -
                            10 +
                            (element.labelY || 0)
                          }
                          fill="#000000"
                          fontSize={(element.labelFontSize || 12) * scale}
                          fontFamily="Arial"
                          textAnchor="middle"
                          dominantBaseline="middle"
                          opacity={element.opacity || 1}
                          pointerEvents="none"
                          style={{ cursor: "default", userSelect: "none" }}
                          transform={
                            element.labelRotation
                              ? `rotate(${
                                  (element.labelRotation * 180) / Math.PI
                                } ${element.x + (element.labelX || 0)} ${
                                  element.y -
                                  scaledHeight / 2 -
                                  10 +
                                  (element.labelY || 0)
                                })`
                              : undefined
                          }
                        >
                          {element.label}
                        </text>
                      )}

                      {/* Render children elements within the group */}
                      {element.children &&
                        element.children.map((childId) => {
                          const childElement =
                            canvasSceneData.elements[childId];
                          if (!childElement || childElement.parentGroupId) {
                            return null;
                          }

                          // Adjust child position relative to group
                          const adjustedChildElement = {
                            ...childElement,
                            x: element.x + childElement.x,
                            y: element.y + childElement.y,
                            parentGroupId: null, // Prevent infinite recursion
                          };

                          // Handle different child element types
                          if (adjustedChildElement.type === "circle") {
                            const childScale =
                              adjustedChildElement.scale || 1.0;
                            return (
                              <circle
                                key={childId}
                                cx={adjustedChildElement.x}
                                cy={adjustedChildElement.y}
                                r={
                                  (adjustedChildElement.radius ||
                                    Math.min(
                                      adjustedChildElement.width,
                                      adjustedChildElement.height,
                                    ) / 2) * childScale
                                }
                                fill={
                                  adjustedChildElement.fillColor || "#f0f0f0"
                                }
                                stroke={
                                  adjustedChildElement.strokeColor || "#333333"
                                }
                                strokeWidth={
                                  (adjustedChildElement.strokeWidth || 2) *
                                  childScale
                                }
                                opacity={adjustedChildElement.opacity || 1}
                                transform={`rotate(${
                                  adjustedChildElement.rotation || 0
                                } ${adjustedChildElement.x} ${
                                  adjustedChildElement.y
                                })`}
                                pointerEvents="none"
                                style={{ cursor: "default" }}
                              />
                            );
                          } else if (
                            adjustedChildElement.type === "rectangle"
                          ) {
                            const childScale =
                              adjustedChildElement.scale || 1.0;
                            return (
                              <rect
                                key={childId}
                                x={
                                  adjustedChildElement.x -
                                  (adjustedChildElement.width * childScale) / 2
                                }
                                y={
                                  adjustedChildElement.y -
                                  (adjustedChildElement.height * childScale) / 2
                                }
                                width={adjustedChildElement.width * childScale}
                                height={
                                  adjustedChildElement.height * childScale
                                }
                                rx={
                                  (adjustedChildElement.borderRadius || 0) *
                                  childScale
                                }
                                ry={
                                  (adjustedChildElement.borderRadius || 0) *
                                  childScale
                                }
                                fill={
                                  adjustedChildElement.fillColor || "#f0f0f0"
                                }
                                stroke={
                                  adjustedChildElement.strokeColor || "#333333"
                                }
                                strokeWidth={
                                  (adjustedChildElement.strokeWidth || 2) *
                                  childScale
                                }
                                opacity={adjustedChildElement.opacity || 1}
                                transform={`rotate(${
                                  adjustedChildElement.rotation || 0
                                } ${adjustedChildElement.x} ${
                                  adjustedChildElement.y
                                })`}
                                pointerEvents="none"
                                style={{ cursor: "default" }}
                              />
                            );
                          } else if (adjustedChildElement.type === "text") {
                            const childScale =
                              adjustedChildElement.scale || 1.0;
                            // Keep text visible at all zoom levels (important labels like section names)
                            return (
                              <text
                                key={childId}
                                x={adjustedChildElement.x}
                                y={adjustedChildElement.y}
                                fill={
                                  adjustedChildElement.fillColor || "#000000"
                                }
                                fontSize={
                                  (adjustedChildElement.fontSize || 16) *
                                  childScale
                                }
                                fontFamily={
                                  adjustedChildElement.fontFamily || "Arial"
                                }
                                fontWeight={
                                  adjustedChildElement.fontWeight || "normal"
                                }
                                textAnchor={
                                  adjustedChildElement.textAlign === "center"
                                    ? "middle"
                                    : "start"
                                }
                                dominantBaseline="middle"
                                opacity={adjustedChildElement.opacity || 1}
                                transform={`rotate(${
                                  adjustedChildElement.rotation || 0
                                } ${adjustedChildElement.x} ${
                                  adjustedChildElement.y
                                })`}
                                pointerEvents="none"
                                style={{
                                  cursor: "default",
                                  userSelect: "none",
                                }}
                              >
                                {adjustedChildElement.text || "Text"}
                              </text>
                            );
                          } else if (adjustedChildElement.type === "image") {
                            const childScale =
                              adjustedChildElement.scale || 1.0;

                            // Only render SVG images (background elements), not regular image files
                            const isSvgImage =
                              adjustedChildElement.src &&
                              (adjustedChildElement.src.startsWith(
                                "data:image/svg+xml",
                              ) ||
                                adjustedChildElement.src.endsWith(".svg"));

                            if (isSvgImage) {
                              return (
                                <image
                                  key={childId}
                                  x={
                                    adjustedChildElement.x -
                                    (adjustedChildElement.width * childScale) /
                                      2
                                  }
                                  y={
                                    adjustedChildElement.y -
                                    (adjustedChildElement.height * childScale) /
                                      2
                                  }
                                  width={
                                    adjustedChildElement.width * childScale
                                  }
                                  height={
                                    adjustedChildElement.height * childScale
                                  }
                                  href={adjustedChildElement.src}
                                  opacity={adjustedChildElement.opacity || 1}
                                  transform={`rotate(${
                                    adjustedChildElement.rotation || 0
                                  } ${adjustedChildElement.x} ${
                                    adjustedChildElement.y
                                  })`}
                                  pointerEvents="none"
                                  style={{ cursor: "default" }}
                                />
                              );
                            }
                            return null;
                          } else if (
                            adjustedChildElement.type === "path" &&
                            adjustedChildElement.points
                          ) {
                            const childScale =
                              adjustedChildElement.scale || 1.0;

                            // Adjust points relative to group
                            const adjustedPoints =
                              adjustedChildElement.points.map((point) => ({
                                x: element.x + adjustedChildElement.x + point.x,
                                y: element.y + adjustedChildElement.y + point.y,
                              }));

                            // Render path with bezier curves if available
                            if (
                              adjustedChildElement.curveHandles &&
                              Object.keys(adjustedChildElement.curveHandles)
                                .length > 0
                            ) {
                              let pathData = `M ${adjustedPoints[0].x} ${adjustedPoints[0].y}`;

                              for (let i = 1; i < adjustedPoints.length; i++) {
                                const segmentIndex = i - 1;
                                const segmentHandles =
                                  adjustedChildElement.curveHandles[
                                    segmentIndex
                                  ];

                                if (
                                  segmentHandles &&
                                  segmentHandles.cp1 &&
                                  segmentHandles.cp2
                                ) {
                                  // Adjust control points relative to group
                                  const cp1X =
                                    element.x +
                                    adjustedChildElement.x +
                                    segmentHandles.cp1.x;
                                  const cp1Y =
                                    element.y +
                                    adjustedChildElement.y +
                                    segmentHandles.cp1.y;
                                  const cp2X =
                                    element.x +
                                    adjustedChildElement.x +
                                    segmentHandles.cp2.x;
                                  const cp2Y =
                                    element.y +
                                    adjustedChildElement.y +
                                    segmentHandles.cp2.y;

                                  pathData += ` C ${cp1X} ${cp1Y} ${cp2X} ${cp2Y} ${adjustedPoints[i].x} ${adjustedPoints[i].y}`;
                                } else {
                                  pathData += ` L ${adjustedPoints[i].x} ${adjustedPoints[i].y}`;
                                }
                              }

                              return (
                                <path
                                  key={childId}
                                  d={pathData}
                                  stroke={
                                    adjustedChildElement.strokeColor ||
                                    "rgba(0, 0, 0, 0.9)"
                                  }
                                  strokeWidth={
                                    (adjustedChildElement.strokeWidth || 2) *
                                    Math.max(childScale, 0.5)
                                  }
                                  fill="none"
                                  opacity={adjustedChildElement.opacity || 1}
                                  pointerEvents="none"
                                  style={{ cursor: "default" }}
                                />
                              );
                            } else {
                              // Simple path with straight lines
                              let pathData = `M ${adjustedPoints[0].x} ${adjustedPoints[0].y}`;
                              for (let i = 1; i < adjustedPoints.length; i++) {
                                pathData += ` L ${adjustedPoints[i].x} ${adjustedPoints[i].y}`;
                              }

                              return (
                                <path
                                  key={childId}
                                  d={pathData}
                                  stroke={
                                    adjustedChildElement.strokeColor ||
                                    "rgba(0, 0, 0, 0.9)"
                                  }
                                  strokeWidth={
                                    (adjustedChildElement.strokeWidth || 2) *
                                    Math.max(childScale, 0.5)
                                  }
                                  fill="none"
                                  opacity={adjustedChildElement.opacity || 1}
                                  pointerEvents="none"
                                  style={{ cursor: "default" }}
                                />
                              );
                            }
                          }

                          return null;
                        })}
                    </g>
                  );
                }

                return null;
              },
            )}

          {/* seats - only render visible seats for performance */}
          {RENDER_SEATS &&
            visibleSeats.map(([seatId, seat]) => {
              // Resolve everything to primitives here so SeatElement (React.memo)
              // only re-renders the seats whose values actually changed (R3).
              const selected = isSeatSelected(seatId);
              return (
                <SeatElement
                  key={seatId}
                  seat={seat}
                  seatId={seatId}
                  seatColor={getSeatColor(seat)}
                  darkColor={getDarkenedSeatColor(seat)}
                  isSelected={selected}
                  isDisabled={isSeatDisabled(seat)}
                  seatOpacity={
                    shouldApplyOpacityFilter(seat, selected, selectedLegendType)
                      ? 0.3
                      : 1
                  }
                  onSeatClick={handleSeatClick}
                  onMouseEnter={handleMouseEnter}
                  onMouseLeave={handleMouseLeave}
                />
              );
            })}

          {/* seating sections - render after seats for proper z-ordering */}
          {RENDER_SEATING_SECTION_IMAGES &&
            canvasSceneData?.elements &&
            Object.entries(canvasSceneData.elements)
              .filter(
                ([elementId, element]) => element.type === "seating-section",
              )
              // Performance optimization: Filter out sections that shouldn't be rendered at all
              .filter(([elementId, element]) => {
                // If section has a background image, only render when approaching the threshold
                // This prevents rendering heavy images when zoomed in
                if (element.backgroundImage) {
                  return (
                    viewBox.width >= SEATING_SECTION_RENDER_PREVIEW_THRESHOLD
                  );
                }
                // Path-based sections and rectangles always render
                // When zoomed in, they show only the stroke (boundary) which is lightweight
                return true;
              })
              .map(([elementId, element]) => {
                // Calculate scaling
                const scale = element.scale || 1.0;
                const scaledWidth = element.width * scale;
                const scaledHeight = element.height * scale;

                // Check if we should hide the overlay (when zoomed in)
                const shouldHideOverlay =
                  viewBox.width < SEATING_SECTION_HIDE_IMAGE_THRESHOLD;

                // Check if this is a path-based seating section
                if (
                  element.pathBoundary &&
                  element.pathBoundary.points &&
                  element.pathBoundary.points.length > 0
                ) {
                  // Render path-based seating section
                  const points = element.pathBoundary.points;
                  const curveHandles = element.pathBoundary.curveHandles || {};

                  // Build path data with bezier curves
                  let pathData = `M ${points[0].x} ${points[0].y}`;

                  if (Object.keys(curveHandles).length > 0) {
                    for (let i = 1; i < points.length; i++) {
                      const segmentIndex = i - 1;
                      const segmentHandles = curveHandles[segmentIndex];

                      if (
                        segmentHandles &&
                        segmentHandles.cp1 &&
                        segmentHandles.cp2
                      ) {
                        pathData += ` C ${segmentHandles.cp1.x} ${segmentHandles.cp1.y} ${segmentHandles.cp2.x} ${segmentHandles.cp2.y} ${points[i].x} ${points[i].y}`;
                      } else {
                        pathData += ` L ${points[i].x} ${points[i].y}`;
                      }
                    }
                  } else {
                    // Straight lines
                    for (let i = 1; i < points.length; i++) {
                      pathData += ` L ${points[i].x} ${points[i].y}`;
                    }
                  }

                  // Close the path
                  pathData += " Z";

                  // Determine if this section should be clickable (when showing overlay)
                  const isClickable = !shouldHideOverlay && element.showAsSolid;

                  return (
                    <g key={elementId}>
                      {/* Render path - show only stroke when zoomed in */}
                      <path
                        d={pathData}
                        fill={
                          shouldHideOverlay
                            ? "none"
                            : element.fillColor || "transparent"
                        }
                        stroke={element.strokeColor || "#6b7280"}
                        strokeWidth={element.strokeWidth || 2}
                        opacity={1.0}
                        pointerEvents={isClickable ? "auto" : "none"}
                        style={{
                          cursor: isClickable ? "pointer" : "default",
                        }}
                        onClick={
                          isClickable
                            ? () => handleSeatingSectionClick(element)
                            : undefined
                        }
                      />

                      {/* Render seating section label if zoomed out (solid view) */}
                      {element.showAsSolid &&
                        viewBox.width > SEATING_SECTION_SHOW_LABEL_THRESHOLD &&
                        (element.sectionName || element.label) && (
                          <text
                            x={element.x}
                            y={element.y}
                            fill="#000000"
                            fontSize={(element.labelFontSize || 12) * scale}
                            fontFamily="Arial"
                            textAnchor="middle"
                            dominantBaseline="middle"
                            opacity={1.0}
                            pointerEvents={isClickable ? "auto" : "none"}
                            style={{
                              cursor: isClickable ? "pointer" : "default",
                              userSelect: "none",
                            }}
                            onClick={
                              isClickable
                                ? () => handleSeatingSectionClick(element)
                                : undefined
                            }
                          >
                            {element.sectionName || element.label || ""}
                          </text>
                        )}
                    </g>
                  );
                }

                // Render rectangle-based seating section (original behavior)
                // Determine if this section should be clickable (when showing overlay)
                const isClickable = !shouldHideOverlay && element.showAsSolid;

                return (
                  <g key={elementId}>
                    {/* Render background image if available and not zoomed in */}
                    {element.backgroundImage && !shouldHideOverlay && (
                      <image
                        x={element.x - scaledWidth / 2}
                        y={element.y - scaledHeight / 2}
                        width={scaledWidth}
                        height={scaledHeight}
                        href={element.backgroundImage}
                        opacity={1.0}
                        transform={`rotate(${element.rotation || 0} ${
                          element.x
                        } ${element.y})`}
                        pointerEvents={isClickable ? "auto" : "none"}
                        preserveAspectRatio="xMidYMid slice"
                        style={{ cursor: isClickable ? "pointer" : "default" }}
                        onClick={
                          isClickable
                            ? () => handleSeatingSectionClick(element)
                            : undefined
                        }
                      />
                    )}

                    {/* Render seating section background rectangle - show only stroke when zoomed in */}
                    {!element.backgroundImage && (
                      <rect
                        x={element.x - scaledWidth / 2}
                        y={element.y - scaledHeight / 2}
                        width={scaledWidth}
                        height={scaledHeight}
                        rx={(element.borderRadius || 8) * scale}
                        ry={(element.borderRadius || 8) * scale}
                        fill={
                          shouldHideOverlay
                            ? "none"
                            : element.fillColor || "#e5e7eb"
                        }
                        stroke={element.strokeColor || "#6b7280"}
                        strokeWidth={(element.strokeWidth || 2) * scale}
                        opacity={1.0}
                        transform={`rotate(${element.rotation || 0} ${
                          element.x
                        } ${element.y})`}
                        pointerEvents={isClickable ? "auto" : "none"}
                        style={{ cursor: isClickable ? "pointer" : "default" }}
                        onClick={
                          isClickable
                            ? () => handleSeatingSectionClick(element)
                            : undefined
                        }
                      />
                    )}

                    {(element.sectionName || element.label) && (
                      <text
                        x={element.x + (element.labelX || 0)}
                        y={element.y + (element.labelY || 0)}
                        fill="#000000"
                        fontSize={(element.labelFontSize || 12) * scale}
                        fontFamily="Arial"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        opacity={1.0}
                        transform={`rotate(${
                          element.labelRotation
                            ? (element.labelRotation * 180) / Math.PI
                            : element.rotation || 0
                        } ${element.x + (element.labelX || 0)} ${
                          element.y + (element.labelY || 0)
                        })`}
                        pointerEvents={isClickable ? "auto" : "none"}
                        style={{
                          cursor: isClickable ? "pointer" : "default",
                          userSelect: "none",
                        }}
                        onClick={
                          isClickable
                            ? () => handleSeatingSectionClick(element)
                            : undefined
                        }
                      >
                        {element.sectionName || element.label || ""}
                      </text>
                    )}
                  </g>
                );
              })}

          {/* text elements - render last so they appear on top of all other elements */}
          {RENDER_CANVAS_ELEMENTS &&
            canvasSceneData?.elements &&
            Object.entries(canvasSceneData.elements)
              .filter(([elementId, element]) => element.type === "text")
              .map(([elementId, element]) => {
                // Always show text elements (important section labels like "ROYAL CIRCLE", "STALLS", etc.)
                return (
                  <TextElement
                    key={elementId}
                    element={element}
                    elementId={elementId}
                  />
                );
              })}
        </svg>
        {/* HTML Tooltip Overlay - Centered below the seat with pointer on top */}
        {SHOW_TOOLTIP && tooltipSeat && (
          <div
            className={`fixed pointer-events-none z-50 transition-opacity duration-300 ease-in-out ${
              isTooltipVisible ? "opacity-100" : "opacity-0"
            }`}
            style={{
              left: 0,
              top: 0,
              width: "100%",
              height: "100%",
              overflow: "hidden",
            }}
          >
            {(() => {
              const coords = getScreenCoords(tooltipSeat.position);
              // Dynamic background color matching the seat
              const bgColor = getSeatColor(tooltipSeat);
              const isSoldOut =
                isSeatDisabled(tooltipSeat) &&
                tooltipSeat.sl_seat_status !== "0"; // Check seat status logic

              return (
                <div
                  className="absolute flex flex-col items-center justify-center text-center shadow-lg"
                  style={{
                    left: coords.x,
                    top: coords.y + 15, // Position 15px below the seat center
                    transform: "translate(-50%, 0)", // Center horizontally, align top edge to position
                    backgroundColor: bgColor,
                    color: "#000000", // Black text
                    borderRadius: "4px",
                    padding: "4px 8px",
                    minWidth: "120px",
                    fontSize: "12px",
                    whiteSpace: "nowrap",
                  }}
                >
                  {/* Pointer Triangle (Black, pointing UP towards the seat) */}
                  <div
                    style={{
                      position: "absolute",
                      top: "-6px", // Position above the tooltip
                      left: "50%",
                      transform: "translateX(-50%)",
                      width: "0",
                      height: "0",
                      borderLeft: "6px solid transparent",
                      borderRight: "6px solid transparent",
                      borderBottom: "6px solid black", // Pointing up (bottom border is colored)
                    }}
                  />

                  {/* Content */}
                  <div className="text-[13px] font-semibold leading-tight flex items-center justify-center gap-1">
                    <span>{tooltipSeat.sl_seat_name}</span>
                    {!isSoldOut && tooltipSeat.seat_price && (
                      <span className="font-normal ml-1">
                        AED {tooltipSeat.seat_price}
                      </span>
                    )}
                    {isSoldOut && (
                      <span className="font-bold ml-1 text-black">
                        SOLD OUT
                      </span>
                    )}
                  </div>

                  <div className="uppercase text-[11px] leading-tight tracking-wide mt-0.5 opacity-90">
                    {tooltipSeat.sst_seat_type}
                  </div>
                </div>
              );
            })()}
          </div>
        )}{" "}
        {/* Seat Legend - left side */}
        <SeatLegend
          seatTypes={seatTypes}
          selectedLegendType={selectedLegendType}
          onLegendClick={handleLegendClick}
        />
        {/* Seat Bottom Bar */}
        {/* <SeatBottomBar
        openSeatsCount={openSeatsCount}
        seatTypes={seatTypes}
        selectedLegendType={selectedLegendType}
        onLegendClick={handleLegendClick}
      /> */}
        {/* zoom controls */}
        <div className="absolute bottom-1/2 left-4 bg-white rounded-lg shadow-lg p-2 flex flex-col gap-2 z-10">
          <button
            onClick={zoomIn}
            className="w-10 h-10 bg-gray-600 hover:bg-gray-700 text-white rounded-lg flex items-center justify-center font-bold text-lg transition-all duration-200"
            title="Zoom In"
          >
            +
          </button>
          <button
            onClick={resetToCenter}
            className="w-10 h-10 bg-gray-600 hover:bg-gray-700 text-white rounded-lg flex items-center justify-center font-bold text-sm transition-all duration-200"
            title="Reset to Center"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="lucide lucide-rotate-ccw-icon lucide-rotate-ccw"
            >
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
          <button
            onClick={zoomOut}
            className="w-10 h-10 bg-gray-600 hover:bg-gray-700 text-white rounded-lg flex items-center justify-center font-bold text-lg transition-all duration-200"
            title="Zoom Out"
          >
            −
          </button>
        </div>
        {/* controls hint */}
        {/* <div className="absolute bottom-4 right-4 bg-white rounded-lg shadow-lg p-3 text-xs text-gray-500 z-10">
        <div>Scroll to zoom</div>
        <div>Drag to pan</div>
      </div> */}
        {/* Standing Section Popup Modal */}
        <StandingSectionModal
          isOpen={showStandingPopup}
          onClose={() => {
            closeStandingPopup();
          }}
          selectedStandingSection={selectedStandingSection}
          standingQuantity={standingQuantity}
          onQuantityChange={handleStandingQuantityChange}
          onPurchase={handleStandingPurchase}
          availableSeats={
            selectedStandingSection && layoutData
              ? (layoutData.Records || []).filter((seat) => {
                  try {
                    const apiMeta = JSON.parse(seat.sl_meta_data);
                    return (
                      seat.is_open_seating_area === "Y" &&
                      seat.sl_seat_status === "0" && // Available seats
                      apiMeta?.standingSectionId ===
                        selectedStandingSection.id &&
                      seat.seat_reserve_type_id !== 8 &&
                      seat.seat_reserve_type_id !== 12 &&
                      seat.seat_reserve_type_id !== 13
                    ); // Not blocked
                  } catch (e) {
                    return false;
                  }
                }).length
              : openSeatsCount
          }
          layoutData={layoutData}
        />
        {/* Sold Out Message Modal */}
        {showSoldOutMessage && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl w-full max-w-md mx-4 p-6 relative border border-gray-100 shadow-xl">
              {/* Header with icon */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-red-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Sold Out</h3>
                  <p className="text-sm text-gray-600">No tickets available</p>
                </div>
              </div>

              {/* Message */}
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-5">
                <p className="text-sm text-red-800 text-center">
                  Sorry, all standing section tickets have been sold out. Please
                  check back later or select regular seats.
                </p>
              </div>

              {/* Close button */}
              <button
                onClick={() => setShowSoldOutMessage(false)}
                className="w-full bg-gray-100 text-gray-700 font-semibold py-3 rounded-xl hover:bg-gray-200 transition-colors duration-200"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SeatLayout;
