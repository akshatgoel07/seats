"use client";

import React, {
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { EditorProvider, useEditor } from "@/app/editor/EditorContext.js";
import CanvasStage from "@/app/editor/CanvasStage.js";
import Toolbar from "@/app/editor/Toolbar.js";
import PropertiesPanel from "@/app/editor/PropertiesPanel.js";
import { svgPathsToElements } from "@/app/editor/svgImport.js";
import { useParams } from "next/navigation";
import { ApiService } from "@/services/api";
import {
  LazyPropertySection,
  ActionsPanel,
} from "@/app/editor/components/properties/index.js";
import {
  createDynamicCategories,
  mapSeatTypeToCategory,
  createElement,
  ELEMENT_TYPES,
} from "@/app/editor/types.js";
import { generateSeatLabel } from "@/app/editor/seatNaming.js";
import { useSeatTypes } from "@/app/editor/hooks/useSeatTypes.js";
import SeatsLogo from "@/public/seats.webp";
import Image from "next/image";
import Link from "next/link";
import { showToast } from "../components/Toast";
import { FolderUp, X, Eye, EyeOff, Maximize2 } from "lucide-react";

// Preview Panel Component - Shows miniature view of the entire seat layout
const PreviewPanel = ({ isVisible, onClose }) => {
  const { state, actions } = useEditor();
  const canvasRef = useRef(/** @type {HTMLCanvasElement | null} */ (null));
  const contentCanvasRef = useRef(/** @type {HTMLCanvasElement | null} */ (null)); // Offscreen canvas for caching content
  const animationFrameRef = useRef(/** @type {number | null} */ (null));
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 80, y: 60 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Viewport dragging state
  const [isDraggingViewport, setIsDraggingViewport] = useState(false);
  const [viewportDragStart, setViewportDragStart] = useState({ x: 0, y: 0 });
  const [viewStartPosition, setViewStartPosition] = useState({ tx: 0, ty: 0 });

  // Extract content data separately from view (to prevent re-renders on zoom/pan)
  const seats = state.scene.seats;
  const rows = state.scene.rows;
  const elements = state.scene.elements;
  const view = state.scene.view;

  // Calculate bounds of all elements - ONLY depends on content, NOT view
  // This ensures the preview map stays the same size regardless of zoom level
  const contentBounds = useMemo(() => {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    // Include seats
    Object.values(seats).forEach((seat) => {
      const x = seat.localX;
      const y = seat.localY;
      minX = Math.min(minX, x - 10);
      minY = Math.min(minY, y - 10);
      maxX = Math.max(maxX, x + 10);
      maxY = Math.max(maxY, y + 10);
    });

    // Include elements (rectangles, circles, etc.)
    Object.values(elements).forEach((element) => {
      const x = element.x;
      const y = element.y;
      const hw = (element.width || 20) / 2;
      const hh = (element.height || 20) / 2;
      minX = Math.min(minX, x - hw);
      minY = Math.min(minY, y - hh);
      maxX = Math.max(maxX, x + hw);
      maxY = Math.max(maxY, y + hh);
    });

    // Include row endpoints
    Object.values(rows).forEach((row) => {
      if (row.geometry.kind === "line" && row.geometry.p1 && row.geometry.p2) {
        minX = Math.min(minX, row.geometry.p1.x, row.geometry.p2.x);
        minY = Math.min(minY, row.geometry.p1.y, row.geometry.p2.y);
        maxX = Math.max(maxX, row.geometry.p1.x, row.geometry.p2.x);
      } else if (row.geometry.kind === "arc" && row.geometry.center && row.geometry.radius != null) {
        const r = row.geometry.radius;
        minX = Math.min(minX, row.geometry.center.x - r);
        minY = Math.min(minY, row.geometry.center.y - r);
        maxX = Math.max(maxX, row.geometry.center.x + r);
        maxY = Math.max(maxY, row.geometry.center.y + r);
      }
    });

    // Default bounds if no elements
    if (!isFinite(minX)) {
      return {
        minX: 0,
        minY: 0,
        maxX: 800,
        maxY: 600,
        width: 800,
        height: 600,
      };
    }

    // Add padding
    const padding = 50;
    const width = maxX - minX + padding * 2;
    const height = maxY - minY + padding * 2;

    return {
      minX: minX - padding,
      minY: minY - padding,
      maxX: maxX + padding,
      maxY: maxY + padding,
      width,
      height,
    };
  }, [seats, rows, elements]); // Only recalculate when content changes, NOT on view changes

  // Preview dimensions (logical, not scaled)
  const PREVIEW_WIDTH = 400;
  const PREVIEW_HEIGHT = 300;

  // Calculate preview scale and offset based on content bounds (stable, doesn't change with zoom)
  const previewTransform = useMemo(() => {
    const width = PREVIEW_WIDTH;
    const height = PREVIEW_HEIGHT;

    const boundsWidth = contentBounds.width;
    const boundsHeight = contentBounds.height;

    // Calculate scale to fit content with padding
    const scaleX = (width - 30) / boundsWidth;
    const scaleY = (height - 30) / boundsHeight;
    const scale = Math.min(scaleX, scaleY);

    // Calculate offset to center content
    const offsetX =
      (width - boundsWidth * scale) / 2 - contentBounds.minX * scale;
    const offsetY =
      (height - boundsHeight * scale) / 2 - contentBounds.minY * scale;

    return { scale, offsetX, offsetY, width, height };
  }, [contentBounds]);

  // Render static content to offscreen canvas (only when content changes)
  const renderContent = useCallback(() => {
    // Create or get offscreen canvas
    if (!contentCanvasRef.current) {
      contentCanvasRef.current = document.createElement("canvas");
    }

    const offscreen = contentCanvasRef.current;
    if (!offscreen) return;
    const dpr = window.devicePixelRatio || 1;
    const { scale, offsetX, offsetY, width, height } = previewTransform;

    offscreen.width = width * dpr;
    offscreen.height = height * dpr;

    const ctx = offscreen.getContext("2d", { alpha: true });
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Draw elements (rectangles, paths, etc.) - render in proper order
    const elementsList = Object.values(elements);
    const sortedElements = [...elementsList].sort((a, b) => {
      const typeOrder = {
        image: 0,
        rectangle: 1,
        "standing-section": 1,
        circle: 2,
        path: 3,
        text: 4,
      };
      return (typeOrder[a.type] || 5) - (typeOrder[b.type] || 5);
    });

    sortedElements.forEach((element) => {
      const x = element.x * scale + offsetX;
      const y = element.y * scale + offsetY;

      ctx.save();
      ctx.translate(x, y);
      if (element.rotation) ctx.rotate(element.rotation);

      if (element.type === "rectangle" || element.type === "standing-section") {
        const w = (element.width || 20) * scale;
        const h = (element.height || 20) * scale;
        ctx.fillStyle = element.fillColor || "#e5e7eb";
        ctx.globalAlpha = element.opacity !== undefined ? element.opacity : 1;
        ctx.fillRect(-w / 2, -h / 2, w, h);
        if (
          element.strokeColor &&
          element.strokeColor !== "transparent" &&
          element.strokeWidth > 0
        ) {
          ctx.strokeStyle = element.strokeColor;
          ctx.lineWidth = Math.max(1, element.strokeWidth * scale * 0.5);
          ctx.strokeRect(-w / 2, -h / 2, w, h);
        }
      } else if (element.type === "circle") {
        const r = (element.radius || 10) * scale;
        ctx.fillStyle = element.fillColor || "#e5e7eb";
        ctx.globalAlpha = element.opacity !== undefined ? element.opacity : 1;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        if (
          element.strokeColor &&
          element.strokeColor !== "transparent" &&
          element.strokeWidth > 0
        ) {
          ctx.strokeStyle = element.strokeColor;
          ctx.lineWidth = Math.max(1, element.strokeWidth * scale * 0.5);
          ctx.stroke();
        }
      } else if (element.type === "path" && element.points) {
        ctx.globalAlpha = element.opacity !== undefined ? element.opacity : 1;
        if (element.fillColor && element.fillColor !== "transparent") {
          ctx.fillStyle = element.fillColor;
          ctx.beginPath();
          element.points.forEach((pt, i) => {
            const px = (pt.x - element.x) * scale;
            const py = (pt.y - element.y) * scale;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          });
          if (element.isClosed) ctx.closePath();
          ctx.fill();
        }
        if (element.strokeColor && element.strokeColor !== "transparent") {
          ctx.strokeStyle = element.strokeColor;
          ctx.lineWidth = Math.max(1, (element.strokeWidth || 2) * scale * 0.5);
          ctx.beginPath();
          element.points.forEach((pt, i) => {
            const px = (pt.x - element.x) * scale;
            const py = (pt.y - element.y) * scale;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          });
          if (element.isClosed) ctx.closePath();
          ctx.stroke();
        }
      }
      ctx.restore();
    });

    // Draw seats as small dots
    ctx.globalAlpha = 0.7;
    Object.values(seats).forEach((seat) => {
      const x = seat.localX * scale + offsetX;
      const y = seat.localY * scale + offsetY;
      const seatRadius = Math.max(1.2, Math.min(2.5, 2 * scale));
      ctx.fillStyle = "#4b5563";
      ctx.beginPath();
      ctx.arc(x, y, seatRadius, 0, Math.PI * 2);
      ctx.fill();
    });
  }, [seats, elements, previewTransform]);

  // Render viewport indicator only (fast, called on every view change)
  const renderViewport = useCallback(() => {
    const canvas = canvasRef.current;
    const offscreen = contentCanvasRef.current;
    if (!canvas || !offscreen) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const { scale, offsetX, offsetY, width, height } = previewTransform;

    // Reset and draw cached content
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(offscreen, 0, 0);

    // Now draw viewport indicator with proper scaling
    ctx.scale(dpr, dpr);

    // Calculate viewport in world coordinates (canvas takes full width, panel overlays)
    const toolbarWidth = 80; // w-20 = 80px
    const topBarHeight = 56; // h-14 = 56px
    const mainCanvasWidth = window.innerWidth - toolbarWidth;
    const mainCanvasHeight = window.innerHeight - topBarHeight;
    const visibleLeft = -view.tx / view.scale;
    const visibleTop = -view.ty / view.scale;
    const visibleRight = (mainCanvasWidth - view.tx) / view.scale;
    const visibleBottom = (mainCanvasHeight - view.ty) / view.scale;

    // Convert to preview coordinates
    const vpLeft = visibleLeft * scale + offsetX;
    const vpTop = visibleTop * scale + offsetY;
    const vpWidth = (visibleRight - visibleLeft) * scale;
    const vpHeight = (visibleBottom - visibleTop) * scale;

    // Draw viewport rectangle (blue color)
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 2;
    ctx.strokeRect(vpLeft, vpTop, vpWidth, vpHeight);
    ctx.fillStyle = "rgba(59, 130, 246, 0.1)";
    ctx.fillRect(vpLeft, vpTop, vpWidth, vpHeight);

    // Draw corner indicators for better visibility
    const cornerRadius = 3;
    ctx.fillStyle = "#3b82f6";
    // Top-left
    ctx.beginPath();
    ctx.arc(vpLeft, vpTop, cornerRadius, 0, Math.PI * 2);
    ctx.fill();
    // Top-right
    ctx.beginPath();
    ctx.arc(vpLeft + vpWidth, vpTop, cornerRadius, 0, Math.PI * 2);
    ctx.fill();
    // Bottom-left
    ctx.beginPath();
    ctx.arc(vpLeft, vpTop + vpHeight, cornerRadius, 0, Math.PI * 2);
    ctx.fill();
    // Bottom-right
    ctx.beginPath();
    ctx.arc(vpLeft + vpWidth, vpTop + vpHeight, cornerRadius, 0, Math.PI * 2);
    ctx.fill();
  }, [view, previewTransform]);

  // Full render (content + viewport)
  const render = useCallback(() => {
    renderContent();
    renderViewport();
  }, [renderContent, renderViewport]);

  // Throttled viewport update using requestAnimationFrame
  const updateViewportThrottled = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    animationFrameRef.current = requestAnimationFrame(() => {
      renderViewport();
      animationFrameRef.current = null;
    });
  }, [renderViewport]);

  // Calculate viewport rect in preview coordinates
  const getViewportRect = useCallback(() => {
    const { scale, offsetX, offsetY } = previewTransform;
    const toolbarWidth = 80; // w-20 = 80px
    const topBarHeight = 56; // h-14 = 56px
    const mainCanvasWidth = window.innerWidth - toolbarWidth;
    const mainCanvasHeight = window.innerHeight - topBarHeight;

    const visibleLeft = -view.tx / view.scale;
    const visibleTop = -view.ty / view.scale;
    const visibleRight = (mainCanvasWidth - view.tx) / view.scale;
    const visibleBottom = (mainCanvasHeight - view.ty) / view.scale;

    return {
      x: visibleLeft * scale + offsetX,
      y: visibleTop * scale + offsetY,
      width: (visibleRight - visibleLeft) * scale,
      height: (visibleBottom - visibleTop) * scale,
    };
  }, [view, previewTransform]);

  // Check if a point is inside the viewport rect
  const isPointInViewport = useCallback(
    (x, y) => {
      const vp = getViewportRect();
      return (
        x >= vp.x && x <= vp.x + vp.width && y >= vp.y && y <= vp.y + vp.height
      );
    },
    [getViewportRect],
  );

  // Handle viewport drag start
  const handleViewportDragStart = useCallback(
    (e) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      // Check if click is inside viewport
      if (isPointInViewport(clickX, clickY)) {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingViewport(true);
        setViewportDragStart({ x: e.clientX, y: e.clientY });
        setViewStartPosition({ tx: view.tx, ty: view.ty });
      }
    },
    [isPointInViewport, view.tx, view.ty],
  );

  // Handle viewport drag move
  const handleViewportDragMove = useCallback(
    (e) => {
      if (!isDraggingViewport) return;

      const { scale } = previewTransform;

      // Calculate delta in screen coordinates
      const deltaX = e.clientX - viewportDragStart.x;
      const deltaY = e.clientY - viewportDragStart.y;

      // Convert delta to world coordinates and then to view translation
      // Moving viewport right means view.tx should decrease (moving view left)
      const worldDeltaX = deltaX / scale;
      const worldDeltaY = deltaY / scale;

      const newTx = viewStartPosition.tx - worldDeltaX * view.scale;
      const newTy = viewStartPosition.ty - worldDeltaY * view.scale;

      actions.updateView({ tx: newTx, ty: newTy });
    },
    [
      isDraggingViewport,
      viewportDragStart,
      viewStartPosition,
      previewTransform,
      view.scale,
      actions,
    ],
  );

  // Handle viewport drag end
  const handleViewportDragEnd = useCallback(() => {
    setIsDraggingViewport(false);
  }, []);

  // Handle click to navigate (only if not dragging viewport)
  const handleCanvasClick = useCallback(
    (e) => {
      // Don't navigate if we just finished dragging
      if (isDraggingViewport) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      // Don't navigate if clicking inside viewport (viewport drag handles this)
      if (isPointInViewport(clickX, clickY)) return;

      const { scale, offsetX, offsetY } = previewTransform;

      // Convert click to world coordinates
      const worldX = (clickX - offsetX) / scale;
      const worldY = (clickY - offsetY) / scale;

      // Calculate new view to center on clicked point
      const toolbarWidth = 80; // w-20 = 80px
      const topBarHeight = 56; // h-14 = 56px
      const mainCanvasWidth = window.innerWidth - toolbarWidth;
      const mainCanvasHeight = window.innerHeight - topBarHeight;

      const newTx = mainCanvasWidth / 2 - worldX * view.scale;
      const newTy = mainCanvasHeight / 2 - worldY * view.scale;

      actions.updateView({ tx: newTx, ty: newTy });
    },
    [
      previewTransform,
      view.scale,
      actions,
      isDraggingViewport,
      isPointInViewport,
    ],
  );

  // Handle canvas mouse down
  const handleCanvasMouseDown = useCallback(
    (e) => {
      handleViewportDragStart(e);
    },
    [handleViewportDragStart],
  );

  // Panel dragging logic
  const handleMouseDown = (e) => {
    if (e.target.closest(".preview-header")) {
      setIsDragging(true);
      setDragOffset({
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      });
    }
  };

  const handleMouseMove = useCallback(
    (e) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragOffset.x,
          y: e.clientY - dragOffset.y,
        });
      }
      if (isDraggingViewport) {
        handleViewportDragMove(e);
      }
    },
    [isDragging, dragOffset, isDraggingViewport, handleViewportDragMove],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    if (isDraggingViewport) {
      handleViewportDragEnd();
    }
  }, [isDraggingViewport, handleViewportDragEnd]);

  // Global mouse event listeners for panel and viewport dragging
  useEffect(() => {
    if (isDragging || isDraggingViewport) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, isDraggingViewport, handleMouseMove, handleMouseUp]);

  // Track if canvas has been initialized
  const canvasInitializedRef = useRef(false);
  const contentRenderedRef = useRef(false);

  // Setup canvas with proper DPI scaling
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = PREVIEW_WIDTH * dpr;
      canvas.height = PREVIEW_HEIGHT * dpr;
      canvas.style.width = `${PREVIEW_WIDTH}px`;
      canvas.style.height = `${PREVIEW_HEIGHT}px`;
      canvasInitializedRef.current = true;
    }
  }, []);

  // Re-render content only when content changes (not on view changes)
  useEffect(() => {
    if (isVisible && canvasInitializedRef.current) {
      renderContent();
      contentRenderedRef.current = true;
      renderViewport();
    }
  }, [
    seats,
    elements,
    previewTransform,
    isVisible,
    renderContent,
    renderViewport,
  ]);

  // Update viewport only when view changes (throttled for performance)
  useEffect(() => {
    if (
      isVisible &&
      canvasInitializedRef.current &&
      contentRenderedRef.current
    ) {
      updateViewportThrottled();
    }
  }, [view, isVisible, updateViewportThrottled]);

  // Setup canvas and render when visibility changes or on mount
  useEffect(() => {
    if (isVisible) {
      // Small delay to ensure DOM is ready after visibility change
      const timeoutId = setTimeout(() => {
        setupCanvas();
        renderContent();
        contentRenderedRef.current = true;
        renderViewport();
      }, 0);
      return () => clearTimeout(timeoutId);
    } else {
      // Reset initialization flags when hidden
      canvasInitializedRef.current = false;
      contentRenderedRef.current = false;
    }
  }, [isVisible, setupCanvas, renderContent, renderViewport]);

  // Cleanup animation frame on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  if (!isVisible) {
    return null;
  }

  return (
    <div
      className="fixed z-[100] rounded-xl shadow-2xl overflow-hidden border border-white/20"
      style={{
        left: position.x,
        top: position.y,
        width: PREVIEW_WIDTH,
        backgroundColor: "rgba(255, 255, 255, 0.75)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Header */}
      <div className="preview-header flex items-center justify-between px-3 py-2 border-b border-gray-200/50 cursor-move">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-purple-500"></div>
          <span className="text-sm font-medium text-gray-700">Preview</span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="p-1 hover:bg-gray-200/70 rounded transition-colors"
          title="Hide Preview"
        >
          <X size={14} className="text-gray-500" />
        </button>
      </div>

      {/* Canvas */}
      <div className="relative">
        <canvas
          ref={canvasRef}
          onMouseDown={handleCanvasMouseDown}
          onClick={handleCanvasClick}
          className={isDraggingViewport ? "cursor-grabbing" : "cursor-pointer"}
          style={{ width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT }}
        />
        {/* Seats count overlay */}
        <div className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded-md backdrop-blur-sm pointer-events-none">
          {Object.keys(state.scene.seats).length} seats
        </div>
        {/* Drag hint */}
        <div className="absolute top-2 left-2 text-[10px] text-gray-500 pointer-events-none">
          Drag blue box to navigate
        </div>
      </div>
    </div>
  );
};

const EditorKeyboardHandler = () => {
  const { screenId } = useParams();
  // console.log("screenId from URL params:", screenId);
  const { state, actions } = useEditor();

  // Helper function to calculate smart paste offset for rows
  const calculatePasteOffset = () => {
    if (state.clipboard.isEmpty || state.clipboard.rows.length === 0) {
      return { x: 0, y: 25 }; // Default offset
    }

    const clipboardRows = state.clipboard.rows;

    // Sort clipboard rows by their Y position (using p1.y for line, center.y for arc)
    const sortedRows = [...clipboardRows].sort((a, b) => {
      const aY =
        a.geometry.kind === "line" ? a.geometry.p1.y : a.geometry.center.y;
      const bY =
        b.geometry.kind === "line" ? b.geometry.p1.y : b.geometry.center.y;
      return aY - bY;
    });

    // Calculate average vertical spacing between consecutive rows
    let totalSpacing = 0;
    let spacingCount = 0;

    for (let i = 0; i < sortedRows.length - 1; i++) {
      const currentY =
        sortedRows[i].geometry.kind === "line"
          ? sortedRows[i].geometry.p1.y
          : sortedRows[i].geometry.center.y;
      const nextY =
        sortedRows[i + 1].geometry.kind === "line"
          ? sortedRows[i + 1].geometry.p1.y
          : sortedRows[i + 1].geometry.center.y;

      totalSpacing += Math.abs(nextY - currentY);
      spacingCount++;
    }

    // Use average spacing, or default to 40 if only one row
    const avgSpacing = spacingCount > 0 ? totalSpacing / spacingCount : 40;

    // Find the lowest row (highest Y value)
    const lowestRow = sortedRows[sortedRows.length - 1];
    const lowestY =
      lowestRow.geometry.kind === "line"
        ? lowestRow.geometry.p1.y
        : lowestRow.geometry.center.y;

    // Find the highest row (lowest Y value) to calculate the offset
    const highestRow = sortedRows[0];
    const highestY =
      highestRow.geometry.kind === "line"
        ? highestRow.geometry.p1.y
        : highestRow.geometry.center.y;

    // The offset should position the highest pasted row below the lowest original row
    // by the average spacing distance
    const yOffset = lowestY + avgSpacing - highestY;

    return { x: 0, y: yOffset };
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Skip shortcuts if user is typing in an input field
      const activeElement = document.activeElement;
      const isTypingInInput =
        activeElement &&
        (activeElement.tagName === "INPUT" ||
          activeElement.tagName === "TEXTAREA" ||
          /** @type {HTMLElement} */ (activeElement).contentEditable === "true");

      if (isTypingInInput) {
        return; // Don't intercept keys when typing in input fields
      }

      // Prevent default for our shortcuts
      const isModifierPressed = e.ctrlKey || e.metaKey;

      switch (e.key.toLowerCase()) {
        case "s":
          if (!isModifierPressed) {
            e.preventDefault();
            actions.setTool("select");
          }
          break;
        case "r":
          if (!isModifierPressed) {
            e.preventDefault();
            actions.setTool("row-line");
          }
          break;
        case "a":
          if (!isModifierPressed) {
            e.preventDefault();
            actions.setTool("row-arc");
          }
          break;
        case "m":
          if (!isModifierPressed) {
            e.preventDefault();
            actions.setTool("multi-row");
          }
          break;
        case "e":
          if (!isModifierPressed) {
            e.preventDefault();
            actions.setTool("seat");
          }
          break;
        case "c":
          if (isModifierPressed) {
            e.preventDefault();
            actions.copyRows();
          } else {
            e.preventDefault();
            actions.setTool("element-circle");
          }
          break;
        case "d":
          if (!isModifierPressed) {
            e.preventDefault();
            actions.setTool("measure");
          }
          break;
        case "t":
          if (!isModifierPressed) {
            e.preventDefault();
            actions.setTool("element-rectangle");
          }
          break;
        case "p":
          if (!isModifierPressed) {
            e.preventDefault();
            actions.setTool("element-path");
          }
          break;
        case "x":
          if (!isModifierPressed) {
            e.preventDefault();
            actions.setTool("element-text");
          }
          break;
        case " ":
          e.preventDefault();
          actions.setTool("pan");
          break;
        case "g":
          if (!isModifierPressed) {
            e.preventDefault();
            actions.toggleGrid();
          }
          break;
        case "z":
          if (isModifierPressed) {
            e.preventDefault();
            if (e.shiftKey) {
              actions.redo();
            } else {
              actions.undo();
            }
          }
          break;
        case "y":
          if (isModifierPressed) {
            e.preventDefault();
            actions.redo();
          }
          break;
        case "v":
          if (isModifierPressed) {
            e.preventDefault();
            // Calculate smart paste offset based on row spacing and positioning
            const pasteOffset = calculatePasteOffset();

            actions.pasteRows(pasteOffset);
          }
          break;
        case "delete":
        case "backspace":
          e.preventDefault();
          actions.deleteItems(state.selectedIds || []);
          break;
        case "escape":
          e.preventDefault();
          // Check if we're drawing a path and cancel it
          if (state.currentTool === "element-path") {
            // This will trigger a state change that resets the drawing
            actions.setTool("select");
          } else {
            actions.clearSelection();
          }
          break;
        case "enter":
          if (state.currentTool === "element-path") {
            e.preventDefault();
            // Trigger path completion
            actions.completePath();
          }
          break;
        case "=":
        case "+":
          if (!isModifierPressed && state.selectedIds.length > 1) {
            e.preventDefault();
            // Check if any selected seat is in an arc row
            const selectedSeats = state.selectedIds
              .map((id) => state.scene.seats[id])
              .filter(Boolean);
            const arcSeats = selectedSeats.filter((seat) => {
              const row = state.scene.rows[seat.rowId];
              return row && row.geometry.kind === "arc";
            });

            // Only adjust spacing if no seats are in arc rows
            if (arcSeats.length === 0) {
              // Use smaller increment when Shift is pressed
              const spacingDelta = e.shiftKey ? 1 : 5;
              actions.adjustSeatSpacing(state.selectedIds, spacingDelta);
            }
          }
          break;
        case "-":
        case "_":
          if (!isModifierPressed && state.selectedIds.length > 1) {
            e.preventDefault();
            // Check if any selected seat is in an arc row
            const selectedSeats = state.selectedIds
              .map((id) => state.scene.seats[id])
              .filter(Boolean);
            const arcSeats = selectedSeats.filter((seat) => {
              const row = state.scene.rows[seat.rowId];
              return row && row.geometry.kind === "arc";
            });

            // Only adjust spacing if no seats are in arc rows
            if (arcSeats.length === 0) {
              // Use smaller decrement when Shift is pressed
              const spacingDelta = e.shiftKey ? -1 : -5;
              actions.adjustSeatSpacing(state.selectedIds, spacingDelta);
            }
          }
          break;
        case "[":
          if (!isModifierPressed && state.selectedIds.length > 0) {
            e.preventDefault();
            actions.rotateSelectedSeats(-Math.PI / 12); // -15 degrees
          }
          break;
        case "]":
          if (!isModifierPressed && state.selectedIds.length > 0) {
            e.preventDefault();
            actions.rotateSelectedSeats(Math.PI / 12); // 15 degrees
          }
          break;
        case "arrowleft":
          if (state.selectedIds.length > 0) {
            e.preventDefault();
            const moveAmount = e.shiftKey ? -2 : -10; // Fine movement with Shift, normal movement without
            actions.moveSeats(state.selectedIds, moveAmount, 0);
          }
          break;
        case "arrowright":
          if (state.selectedIds.length > 0) {
            e.preventDefault();
            const moveAmount = e.shiftKey ? 2 : 10; // Fine movement with Shift, normal movement without
            actions.moveSeats(state.selectedIds, moveAmount, 0);
          }
          break;
        case "arrowup":
          if (state.selectedIds.length > 0) {
            e.preventDefault();
            const moveAmount = e.shiftKey ? -2 : -10; // Fine movement with Shift, normal movement without
            actions.moveSeats(state.selectedIds, 0, moveAmount);
          }
          break;
        case "arrowdown":
          if (state.selectedIds.length > 0) {
            e.preventDefault();
            const moveAmount = e.shiftKey ? 2 : 10; // Fine movement with Shift, normal movement without
            actions.moveSeats(state.selectedIds, 0, moveAmount);
          }
          break;
        case "0":
          // Cmd/Ctrl+0: Zoom to fit all content
          if (isModifierPressed) {
            e.preventDefault();
            // Get canvas element dimensions
            const canvas = document.querySelector("canvas");
            if (canvas) {
              const rect = canvas.getBoundingClientRect();
              actions.zoomToFit(rect.width, rect.height, 80);
            }
          }
          break;
        case "1":
          // Cmd/Ctrl+1: Reset to 100% zoom
          if (isModifierPressed) {
            e.preventDefault();
            const canvas = document.querySelector("canvas");
            if (canvas) {
              const rect = canvas.getBoundingClientRect();
              // Center the view at 100% zoom
              actions.updateView({
                scale: 1,
                tx: rect.width / 2,
                ty: rect.height / 2,
              });
            }
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [actions, state]);

  useEffect(() => {
    // The route param carries the layoutId in the new backend.
    const layoutId = screenId;
    if (!layoutId) {
      console.log("No layoutId provided, skipping data load");
      return;
    }

    // Load the layout from the Go API. The scene is returned inline as
    // `layout.scene` (the editor document, stored verbatim by the backend).
    ApiService.getLayout(layoutId)
      .then((layout) => {
        const scene = layout?.scene;
        if (scene && scene.venue) {
          actions.loadScene(scene);
          if (scene.view) {
            actions.updateView(scene.view);
          }
          console.log("Loaded scene for layout", layoutId);
        } else {
          // Empty/new layout — start from a blank scene.
          console.log("Layout has no scene yet; starting blank");
          actions.loadScene({
            venue: {
              id: "new-venue",
              name: layout?.name || "New Venue",
              categories: [
                { id: "default", name: "Default", color: "#4a90e2", price: 0 },
              ],
            },
            sections: {},
            rows: {},
            seats: {},
            elements: {},
            view: { scale: 1.0, tx: 400, ty: 300 },
          });
        }
      })
      .catch((error) => {
        console.error("Error loading layout:", error);
        showToast("Failed to load layout", error.message || "");
      });
  }, []);

  return null;
};

const TopBar = ({ isPreviewVisible, onTogglePreview }) => {
  const { state, actions } = useEditor();
  const { selectedIds, scene } = state;
  const [isSaving, setIsSaving] = useState(false);
  const { screenId } = useParams();
  const { regularSeatTypes, standingSections } = useSeatTypes(screenId);

  // Map API seat types to category structure expected by UI (only regular seats, not open seating areas)
  const categories = regularSeatTypes
    .map((seatType) => ({
      id: seatType.sst_id.toString(),
      name: seatType.sst_seat_type,
      color: seatType.sst_seat_color_code,
      price: 100, // Default price since not in API response
      order: seatType.sst_order,
    }))
    .sort((a, b) => a.order - b.order);

  const handleExport = () => {
    const dataStr = JSON.stringify(state.scene, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${state.scene.venue.name.replace(
      /\s+/g,
      "_",
    )}_layout.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e) => {
    const file = /** @type {HTMLInputElement} */ (e.target).files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = /** @type {string} */ (
          /** @type {FileReader} */ (event.target).result
        );
        const isSvg = file.type === "image/svg+xml" || /^\s*</.test(text);
        if (isSvg) {
          // For SVG files, create an image element instead of converting to paths
          // This preserves the SVG as a complete image/background
          const svgDataUrl = `data:image/svg+xml;base64,${btoa(text)}`;

          const img = new window.Image();
          img.onload = () => {
            const imageElement = createElement(
              ELEMENT_TYPES.IMAGE,
              400, // Default center position
              300,
              img.width,
              img.height,
              {
                src: svgDataUrl,
                imageWidth: img.width,
                imageHeight: img.height,
                opacity: 0.8,
              },
            );

            actions.addImage(imageElement);
            actions.setSelection([imageElement.id]);
            actions.setTool("select");
          };
          img.src = svgDataUrl;
        } else {
          const scene = JSON.parse(text);
          actions.loadScene(scene);
        }
      } catch (error) {
        console.log("Error importing file:", error);
        showToast(
          "Failed to import file.",
          "An error occurred while importing the file.",
        );
      }
    };
    reader.readAsText(file);
  };

  const handleSaveSeatLayout = async () => {
    try {
      setIsSaving(true);

      const layoutId = screenId;
      if (!layoutId) {
        showToast("Error: layoutId is missing. Please check the URL.", "");
        return;
      }

      // The backend stores the scene verbatim and derives the flat seat list
      // (rows/columns/labels, table seats, standing-section expansion) itself,
      // so the client just sends the scene. Carry the renderer flag along.
      const sceneToSave = {
        ...scene,
        showSectionBoundaryInRenderer:
          state.globalSettings?.showSectionBoundaryInRenderer || false,
      };

      const result = await ApiService.saveLayout(layoutId, sceneToSave);
      console.log("Layout saved:", result);

      const seatCount = Object.keys(scene.seats || {}).length;
      const standingCount = Object.values(scene.elements || {}).filter(
        (el) => el.type === ELEMENT_TYPES.STANDING_SECTION,
      ).length;
      const message =
        standingCount > 0
          ? `Saved layout: ${seatCount} seats and ${standingCount} standing section(s)`
          : `Saved layout: ${seatCount} seats`;
      showToast(message, "");
    } catch (error) {
      console.error("Error saving layout:", error);
      showToast(
        "Failed to save layout. Please try again.",
        error.message || "",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    if (selectedIds.length > 0) {
      actions.deleteItems(selectedIds);
    }
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-14 bg-neutral-950 border-b border-neutral-800 text-white flex items-center justify-between px-4">
      <div className="flex items-center gap-4">
        <Link href="/" className="flex items-center">
          <Image src={SeatsLogo} alt="Logo" width={70} height={70} />
        </Link>
        <div className="h-6 w-px bg-neutral-800" /> {/* Divider */}
        <h1 className="text-sm font-medium text-neutral-200">
          Seat Layout Editor
        </h1>
        {state.selectedIds.length > 0 && (
          <span className="text-xs font-medium px-2 py-1 rounded-md bg-neutral-800 text-neutral-300 border border-neutral-700">
            {state.selectedIds.length} selected
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
 

        {/* Preview Toggle Button - shadcn style */}
        <button
          onClick={onTogglePreview}
          className={`
            inline-flex items-center justify-center gap-2 
            h-9 px-4 
            text-sm font-medium 
            rounded-lg 
            transition-all duration-200 
            border
            ${
              isPreviewVisible
                ? "bg-neutral-800 text-neutral-100 border-neutral-700 hover:bg-neutral-700 hover:border-neutral-600"
                : "bg-neutral-900 text-neutral-400 border-neutral-800 hover:bg-neutral-800 hover:text-neutral-200 hover:border-neutral-700"
            }
            focus:outline-none focus:ring-2 focus:ring-neutral-600 focus:ring-offset-2 focus:ring-offset-neutral-950
          `}
          title={isPreviewVisible ? "Hide Preview" : "Show Preview"}
        >
          {isPreviewVisible ? <Eye size={16} /> : <EyeOff size={16} />}
          <span>Preview</span>
        </button>

        {/* Actions Panel */}
        <LazyPropertySection>
          <ActionsPanel
            isSaving={isSaving}
            scene={scene}
            selectedIds={selectedIds}
            onSaveSeatLayout={handleSaveSeatLayout}
            onDeleteItems={handleDelete}
          />
        </LazyPropertySection>
      </div>
    </div>
  );
};

const EditorLayout = () => {
  const [isPreviewVisible, setIsPreviewVisible] = useState(true);
  const [isPropertiesPanelVisible, setIsPropertiesPanelVisible] =
    useState(true);

  const togglePreview = useCallback(() => {
    setIsPreviewVisible((prev) => !prev);
  }, []);

  const togglePropertiesPanel = useCallback(() => {
    setIsPropertiesPanelVisible((prev) => !prev);
  }, []);

  return (
    <div id="editor-layout" className="h-screen flex flex-col">
      <TopBar
        isPreviewVisible={isPreviewVisible}
        onTogglePreview={togglePreview}
      />
      <div className="flex-1 flex pt-14">
        <Toolbar />
        <div className="flex-1 bg-transparent w-full h-full overflow-hidden">
          <CanvasStage />
        </div>
        <PropertiesPanel
          isVisible={isPropertiesPanelVisible}
          onClose={() => setIsPropertiesPanelVisible(false)}
          onOpen={() => setIsPropertiesPanelVisible(true)}
        />
      </div>
      <PreviewPanel
        isVisible={isPreviewVisible}
        onClose={() => setIsPreviewVisible(false)}
      />
      <EditorKeyboardHandler />
    </div>
  );
};

export default function EditorPage() {
  return (
    <EditorProvider>
      <EditorLayout />
    </EditorProvider>
  );
}
