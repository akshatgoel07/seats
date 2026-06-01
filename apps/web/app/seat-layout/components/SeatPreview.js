"use client";
import React, { useMemo, useCallback, useState, useRef, useEffect } from "react";

/**
 * SeatPreview Component - Mini-map showing overview of seat layout
 * Displays a simplified view of the entire layout with current viewport indicator
 * Clicking on the preview navigates to that area
 */
const SeatPreview = React.memo((
  /**
   * @type {{
   *   contentBounds: any,
   *   viewBox: { x: number, y: number, width: number, height: number },
   *   seatMap: any,
   *   canvasSceneData: any,
   *   setViewBox: Function,
   *   getSeatColor: any,
   *   selectedSeats: any,
   * }}
   */
  {
    contentBounds,
    viewBox,
    seatMap,
    canvasSceneData,
    setViewBox,
    getSeatColor,
    selectedSeats,
  },
) => {
  const [isDraggingViewport, setIsDraggingViewport] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [viewportStart, setViewportStart] = useState({ x: 0, y: 0 });
  const svgRef = useRef(/** @type {SVGSVGElement | null} */ (null));
  // Calculate actual bounds from seatMap (transformed positions) and canvas elements
  // This ensures the preview matches the actual rendered content
  const actualBounds = useMemo(() => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let hasContent = false;

    // Calculate bounds from actual seat positions (transformed coordinates)
    if (seatMap && Object.keys(seatMap).length > 0) {
      Object.values(seatMap).forEach((seat) => {
        const { position, dimensions } = seat;
        const halfWidth = (dimensions?.width || 20) / 2;
        const halfHeight = (dimensions?.height || 20) / 2;

        minX = Math.min(minX, position.x - halfWidth);
        minY = Math.min(minY, position.y - halfHeight);
        maxX = Math.max(maxX, position.x + halfWidth);
        maxY = Math.max(maxY, position.y + halfHeight);
        hasContent = true;
      });
    }

    // Also include elements in bounds
    if (canvasSceneData?.elements) {
      Object.values(canvasSceneData.elements).forEach((element) => {
        if (element.type === "seating-section" || element.type === "standing-section") {
          const scale = element.scale || 1.0;
          const halfWidth = (element.width * scale) / 2;
          const halfHeight = (element.height * scale) / 2;
          minX = Math.min(minX, element.x - halfWidth);
          minY = Math.min(minY, element.y - halfHeight);
          maxX = Math.max(maxX, element.x + halfWidth);
          maxY = Math.max(maxY, element.y + halfHeight);
          hasContent = true;
        } else if (element.type === "path" && element.points && element.points.length > 0) {
          element.points.forEach((point) => {
            minX = Math.min(minX, point.x);
            minY = Math.min(minY, point.y);
            maxX = Math.max(maxX, point.x);
            maxY = Math.max(maxY, point.y);
          });
          hasContent = true;
        } else if (element.type === "rectangle" || element.type === "circle") {
          const scale = element.scale || 1.0;
          const halfWidth = (element.width * scale) / 2;
          const halfHeight = (element.height * scale) / 2;
          minX = Math.min(minX, element.x - halfWidth);
          minY = Math.min(minY, element.y - halfHeight);
          maxX = Math.max(maxX, element.x + halfWidth);
          maxY = Math.max(maxY, element.y + halfHeight);
          hasContent = true;
        }
      });
    }

    // Fallback to contentBounds if no content found
    if (!hasContent || minX === Infinity || minY === Infinity || maxX === -Infinity || maxY === -Infinity) {
      return contentBounds;
    }

    // Add minimal padding for better visualization (zoomed in view)
    const width = maxX - minX;
    const height = maxY - minY;
    const padding = 0.05; // 5% padding - smaller for more zoomed in preview
    const paddedWidth = width * (1 + padding * 2);
    const paddedHeight = height * (1 + padding * 2);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    return {
      minX: centerX - paddedWidth / 2,
      minY: centerY - paddedHeight / 2,
      maxX: centerX + paddedWidth / 2,
      maxY: centerY + paddedHeight / 2,
      width: paddedWidth,
      height: paddedHeight,
    };
  }, [seatMap, canvasSceneData?.elements, contentBounds]);

  // Calculate preview dimensions and scale
  const previewData = useMemo(() => {
    if (!actualBounds || !actualBounds.width || !actualBounds.height) return null;
    if (actualBounds.width <= 0 || actualBounds.height <= 0) return null;

    const previewWidth = 280; // Fixed preview width (reduced from 350)
    const previewHeight = 210; // Fixed preview height (reduced from 260)
    const aspectRatio = actualBounds.width / actualBounds.height;

    // Calculate actual preview dimensions maintaining aspect ratio
    let actualWidth = previewWidth;
    let actualHeight = previewWidth / aspectRatio;

    if (actualHeight > previewHeight) {
      actualHeight = previewHeight;
      actualWidth = previewHeight * aspectRatio;
    }

    // Calculate scale to fit content in preview
    const scaleX = actualWidth / actualBounds.width;
    const scaleY = actualHeight / actualBounds.height;
    const scale = Math.min(scaleX, scaleY);

    // Calculate offset to center content in preview
    const offsetX = (previewWidth - actualBounds.width * scale) / 2;
    const offsetY = (previewHeight - actualBounds.height * scale) / 2;

    return {
      width: previewWidth,
      height: previewHeight,
      actualWidth,
      actualHeight,
      scale,
      offsetX,
      offsetY,
      bounds: actualBounds,
    };
  }, [actualBounds]);

  // Calculate viewport rectangle in preview coordinates with throttling
  const viewportRect = useMemo(() => {
    if (!previewData) return null;

    const { scale, offsetX, offsetY, bounds, width: previewWidth, height: previewHeight } = previewData;

    // Convert viewBox coordinates to preview coordinates
    let x = (viewBox.x - bounds.minX) * scale + offsetX;
    let y = (viewBox.y - bounds.minY) * scale + offsetY;
    const width = viewBox.width * scale;
    const height = viewBox.height * scale;

    // Clamp viewport rect to preview bounds for visibility
    const clampedX = Math.max(0, Math.min(x, previewWidth - width));
    const clampedY = Math.max(0, Math.min(y, previewHeight - height));
    const clampedWidth = Math.min(width, previewWidth);
    const clampedHeight = Math.min(height, previewHeight);

    return {
      x: clampedX,
      y: clampedY,
      width: clampedWidth,
      height: clampedHeight,
    };
  }, [previewData, viewBox.x, viewBox.y, viewBox.width, viewBox.height]);

  // Handle click on preview to navigate
  const handlePreviewClick = useCallback(
    (e) => {
      // Don't navigate if we're dragging the viewport
      if (isDraggingViewport) return;
      if (!previewData || !setViewBox) return;

      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      const { scale, offsetX, offsetY, bounds } = previewData;

      // Convert click coordinates to SVG coordinates
      // Account for the viewBox transformation
      const svgX = (clickX - offsetX) / scale + bounds.minX;
      const svgY = (clickY - offsetY) / scale + bounds.minY;

      // Only navigate if click is within content bounds
      if (
        svgX < bounds.minX ||
        svgX > bounds.maxX ||
        svgY < bounds.minY ||
        svgY > bounds.maxY
      ) {
        return;
      }

      // Center viewBox on clicked position
      setViewBox((prev) => ({
        ...prev,
        x: svgX - prev.width / 2,
        y: svgY - prev.height / 2,
      }));
    },
    [previewData, setViewBox, isDraggingViewport]
  );

  // Handle drag start on viewport indicator
  const handleViewportDragStart = useCallback(
    (e) => {
      e.stopPropagation(); // Prevent preview click handler
      if (!previewData || !viewportRect) return;

      const svg = svgRef.current;
      if (!svg) return;

      const rect = svg.getBoundingClientRect();
      const startX = e.clientX - rect.left;
      const startY = e.clientY - rect.top;

      setIsDraggingViewport(true);
      setDragStart({ x: startX, y: startY });
      setViewportStart({ x: viewportRect.x, y: viewportRect.y });
    },
    [previewData, viewportRect]
  );

  // Handle drag move
  const handleViewportDragMove = useCallback(
    (e) => {
      if (!isDraggingViewport || !previewData || !setViewBox || !viewportRect)
        return;

      const svg = svgRef.current;
      if (!svg) return;

      const rect = svg.getBoundingClientRect();
      const currentX = e.clientX - rect.left;
      const currentY = e.clientY - rect.top;

      // Calculate drag delta in preview coordinates
      const deltaX = currentX - dragStart.x;
      const deltaY = currentY - dragStart.y;

      // Convert delta to SVG coordinates
      const { scale, bounds } = previewData;
      const svgDeltaX = deltaX / scale;
      const svgDeltaY = deltaY / scale;

      // Calculate new viewport position in preview coordinates
      const newPreviewX = viewportStart.x + deltaX;
      const newPreviewY = viewportStart.y + deltaY;

      // Clamp to preview bounds
      const { width: previewWidth, height: previewHeight } = previewData;
      const clampedPreviewX = Math.max(
        0,
        Math.min(newPreviewX, previewWidth - viewportRect.width)
      );
      const clampedPreviewY = Math.max(
        0,
        Math.min(newPreviewY, previewHeight - viewportRect.height)
      );

      // Convert back to SVG coordinates
      const newSvgX = (clampedPreviewX - previewData.offsetX) / scale + bounds.minX;
      const newSvgY = (clampedPreviewY - previewData.offsetY) / scale + bounds.minY;

      // Update viewBox
      setViewBox((prev) => ({
        ...prev,
        x: newSvgX,
        y: newSvgY,
      }));
    },
    [isDraggingViewport, previewData, dragStart, viewportStart, viewportRect, setViewBox]
  );

  // Handle drag end
  const handleViewportDragEnd = useCallback(() => {
    setIsDraggingViewport(false);
  }, []);

  // Add global mouse move and mouse up listeners for dragging
  useEffect(() => {
    if (isDraggingViewport) {
      const handleMouseMove = (e) => {
        handleViewportDragMove(e);
      };

      const handleMouseUp = () => {
        handleViewportDragEnd();
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);

      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDraggingViewport, handleViewportDragMove, handleViewportDragEnd]);

  // Check if we have seats to render - affects how seating sections display
  // More robust check that verifies seatMap has actual seat entries
  const hasSeats = useMemo(() => {
    if (!seatMap) return false;
    const seatCount = Object.keys(seatMap).length;
    return seatCount > 0;
  }, [seatMap]);

  // Check if there are boundary paths in the canvas data
  const hasBoundaryPaths = useMemo(() => {
    if (!canvasSceneData?.elements) return false;
    return Object.values(canvasSceneData.elements).some(
      (element) => element.type === "path" && element.label === "Boundary"
    );
  }, [canvasSceneData?.elements]);

  // Calculate seats to render in preview with proper spacing
  // Renders differently based on whether boundary paths exist
  const previewSeats = useMemo(() => {
    if (!hasSeats || !previewData) {
      console.log('[SeatPreview] No seats or preview data available');
      return [];
    }


    const { scale, offsetX, offsetY, bounds, width: previewWidth, height: previewHeight } = previewData;

    console.log('[SeatPreview] Preview calculation starting:', {
      totalSeats: Object.keys(seatMap).length,
      scale,
      bounds,
      previewDimensions: { width: previewWidth, height: previewHeight },
      hasBoundaryPaths
    });



    // Configuration based on layout type
    // No-path layouts (cinema): larger, cleaner rectangular seats
    // Path layouts (theater): smaller dots to not obscure paths
    // Configuration based on layout type
    // Unified to always use the "theater" style (circles) for a consistent, premium look
    // Updated geometry settings for better density and visibility
    const config = { minSize: 2, maxSize: 4, sizeMultiplier: 1.0, gridSize: 2, shape: 'circle' };

    // First pass: Calculate all seat positions and group by actual geometry
    const allSeats = [];
    const seatsByRow = new Map(); // Group seats by row to detect actual spacing

    Object.entries(seatMap).forEach(([seatId, seat]) => {
      const { position, dimensions } = seat;
      const seatWidth = dimensions?.width || 20;
      const seatHeight = dimensions?.height || 20;

      // Convert seat position to preview coordinates
      const previewX = (position.x - bounds.minX) * scale + offsetX;
      const previewY = (position.y - bounds.minY) * scale + offsetY;

      // Only include seats within preview bounds
      if (
        previewX >= -10 &&
        previewX <= previewWidth + 10 &&
        previewY >= -10 &&
        previewY <= previewHeight + 10
      ) {
        const seatColor = getSeatColor ? getSeatColor(seat) : "#cccccc";
        const isSelected = selectedSeats?.has(seat.sl_id) || false;

        // Calculate seat size based on layout type
        const baseSize = Math.min(seatWidth, seatHeight) || 20;
        const scaledSize = baseSize * scale;
        const previewSize = Math.max(config.minSize, Math.min(config.maxSize, scaledSize * config.sizeMultiplier));

        const seatData = {
          id: seatId,
          x: previewX,
          y: previewY,
          svgX: position.x, // Keep original SVG coordinates for spacing calculation
          svgY: position.y,
          color: seatColor,
          size: previewSize,
          width: hasBoundaryPaths ? previewSize : Math.max(2.5, Math.min(6, seatWidth * scale * 0.95)),
          height: hasBoundaryPaths ? previewSize : Math.max(2.5, Math.min(5, seatHeight * scale * 0.95)),
          isSelected,
          shape: config.shape,
        };

        allSeats.push(seatData);

        // Group by approximate row (Y coordinate)
        const rowKey = Math.round(previewY / 5) * 5;
        if (!seatsByRow.has(rowKey)) {
          seatsByRow.set(rowKey, []);
        }
        seatsByRow.get(rowKey).push(seatData);
      }
    });


    // Second pass: Apply spatial thinning to prevent overcrowding
    // Calculate actual seat spacing in SVG coordinates
    let avgSeatSpacingX = 30; // Default fallback
    let avgSeatSpacingY = 30;

    if (seatsByRow.size > 0) {
      const spacingsX = [];
      const spacingsY = [];

      // Calculate X spacing (within rows)
      seatsByRow.forEach((rowSeats) => {
        if (rowSeats.length > 1) {
          const sorted = [...rowSeats].sort((a, b) => a.svgX - b.svgX);
          for (let i = 1; i < sorted.length; i++) {
            const spacing = Math.abs(sorted[i].svgX - sorted[i - 1].svgX);
            if (spacing > 0 && spacing < 100) { // Filter out outliers
              spacingsX.push(spacing);
            }
          }
        }
      });

      // Calculate Y spacing (between rows)
      const rowYPositions = Array.from(seatsByRow.keys()).sort((a, b) => a - b);
      for (let i = 1; i < rowYPositions.length; i++) {
        const row1 = seatsByRow.get(rowYPositions[i - 1]);
        const row2 = seatsByRow.get(rowYPositions[i]);
        if (row1.length > 0 && row2.length > 0) {
          const spacing = Math.abs(row2[0].svgY - row1[0].svgY);
          if (spacing > 0 && spacing < 100) {
            spacingsY.push(spacing);
          }
        }
      }

      // Use median spacing for robustness
      if (spacingsX.length > 0) {
        spacingsX.sort((a, b) => a - b);
        avgSeatSpacingX = spacingsX[Math.floor(spacingsX.length / 2)];
      }
      if (spacingsY.length > 0) {
        spacingsY.sort((a, b) => a - b);
        avgSeatSpacingY = spacingsY[Math.floor(spacingsY.length / 2)];
      }
    }

    // Convert spacing to preview coordinates
    const previewSpacingX = avgSeatSpacingX * scale;
    const previewSpacingY = avgSeatSpacingY * scale;

    // Adjust grid size based on actual seat spacing (more intelligent thinning)
    const adaptiveGridSize = Math.max(
      config.gridSize,
      Math.min(previewSpacingX, previewSpacingY) * 0.7
    );

    // Second pass: Apply intelligent spatial thinning
    const seats = [];
    const occupiedGrid = new Map();

    // Sort by position for consistent thinning (prioritize seats closer to top-left)
    allSeats.sort((a, b) => a.y - b.y || a.x - b.x);

    allSeats.forEach((seat) => {
      // Create grid cell key based on adaptive grid size
      const gridX = Math.floor(seat.x / adaptiveGridSize);
      const gridY = Math.floor(seat.y / adaptiveGridSize);
      const gridKey = `${gridX},${gridY}`;

      // Check if this grid cell is already occupied
      if (!occupiedGrid.has(gridKey)) {
        occupiedGrid.set(gridKey, true);
        seats.push(seat);
      }
    });

    return seats;
  }, [hasSeats, hasBoundaryPaths, seatMap, previewData, getSeatColor, selectedSeats]);

  // Memoize elements to prevent recalculation on every render
  // Render seating sections, boundaries, and other non-seat elements
  const previewElements = useMemo(() => {
    if (!canvasSceneData?.elements || !previewData) return [];

    const { scale, offsetX, offsetY, bounds, width, height } = previewData;
    const elements = [];

    Object.entries(canvasSceneData.elements).forEach(([elementId, element]) => {
      // Handle text elements (for labels like "OFFICIALS", "COURTSIDE", etc.)
      if (element.type === "text") {
        const x = (element.x - bounds.minX) * scale + offsetX;
        const y = (element.y - bounds.minY) * scale + offsetY;
        const fontSize = (element.fontSize || 12) * scale;

        // Only render text if it's large enough to be readable
        if (fontSize >= 6 && element.text) {
          elements.push({
            type: "text",
            id: elementId,
            x,
            y,
            text: element.text,
            fontSize,
            fillColor: element.fillColor || "#000000",
            textAlign: element.textAlign || "center",
            rotation: element.rotation || 0,
          });
        }
      }
      // Handle rectangle elements (for courtside sections, officials area, etc.)
      else if (element.type === "rectangle") {
        const scaleFactor = element.scale || 1.0;
        const x = (element.x - bounds.minX) * scale + offsetX;
        const y = (element.y - bounds.minY) * scale + offsetY;
        const rectWidth = element.width * scaleFactor * scale;
        const rectHeight = element.height * scaleFactor * scale;

        elements.push({
          type: "elementRect",
          id: elementId,
          x: x - rectWidth / 2,
          y: y - rectHeight / 2,
          width: rectWidth,
          height: rectHeight,
          fillColor: element.fillColor || "#ffffff",
          strokeColor: element.strokeColor || "#d1d5db",
          borderRadius: element.borderRadius ? element.borderRadius * scale : 0,
          label: element.label || element.text,
          labelX: element.labelX || 0,
          labelY: element.labelY || 0,
          labelFontSize: element.fontSize || 12,
          rotation: element.rotation || 0,
          elementX: element.x,
          elementY: element.y,
        });
      }
      // Handle circle elements
      else if (element.type === "circle") {
        const scaleFactor = element.scale || 1.0;
        const x = (element.x - bounds.minX) * scale + offsetX;
        const y = (element.y - bounds.minY) * scale + offsetY;
        const radius = (element.radius || Math.min(element.width, element.height) / 2) * scaleFactor * scale;

        elements.push({
          type: "circle",
          id: elementId,
          cx: x,
          cy: y,
          r: radius,
          fillColor: element.fillColor || "#ffffff",
          strokeColor: element.strokeColor || "#d1d5db",
        });
      }
      // Handle boundary paths
      else if (element.type === "path" && element.points && element.label === "Boundary") {
        // Calculate center point for scaling (if needed)
        const centerX =
          element.points.reduce((sum, p) => sum + p.x, 0) /
          element.points.length;
        const centerY =
          element.points.reduce((sum, p) => sum + p.y, 0) /
          element.points.length;
        const elementScale = element.scale || 1.0;

        // Apply scaling to points
        const scaledPoints = element.points.map((point) => {
          let adjustedX = point.x;
          let adjustedY = point.y;

          // Apply scale transformation around center point
          if (elementScale !== 1.0) {
            adjustedX = centerX + (point.x - centerX) * elementScale;
            adjustedY = centerY + (point.y - centerY) * elementScale;
          }

          // Convert to preview coordinates
          const x = (adjustedX - bounds.minX) * scale + offsetX;
          const y = (adjustedY - bounds.minY) * scale + offsetY;
          return { x, y };
        }).filter((p) => p.x >= -10 && p.x <= width + 10 && p.y >= -10 && p.y <= height + 10);

        if (scaledPoints.length >= 2) {
          let pathData = `M ${scaledPoints[0].x} ${scaledPoints[0].y}`;

          // Check if element has bezier curve handles (for curved paths)
          if (
            element.curveHandles &&
            Object.keys(element.curveHandles).length > 0
          ) {
            // Use bezier curves with control points
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
                if (elementScale !== 1.0) {
                  cp1X = centerX + (segmentHandles.cp1.x - centerX) * elementScale;
                  cp1Y = centerY + (segmentHandles.cp1.y - centerY) * elementScale;
                  cp2X = centerX + (segmentHandles.cp2.x - centerX) * elementScale;
                  cp2Y = centerY + (segmentHandles.cp2.y - centerY) * elementScale;
                }

                // Convert control points to preview coordinates
                const cp1PreviewX = (cp1X - bounds.minX) * scale + offsetX;
                const cp1PreviewY = (cp1Y - bounds.minY) * scale + offsetY;
                const cp2PreviewX = (cp2X - bounds.minX) * scale + offsetX;
                const cp2PreviewY = (cp2Y - bounds.minY) * scale + offsetY;

                // Use cubic bezier curve
                pathData += ` C ${cp1PreviewX} ${cp1PreviewY} ${cp2PreviewX} ${cp2PreviewY} ${scaledPoints[i].x} ${scaledPoints[i].y}`;
              } else {
                // Fallback to straight line if no control points
                pathData += ` L ${scaledPoints[i].x} ${scaledPoints[i].y}`;
              }
            }
          } else if (scaledPoints.length > 3) {
            // Legacy quadratic curve rendering for old paths without curve handles
            for (let i = 1; i < scaledPoints.length - 1; i++) {
              const xc = (scaledPoints[i].x + scaledPoints[i + 1].x) / 2;
              const yc = (scaledPoints[i].y + scaledPoints[i + 1].y) / 2;
              pathData += ` Q ${scaledPoints[i].x} ${scaledPoints[i].y} ${xc} ${yc}`;
            }
            if (scaledPoints.length > 1) {
              const lastPoint = scaledPoints[scaledPoints.length - 1];
              const secondLastPoint = scaledPoints[scaledPoints.length - 2];
              pathData += ` Q ${secondLastPoint.x} ${secondLastPoint.y} ${lastPoint.x} ${lastPoint.y}`;
            }
          } else {
            // Straight lines for 2-3 points
            for (let i = 1; i < scaledPoints.length; i++) {
              pathData += ` L ${scaledPoints[i].x} ${scaledPoints[i].y}`;
            }
          }

          // Close the path
          if (scaledPoints.length > 2) {
            pathData += " Z";
          }

          elements.push({
            type: "path",
            id: elementId,
            pathData,
            strokeColor: element.strokeColor || "#6b7280",
            strokeWidth: element.strokeWidth || 2,
          });
        }
      } else if (
        element.type === "seating-section" ||
        element.type === "standing-section"
      ) {
        // Check if this is a path-based seating section (custom shapes like in main view)
        if (
          element.pathBoundary &&
          element.pathBoundary.points &&
          element.pathBoundary.points.length > 0
        ) {
          // Render path-based seating section
          const points = element.pathBoundary.points;
          const curveHandles = element.pathBoundary.curveHandles || {};

          const transformedPoints = points
            .map((point) => {
              const x = (point.x - bounds.minX) * scale + offsetX;
              const y = (point.y - bounds.minY) * scale + offsetY;
              return { x, y };
            })
            .filter((p) => p.x >= -10 && p.x <= width + 10 && p.y >= -10 && p.y <= height + 10);

          if (transformedPoints.length >= 2) {
            let pathData = `M ${transformedPoints[0].x} ${transformedPoints[0].y}`;

            // Use bezier curves if available (same as main view)
            if (Object.keys(curveHandles).length > 0) {
              for (let i = 1; i < transformedPoints.length; i++) {
                const segmentIndex = i - 1;
                const segmentHandles = curveHandles[segmentIndex];

                if (segmentHandles && segmentHandles.cp1 && segmentHandles.cp2) {
                  const cp1X = (segmentHandles.cp1.x - bounds.minX) * scale + offsetX;
                  const cp1Y = (segmentHandles.cp1.y - bounds.minY) * scale + offsetY;
                  const cp2X = (segmentHandles.cp2.x - bounds.minX) * scale + offsetX;
                  const cp2Y = (segmentHandles.cp2.y - bounds.minY) * scale + offsetY;
                  pathData += ` C ${cp1X} ${cp1Y} ${cp2X} ${cp2Y} ${transformedPoints[i].x} ${transformedPoints[i].y}`;
                } else {
                  pathData += ` L ${transformedPoints[i].x} ${transformedPoints[i].y}`;
                }
              }
            } else {
              // Straight lines
              for (let i = 1; i < transformedPoints.length; i++) {
                pathData += ` L ${transformedPoints[i].x} ${transformedPoints[i].y}`;
              }
            }

            if (transformedPoints.length > 2) {
              pathData += " Z";
            }

            elements.push({
              type: "sectionPath",
              id: elementId,
              pathData,
              fillColor: element.fillColor || "#bfdbfe",
              strokeColor: element.strokeColor || "#3b82f6",
              label: element.sectionName || element.label,
              labelX: element.labelX || 0,
              labelY: element.labelY || 0,
              labelFontSize: element.labelFontSize || 12,
              labelRotation: element.labelRotation,
              rotation: element.rotation || 0,
              x: element.x,
              y: element.y,
              // When seats exist, make section transparent so seats show through
              hasSeats,
            });
          }
        } else {
          // Rectangle-based seating section (fallback)
          const scaleFactor = element.scale || 1.0;
          const x = (element.x - bounds.minX) * scale + offsetX;
          const y = (element.y - bounds.minY) * scale + offsetY;
          const rectWidth = element.width * scaleFactor * scale;
          const rectHeight = element.height * scaleFactor * scale;

          elements.push({
            type: "rect",
            id: elementId,
            x: x - rectWidth / 2,
            y: y - rectHeight / 2,
            width: rectWidth,
            height: rectHeight,
            fillColor: element.fillColor || "#bfdbfe",
            strokeColor: element.strokeColor || "#3b82f6",
            borderRadius: element.borderRadius ? element.borderRadius * scale : 0,
            label: element.sectionName || element.label,
            labelX: element.labelX || 0,
            labelY: element.labelY || 0,
            labelFontSize: element.labelFontSize || 12,
            labelRotation: element.labelRotation,
            rotation: element.rotation || 0,
            elementX: element.x,
            elementY: element.y,
            // When seats exist, make section transparent so seats show through
            hasSeats,
          });
        }
      }
    });

    return elements;
  }, [canvasSceneData?.elements, previewData, hasSeats]);

  // Hooks above must run unconditionally on every render; bail out only after
  // they have all been called (otherwise the hook order changes between renders).
  if (!previewData || !actualBounds) {
    return null;
  }

  const { width, height, actualWidth, actualHeight, scale, offsetX, offsetY, bounds } = previewData;

  return (
    <div className="absolute top-4 right-4 z-50 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg overflow-hidden transition-all duration-200 hover:shadow-xl">
      {/* <div className="px-2 py-1 bg-gray-50 border-b border-gray-200">
        <span className="text-xs font-semibold text-gray-700">Preview</span>
      </div> */}
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="cursor-pointer hover:opacity-90 transition-opacity"
        onClick={handlePreviewClick}
        style={{ display: "block" }}
        {.../** @type {any} */ ({ title: "Click to navigate to that area" })}
      >
        {/* Background - white like main view */}
        <rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill="#ffffff"
        />

        {/* Content area indicator - removed to match main view better */}

        {/* Render elements FIRST (boundaries, sections) - same order as main view */}
        {previewElements.map((element) => {
          if (element.type === "path") {
            // Boundary paths - only show when paths exist
            return (
              <path
                key={element.id}
                d={element.pathData}
                fill="none"
                stroke={element.strokeColor || "#6b7280"}
                strokeWidth={Math.max(0.5, (element.strokeWidth || 2) * scale)}
                opacity={0.5}
              />
            );
          } else if (element.type === "sectionPath") {
            // Path-based seating sections (custom shapes)
            // When seats exist, show only stroke so seats are visible
            const labelX = (element.x - bounds.minX) * scale + offsetX + (element.labelX || 0) * scale;
            const labelY = (element.y - bounds.minY) * scale + offsetY + (element.labelY || 0) * scale;
            const fontSize = (element.labelFontSize || 12) * scale;

            return (
              <g key={element.id}>
                <path
                  d={element.pathData}
                  fill={element.hasSeats ? "none" : (element.fillColor || "#bfdbfe")}
                  stroke={element.strokeColor || "#3b82f6"}
                  strokeWidth={element.hasSeats ? 1 : 0}
                  opacity={element.hasSeats ? 0.6 : 1.0}
                />
                {/* Render section label if available and large enough */}
                {element.label && fontSize >= 6 && (
                  <text
                    x={labelX}
                    y={labelY}
                    fill="#000000"
                    fontSize={fontSize}
                    fontFamily="Arial"
                    fontWeight="bold"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    opacity={1.0}
                    transform={
                      element.labelRotation
                        ? `rotate(${(element.labelRotation * 180) / Math.PI} ${labelX} ${labelY})`
                        : element.rotation
                          ? `rotate(${(element.rotation * 180) / Math.PI} ${labelX} ${labelY})`
                          : undefined
                    }
                    style={{ pointerEvents: "none", userSelect: "none" }}
                  >
                    {element.label}
                  </text>
                )}
              </g>
            );
          } else if (element.type === "rect") {
            // Rectangle-based seating sections
            // When seats exist, show only stroke so seats are visible
            const labelX = (element.elementX - bounds.minX) * scale + offsetX + (element.labelX || 0) * scale;
            const labelY = (element.elementY - bounds.minY) * scale + offsetY + (element.labelY || 0) * scale;
            const fontSize = (element.labelFontSize || 12) * scale;

            return (
              <g key={element.id}>
                <rect
                  x={element.x}
                  y={element.y}
                  width={element.width}
                  height={element.height}
                  fill={element.hasSeats ? "none" : (element.fillColor || "#bfdbfe")}
                  stroke={element.strokeColor || "#3b82f6"}
                  strokeWidth={element.hasSeats ? 1 : 0}
                  opacity={element.hasSeats ? 0.6 : 1.0}
                  rx={element.borderRadius}
                  ry={element.borderRadius}
                />
                {/* Render section label if available and large enough */}
                {element.label && fontSize >= 6 && (
                  <text
                    x={labelX}
                    y={labelY}
                    fill="#000000"
                    fontSize={fontSize}
                    fontFamily="Arial"
                    fontWeight="bold"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    opacity={1.0}
                    transform={
                      element.labelRotation
                        ? `rotate(${(element.labelRotation * 180) / Math.PI} ${labelX} ${labelY})`
                        : element.rotation
                          ? `rotate(${(element.rotation * 180) / Math.PI} ${labelX} ${labelY})`
                          : undefined
                    }
                    style={{ pointerEvents: "none", userSelect: "none" }}
                  >
                    {element.label}
                  </text>
                )}
              </g>
            );
          } else if (element.type === "elementRect") {
            // Other rectangle elements (courtside, officials, etc.)
            const labelX = (element.elementX - bounds.minX) * scale + offsetX + (element.labelX || 0) * scale;
            const labelY = (element.elementY - bounds.minY) * scale + offsetY + (element.labelY || 0) * scale;
            const fontSize = (element.labelFontSize || 12) * scale;

            return (
              <g key={element.id}>
                <rect
                  x={element.x}
                  y={element.y}
                  width={element.width}
                  height={element.height}
                  fill={element.fillColor || "#ffffff"}
                  stroke="none"
                  opacity={1.0}
                  rx={element.borderRadius}
                  ry={element.borderRadius}
                  transform={
                    element.rotation
                      ? `rotate(${(element.rotation * 180) / Math.PI} ${element.x + element.width / 2} ${element.y + element.height / 2})`
                      : undefined
                  }
                />
                {/* Render label if available */}
                {element.label && fontSize >= 6 && (
                  <text
                    x={labelX}
                    y={labelY}
                    fill="#000000"
                    fontSize={fontSize}
                    fontFamily="Arial"
                    fontWeight="normal"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    opacity={1.0}
                    transform={
                      element.rotation
                        ? `rotate(${(element.rotation * 180) / Math.PI} ${labelX} ${labelY})`
                        : undefined
                    }
                    style={{ pointerEvents: "none", userSelect: "none" }}
                  >
                    {element.label}
                  </text>
                )}
              </g>
            );
          } else if (element.type === "circle") {
            // Circle elements
            return (
              <circle
                key={element.id}
                cx={element.cx}
                cy={element.cy}
                r={element.r}
                fill={element.fillColor || "#ffffff"}
                stroke="none"
                opacity={1.0}
              />
            );
          } else if (element.type === "text") {
            // Standalone text elements
            return (
              <text
                key={element.id}
                x={element.x}
                y={element.y}
                fill={element.fillColor || "#000000"}
                fontSize={element.fontSize}
                fontFamily="Arial"
                fontWeight="normal"
                textAnchor={element.textAlign === "center" ? "middle" : "start"}
                dominantBaseline="middle"
                opacity={1.0}
                transform={
                  element.rotation
                    ? `rotate(${(element.rotation * 180) / Math.PI} ${element.x} ${element.y})`
                    : undefined
                }
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {element.text}
              </text>
            );
          }
          return null;
        })}

        {/* Render seats - circles for path layouts, rectangles for non-path layouts */}
        {previewSeats.length > 0 && previewSeats.map((seat) => (
          seat.shape === 'rect' ? (
            <rect
              key={seat.id}
              x={seat.x - seat.width / 2}
              y={seat.y - seat.height / 2}
              width={seat.width}
              height={seat.height}
              rx={0.5}
              ry={0.5}
              fill={seat.color}
              stroke={seat.isSelected ? "#000000" : "rgba(0,0,0,0.2)"}
              strokeWidth={seat.isSelected ? 0.5 : 0.25}
              opacity={1.0}
              style={{ pointerEvents: "none" }}
            />
          ) : (
            <circle
              key={seat.id}
              cx={seat.x}
              cy={seat.y}
              r={seat.size}
              fill={seat.color}
              stroke={seat.isSelected ? "#000000" : "none"}
              strokeWidth={seat.isSelected ? 0.5 : 0}
              opacity={1.0}
              style={{ pointerEvents: "none" }}
            />
          )
        ))}

        {/* Current viewport indicator - draggable */}
        {viewportRect && (
          <g>
            <rect
              x={viewportRect.x}
              y={viewportRect.y}
              width={viewportRect.width}
              height={viewportRect.height}
              fill="rgba(59, 130, 246, 0.1)"
              stroke="#3b82f6"
              strokeWidth="2"
              opacity={isDraggingViewport ? 0.9 : 0.8}
              style={{
                cursor: "move",
                pointerEvents: "auto",
              }}
              onMouseDown={handleViewportDragStart}
            />
            {/* Simplified corner indicators - only show if viewport is large enough */}
            {viewportRect.width > 20 && viewportRect.height > 20 && (
              <>
                <circle
                  cx={viewportRect.x}
                  cy={viewportRect.y}
                  r="2.5"
                  fill="#3b82f6"
                  opacity={isDraggingViewport ? 0.9 : 0.8}
                  style={{
                    cursor: "move",
                    pointerEvents: "auto",
                  }}
                  onMouseDown={handleViewportDragStart}
                />
                <circle
                  cx={viewportRect.x + viewportRect.width}
                  cy={viewportRect.y}
                  r="2.5"
                  fill="#3b82f6"
                  opacity={isDraggingViewport ? 0.9 : 0.8}
                  style={{
                    cursor: "move",
                    pointerEvents: "auto",
                  }}
                  onMouseDown={handleViewportDragStart}
                />
                <circle
                  cx={viewportRect.x}
                  cy={viewportRect.y + viewportRect.height}
                  r="2.5"
                  fill="#3b82f6"
                  opacity={isDraggingViewport ? 0.9 : 0.8}
                  style={{
                    cursor: "move",
                    pointerEvents: "auto",
                  }}
                  onMouseDown={handleViewportDragStart}
                />
                <circle
                  cx={viewportRect.x + viewportRect.width}
                  cy={viewportRect.y + viewportRect.height}
                  r="2.5"
                  fill="#3b82f6"
                  opacity={isDraggingViewport ? 0.9 : 0.8}
                  style={{
                    cursor: "move",
                    pointerEvents: "auto",
                  }}
                  onMouseDown={handleViewportDragStart}
                />
              </>
            )}
          </g>
        )}

      </svg>
      {/* Seat count indicator - show total seats in seatMap */}
      {hasSeats && (
        <div className="absolute bottom-1 right-1 bg-gray-800/80 text-white text-xs px-1.5 py-0.5 rounded">
          {Object.keys(seatMap).length} seats
        </div>
      )}
    </div>
  );
}, (/** @type {any} */ prevProps, /** @type {any} */ nextProps) => {
  // Custom comparison function for React.memo
  // Only re-render if critical props change
  // Check viewBox values individually for better performance
  const viewBoxChanged =
    prevProps.viewBox.x !== nextProps.viewBox.x ||
    prevProps.viewBox.y !== nextProps.viewBox.y ||
    prevProps.viewBox.width !== nextProps.viewBox.width ||
    prevProps.viewBox.height !== nextProps.viewBox.height;

  // Check if other props changed
  const otherPropsChanged =
    prevProps.contentBounds !== nextProps.contentBounds ||
    prevProps.seatMap !== nextProps.seatMap ||
    prevProps.canvasSceneData !== nextProps.canvasSceneData ||
    prevProps.selectedSeats !== nextProps.selectedSeats;

  // Return true if nothing changed (don't re-render)
  return !viewBoxChanged && !otherPropsChanged;
});

SeatPreview.displayName = "SeatPreview";

export default SeatPreview;

