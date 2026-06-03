/**
 * Custom hook for viewport pan/zoom controls
 * Handles:
 * - ViewBox state management
 * - Mouse wheel zoom with zoom towards cursor
 * - Mouse drag panning
 * - Touch pinch-to-zoom and pan
 * - Zoom in/out/reset controls
 * - Content bounds clamping
 */

import { useState, useCallback, useRef, useEffect } from "react";
import {
  clampViewBoxToBounds,
  getTouchDistance,
  getTouchCenter,
  ZOOM_WHEEL_SCALE_IN,
  ZOOM_WHEEL_SCALE_OUT,
  ZOOM_IN_SCALE,
  ZOOM_OUT_SCALE,
  MIN_VIEWBOX_WIDTH,
  MAX_VIEWBOX_WIDTH,
  DEFAULT_VIEWBOX,
} from "../utils/index";

/**
 * Custom hook for managing viewport controls
 * @param {any} contentBounds - Content bounds for clamping
 * @param {any} svgRef - Reference to the SVG element
 * @returns {Object} Viewport state and handlers
 */
export function useViewportControls(contentBounds, svgRef) {
  const [viewBox, setViewBox] = useState(DEFAULT_VIEWBOX);
  const viewBoxRef = useRef(DEFAULT_VIEWBOX); // Ref to hold current viewBox for event handlers without triggering re-renders
  const [isDragging, setIsDragging] = useState(false);
  const [lastPanPoint, setLastPanPoint] = useState(
    /** @type {{ x: number, y: number } | null} */ (null),
  );
  const [lastTouchDistance, setLastTouchDistance] = useState(
    /** @type {number | null} */ (null),
  );
  const animationFrameRef = useRef(/** @type {number | null} */ (null));
  const panAnimationFrameRef = useRef(/** @type {number | null} */ (null));
  const hasInitialized = useRef(false);
  const [screenAspectRatio, setScreenAspectRatio] = useState(1);

  // R8: drive pan/zoom imperatively during a gesture so we don't run React
  // (visibleSeats cull + reconciling thousands of <SeatElement>s) on every
  // frame. These refs hold the live gesture state; React state (viewBox) is only
  // committed once the gesture settles.
  const isDraggingRef = useRef(false);
  const lastPanPointRef = useRef(/** @type {{ x: number, y: number } | null} */ (null));
  const svgRectRef = useRef(/** @type {DOMRect | null} */ (null));
  const pendingPanRef = useRef({ dx: 0, dy: 0 });
  const wheelCommitTimerRef = useRef(/** @type {any} */ (null));

  // Keep ref synced with state
  useEffect(() => {
    viewBoxRef.current = viewBox;
  }, [viewBox]);

  /**
   * Apply a viewBox imperatively: update the ref + write the attribute directly
   * on the <svg> so the browser reframes the (already-rendered) seats by simple
   * compositing — without a React re-render. setViewBox is called separately to
   * commit the final value at gesture end.
   */
  const applyViewBoxImperative = useCallback(
    (vb) => {
      viewBoxRef.current = vb;
      const svg = svgRef.current;
      if (svg) {
        svg.setAttribute(
          "viewBox",
          `${vb.x} ${vb.y} ${vb.width} ${vb.height}`,
        );
      }
    },
    [svgRef],
  );

  /**
   * Update screen aspect ratio on resize
   */
  useEffect(() => {
    const updateAspectRatio = () => {
      if (typeof window !== "undefined") {
        setScreenAspectRatio(window.innerHeight / window.innerWidth);
      }
    };

    updateAspectRatio();
    window.addEventListener("resize", updateAspectRatio);
    window.addEventListener("orientationchange", updateAspectRatio);

    return () => {
      window.removeEventListener("resize", updateAspectRatio);
      window.removeEventListener("orientationchange", updateAspectRatio);
    };
  }, []);

  /**
   * Handle mouse wheel zoom
   */
  const handleWheel = useCallback(
    (e) => {
      // e.preventDefault();

      const svg = svgRef.current;
      if (!svg) return;

      // Get mouse position relative to SVG
      const rect = svg.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Convert mouse position to SVG coordinates
      const pt = svg.createSVGPoint();
      pt.x = mouseX;
      pt.y = mouseY;
      const svgCTM = svg.getCTM();
      if (svgCTM) {
        const { x: svgX, y: svgY } = pt.matrixTransform(svgCTM.inverse());

        const scale = e.deltaY > 0 ? ZOOM_WHEEL_SCALE_IN : ZOOM_WHEEL_SCALE_OUT;

        // R8: zoom imperatively against the live viewBox ref (no per-event React
        // render), then debounce a single setViewBox commit once the wheel
        // settles so the cull / LOD recompute happens once, not per tick.
        if (panAnimationFrameRef.current) {
          cancelAnimationFrame(panAnimationFrameRef.current);
        }
        panAnimationFrameRef.current = requestAnimationFrame(() => {
          panAnimationFrameRef.current = null;
          const prev = viewBoxRef.current;
          const newWidth = prev.width * scale;

          const minWidth = MIN_VIEWBOX_WIDTH;
          const maxWidth = MAX_VIEWBOX_WIDTH;
          const clampedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
          const clampedHeight = clampedWidth * screenAspectRatio;
          const actualScale = clampedWidth / prev.width;

          const newX = prev.x + (svgX - prev.x) * (1 - actualScale);
          const newY = prev.y + (svgY - prev.y) * (1 - actualScale);

          applyViewBoxImperative({
            ...prev,
            x: newX,
            y: newY,
            width: clampedWidth,
            height: clampedHeight,
          });
        });

        if (wheelCommitTimerRef.current) {
          clearTimeout(wheelCommitTimerRef.current);
        }
        wheelCommitTimerRef.current = setTimeout(() => {
          setViewBox(viewBoxRef.current);
        }, 140);
      }
    },
    [svgRef, screenAspectRatio, applyViewBoxImperative],
  );

  /**
   * Handle mouse down for panning
   */
  const handleMouseDown = useCallback(
    (e) => {
      if (e.button === 0) {
        setIsDragging(true); // state, for the drag cursor overlay (down/up only)
        isDraggingRef.current = true;
        lastPanPointRef.current = { x: e.clientX, y: e.clientY };
        pendingPanRef.current = { dx: 0, dy: 0 };
        // Cache the SVG rect once per gesture instead of calling
        // getBoundingClientRect (forced layout) on every move.
        const svg = svgRef.current;
        svgRectRef.current = svg ? svg.getBoundingClientRect() : null;
      }
    },
    [svgRef],
  );

  /**
   * Handle mouse move for panning. R8: accumulate deltas and apply ONE
   * imperative viewBox update per animation frame — no React state per move.
   */
  const handleMouseMove = useCallback(
    (e) => {
      if (!isDraggingRef.current || !lastPanPointRef.current) return;

      pendingPanRef.current.dx += e.clientX - lastPanPointRef.current.x;
      pendingPanRef.current.dy += e.clientY - lastPanPointRef.current.y;
      lastPanPointRef.current = { x: e.clientX, y: e.clientY };

      if (panAnimationFrameRef.current != null) return; // a frame is already queued
      panAnimationFrameRef.current = requestAnimationFrame(() => {
        panAnimationFrameRef.current = null;
        const rect =
          svgRectRef.current ||
          (svgRef.current ? svgRef.current.getBoundingClientRect() : null);
        if (!rect) return;
        const prev = viewBoxRef.current;
        const scale = prev.width / rect.width;
        const { dx, dy } = pendingPanRef.current;
        pendingPanRef.current = { dx: 0, dy: 0 };
        applyViewBoxImperative({
          ...prev,
          x: prev.x - dx * scale,
          y: prev.y - dy * scale,
        });
      });
    },
    [svgRef, applyViewBoxImperative],
  );

  /**
   * Handle mouse up to stop panning. Commit the imperatively-updated viewBox to
   * React state once so the cull / LOD / dependent UI recompute a single time.
   */
  const handleMouseUp = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    lastPanPointRef.current = null;
    svgRectRef.current = null;
    setIsDragging(false);
    setViewBox(viewBoxRef.current);
  }, []);

  /**
   * Handle touch start for pinch-to-zoom and panning
   */
  const handleTouchStart = useCallback((e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const distance = getTouchDistance(e.touches);
      setLastTouchDistance(distance);
    } else if (e.touches.length === 1) {
      const target = e.target;
      let currentElement = target;
      let isSeatElement = false;

      while (currentElement && currentElement !== svgRef.current) {
        if (
          currentElement.getAttribute &&
          currentElement.getAttribute("data-seat-element") === "true"
        ) {
          isSeatElement = true;
          break;
        }
        currentElement =
          currentElement.parentElement || currentElement.parentNode;
      }

      if (isSeatElement) {
        return;
      }

      // e.preventDefault();
      setIsDragging(true);
      setLastPanPoint({
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      });
    }
  }, []);

  /**
   * Handle touch move for pinch-to-zoom and panning
   */
  const handleTouchMove = useCallback(
    (e) => {
      const svg = svgRef.current;
      if (!svg) return;

      // e.preventDefault();

      if (e.touches.length === 2 && lastTouchDistance) {
        const currentDistance = getTouchDistance(e.touches);
        const center = getTouchCenter(e.touches);

        if (currentDistance && center) {
          const scale = currentDistance / lastTouchDistance;

          // Get touch center relative to SVG
          const rect = svg.getBoundingClientRect();
          const mouseX = center.x - rect.left;
          const mouseY = center.y - rect.top;

          // Convert touch center to SVG coordinates
          const pt = svg.createSVGPoint();
          pt.x = mouseX;
          pt.y = mouseY;
          const svgCTM = svg.getCTM();
          if (svgCTM) {
            const { x: svgX, y: svgY } = pt.matrixTransform(svgCTM.inverse());

            requestAnimationFrame(() => {
              setViewBox((prev) => {
                const newWidth = prev.width / scale;

                // Bounds checking
                const minWidth = MIN_VIEWBOX_WIDTH;
                const maxWidth = MAX_VIEWBOX_WIDTH; // Allow unlimited zoom out like the editor
                const clampedWidth = Math.max(
                  minWidth,
                  Math.min(maxWidth, newWidth),
                );

                // Maintain screen aspect ratio for consistent panning
                const clampedHeight = clampedWidth * screenAspectRatio;

                const actualScale = clampedWidth / prev.width;

                // Calculate zoom towards touch center
                let newX = prev.x + (svgX - prev.x) * (1 - actualScale);
                let newY = prev.y + (svgY - prev.y) * (1 - actualScale);

                // Don't clamp position - allow free panning like the editor
                return {
                  ...prev,
                  x: newX,
                  y: newY,
                  width: clampedWidth,
                  height: clampedHeight,
                };
              });
            });
          }
          setLastTouchDistance(currentDistance);
        }
      } else if (e.touches.length === 1 && isDragging && lastPanPoint) {
        e.preventDefault();
        // Get screen pixel deltas
        const dx = e.touches[0].clientX - lastPanPoint.x;
        const dy = e.touches[0].clientY - lastPanPoint.y;
        // Convert screen pixel movement to SVG coordinate movement
        // Use a uniform scale based on the viewBox width to ensure consistent panning speed
        // in both horizontal and vertical directions regardless of screen aspect ratio
        const rect = svg.getBoundingClientRect();
        const scale = viewBox.width / rect.width;
        // Use requestAnimationFrame for smooth panning, especially when zoomed out
        if (panAnimationFrameRef.current) {
          cancelAnimationFrame(panAnimationFrameRef.current);
        }
        panAnimationFrameRef.current = requestAnimationFrame(() => {
          setViewBox((prev) => {
            // Apply uniform scale for consistent drag behavior in all directions
            let newX = prev.x - dx * scale;
            let newY = prev.y - dy * scale;
            // Don't clamp panning - allow free panning like the editor
            return {
              ...prev,
              x: newX,
              y: newY,
            };
          });
          panAnimationFrameRef.current = null;
        });
        setLastPanPoint({
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
        });
      }
    },
    [
      isDragging,
      lastPanPoint,
      lastTouchDistance,
      svgRef,
      viewBox.width,
      screenAspectRatio,
    ],
  );

  /**
   * Handle touch end to stop panning/zooming
   */
  const handleTouchEnd = useCallback((e) => {
    const target = e.target;
    let currentElement = target;
    let isSeatElement = false;

    while (currentElement && currentElement !== svgRef.current) {
      if (
        currentElement.getAttribute &&
        currentElement.getAttribute("data-seat-element") === "true"
      ) {
        isSeatElement = true;
        break;
      }
      currentElement =
        currentElement.parentElement || currentElement.parentNode;
    }

    if (isSeatElement) {
      return;
    }

    e.preventDefault();
    setIsDragging(false);
    setLastPanPoint(null);
    setLastTouchDistance(null);
  }, []);

  /**
   * Zoom in button handler with smooth animation
   */
  const zoomIn = useCallback(() => {
    // Cancel any ongoing animation
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    const startViewBox = { ...viewBox };
    const scale = ZOOM_IN_SCALE;
    const newWidth = startViewBox.width * scale;

    // Bounds checking - prevent over-zooming
    const minWidth = MIN_VIEWBOX_WIDTH;
    const maxWidth = contentBounds ? contentBounds.width : MAX_VIEWBOX_WIDTH;
    const clampedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

    // Maintain screen aspect ratio for consistent panning
    const clampedHeight = clampedWidth * screenAspectRatio;

    // Calculate center of current view
    const centerX = startViewBox.x + startViewBox.width / 2;
    const centerY = startViewBox.y + startViewBox.height / 2;

    // Calculate new position to maintain center
    const targetX = centerX - clampedWidth / 2;
    const targetY = centerY - clampedHeight / 2;

    const targetViewBox = {
      x: targetX,
      y: targetY,
      width: clampedWidth,
      height: clampedHeight,
    };

    // Smooth animation
    const animationDuration = 500; // milliseconds
    const startTime = performance.now();

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / animationDuration, 1);
      const easedProgress = easeInOutCubic(progress);

      const currentViewBox = {
        x: startViewBox.x + (targetViewBox.x - startViewBox.x) * easedProgress,
        y: startViewBox.y + (targetViewBox.y - startViewBox.y) * easedProgress,
        width:
          startViewBox.width +
          (targetViewBox.width - startViewBox.width) * easedProgress,
        height:
          startViewBox.height +
          (targetViewBox.height - startViewBox.height) * easedProgress,
      };

      setViewBox(currentViewBox);

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        animationFrameRef.current = null;
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);
  }, [viewBox, screenAspectRatio]);

  /**
   * Zoom out button handler with smooth animation
   */
  const zoomOut = useCallback(() => {
    // Cancel any ongoing animation
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    const startViewBox = { ...viewBox };
    const scale = ZOOM_OUT_SCALE;
    const newWidth = startViewBox.width * scale;

    // Bounds checking - prevent over-zooming
    const minWidth = MIN_VIEWBOX_WIDTH;
    const maxWidth = MAX_VIEWBOX_WIDTH; // Allow unlimited zoom out like the editor
    const clampedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

    // Maintain screen aspect ratio for consistent panning
    const clampedHeight = clampedWidth * screenAspectRatio;

    // Calculate center of current view
    const centerX = startViewBox.x + startViewBox.width / 2;
    const centerY = startViewBox.y + startViewBox.height / 2;

    // Calculate new position to maintain center
    let targetX = centerX - clampedWidth / 2;
    let targetY = centerY - clampedHeight / 2;

    // Don't clamp position when zooming out - allow free panning like the editor
    const targetViewBox = {
      x: targetX,
      y: targetY,
      width: clampedWidth,
      height: clampedHeight,
    };

    // Smooth animation
    const animationDuration = 600; // milliseconds
    const startTime = performance.now();

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / animationDuration, 1);
      const easedProgress = easeInOutCubic(progress);

      const currentViewBox = {
        x: startViewBox.x + (targetViewBox.x - startViewBox.x) * easedProgress,
        y: startViewBox.y + (targetViewBox.y - startViewBox.y) * easedProgress,
        width:
          startViewBox.width +
          (targetViewBox.width - startViewBox.width) * easedProgress,
        height:
          startViewBox.height +
          (targetViewBox.height - startViewBox.height) * easedProgress,
      };

      setViewBox(currentViewBox);

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        animationFrameRef.current = null;
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);
  }, [contentBounds, viewBox, screenAspectRatio]);

  /**
   * Reset to center/fit view with smooth animation
   */
  const resetToCenter = useCallback(() => {
    // Cancel any ongoing animation
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    const startViewBox = { ...viewBox };
    let targetViewBox;

    if (contentBounds && screenAspectRatio > 0) {
      // Adjust viewBox to match screen aspect ratio for consistent panning
      const contentAspectRatio = contentBounds.height / contentBounds.width;
      let width = contentBounds.width;
      let height = contentBounds.height;

      // If screen is taller than content (portrait mode), adjust viewBox height
      if (screenAspectRatio > contentAspectRatio) {
        height = width * screenAspectRatio;
      }
      // If screen is wider than content (landscape mode), adjust viewBox width
      else {
        width = height / screenAspectRatio;
      }

      targetViewBox = {
        x: contentBounds.minX - (width - contentBounds.width) / 2,
        y: contentBounds.minY - (height - contentBounds.height) / 2,
        width: width,
        height: height,
      };
    } else {
      targetViewBox = DEFAULT_VIEWBOX;
    }

    // Smooth animation
    const animationDuration = 400; // milliseconds
    const startTime = performance.now();

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / animationDuration, 1);
      const easedProgress = easeInOutCubic(progress);

      const currentViewBox = {
        x: startViewBox.x + (targetViewBox.x - startViewBox.x) * easedProgress,
        y: startViewBox.y + (targetViewBox.y - startViewBox.y) * easedProgress,
        width:
          startViewBox.width +
          (targetViewBox.width - startViewBox.width) * easedProgress,
        height:
          startViewBox.height +
          (targetViewBox.height - startViewBox.height) * easedProgress,
      };

      setViewBox(currentViewBox);

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        animationFrameRef.current = null;
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);
  }, [contentBounds, viewBox, screenAspectRatio]);

  /**
   * Easing function for smooth animation (ease-in-out)
   * @param {number} t - Progress value between 0 and 1
   * @returns {number} Eased value
   */
  const easeInOutCubic = (t) => {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  };

  /**
   * Zoom to specific element with smooth animation
   * @param {Object} element - Element to zoom to (must have x, y, width, height, scale, rotation)
   * @param {number} paddingMultiplier - Multiplier for padding around element (default: 1.5)
   */
  const zoomToElement = useCallback(
    (element, paddingMultiplier = 1.5) => {
      if (!element) return;

      // Cancel any ongoing animation
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      let elementCenterX, elementCenterY, scaledWidth, scaledHeight;

      if (
        element.pathBoundary &&
        element.pathBoundary.points &&
        element.pathBoundary.points.length > 0
      ) {
        const points = element.pathBoundary.points;

        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;

        points.forEach((p) => {
          if (p && typeof p.x === "number" && typeof p.y === "number") {
            minX = Math.min(minX, p.x);
            maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y);
            maxY = Math.max(maxY, p.y);
          }
        });

        if (
          minX === Infinity ||
          maxX === -Infinity ||
          minY === Infinity ||
          maxY === -Infinity
        ) {
          return;
        }

        elementCenterX = (minX + maxX) / 2;
        elementCenterY = (minY + maxY) / 2;
        scaledWidth = Math.max(
          maxX - minX,
          MIN_VIEWBOX_WIDTH / paddingMultiplier,
        );
        scaledHeight = Math.max(
          maxY - minY,
          MIN_VIEWBOX_WIDTH / paddingMultiplier,
        );
      } else {
        const scale = element.scale || 1.0;
        const width = element.width || 0;
        const height = element.height || 0;

        if (width <= 0 || height <= 0) {
          return;
        }

        scaledWidth = width * scale;
        scaledHeight = height * scale;

        if (typeof element.x !== "number" || typeof element.y !== "number") {
          return;
        }

        elementCenterX = element.x;
        elementCenterY = element.y;

        const rotation = element.rotation || 0;
        if (rotation !== 0) {
          const normalizedRotation = rotation % (Math.PI * 2);
          if (normalizedRotation !== 0) {
            const cos = Math.abs(Math.cos(normalizedRotation));
            const sin = Math.abs(Math.sin(normalizedRotation));
            const rotatedWidth = scaledWidth * cos + scaledHeight * sin;
            const rotatedHeight = scaledWidth * sin + scaledHeight * cos;
            scaledWidth = rotatedWidth;
            scaledHeight = rotatedHeight;
          }
        }
      }

      const viewBoxWidth = scaledWidth * paddingMultiplier;

      if (viewBoxWidth <= 0 || !isFinite(viewBoxWidth)) {
        return;
      }

      const minWidth = MIN_VIEWBOX_WIDTH;
      const maxWidth = MAX_VIEWBOX_WIDTH; // Allow unlimited zoom out like the editor

      let clampedWidth = Math.max(minWidth, Math.min(maxWidth, viewBoxWidth));

      // Maintain screen aspect ratio for consistent panning
      let clampedHeight = clampedWidth * screenAspectRatio;

      let targetX = elementCenterX - clampedWidth / 2;
      let targetY = elementCenterY - clampedHeight / 2;

      if (contentBounds) {
        const clamped = clampViewBoxToBounds(
          {
            x: targetX,
            y: targetY,
            width: clampedWidth,
            height: clampedHeight,
          },
          contentBounds,
        );
        targetX = clamped.x;
        targetY = clamped.y;
      }

      // Animate from current viewBox to target viewBox
      const startViewBox = { ...viewBox };
      const targetViewBox = {
        x: targetX,
        y: targetY,
        width: clampedWidth,
        height: clampedHeight,
      };

      const animationDuration = 600; // milliseconds
      const startTime = performance.now();

      const animate = (currentTime) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / animationDuration, 1);
        const easedProgress = easeInOutCubic(progress);

        const currentViewBox = {
          x:
            startViewBox.x + (targetViewBox.x - startViewBox.x) * easedProgress,
          y:
            startViewBox.y + (targetViewBox.y - startViewBox.y) * easedProgress,
          width:
            startViewBox.width +
            (targetViewBox.width - startViewBox.width) * easedProgress,
          height:
            startViewBox.height +
            (targetViewBox.height - startViewBox.height) * easedProgress,
        };

        setViewBox(currentViewBox);

        if (progress < 1) {
          animationFrameRef.current = requestAnimationFrame(animate);
        } else {
          animationFrameRef.current = null;
        }
      };

      animationFrameRef.current = requestAnimationFrame(animate);
    },
    [contentBounds, viewBox, screenAspectRatio],
  );

  // Initialize viewBox with contentBounds on first load
  useEffect(() => {
    if (contentBounds && !hasInitialized.current && screenAspectRatio > 0) {
      hasInitialized.current = true;

      // Adjust viewBox to match screen aspect ratio for consistent panning
      const contentAspectRatio = contentBounds.height / contentBounds.width;
      let width = contentBounds.width;
      let height = contentBounds.height;

      // If screen is taller than content (portrait mode), adjust viewBox height
      if (screenAspectRatio > contentAspectRatio) {
        height = width * screenAspectRatio;
      }
      // If screen is wider than content (landscape mode), adjust viewBox width
      else {
        width = height / screenAspectRatio;
      }

      setViewBox({
        x: contentBounds.minX - (width - contentBounds.width) / 2,
        y: contentBounds.minY - (height - contentBounds.height) / 2,
        width: width,
        height: height,
      });
    }
  }, [contentBounds, screenAspectRatio]);

  // Cleanup animations on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (panAnimationFrameRef.current) {
        cancelAnimationFrame(panAnimationFrameRef.current);
      }
    };
  }, []);

  return {
    viewBox,
    viewBoxRef,
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
  };
}
