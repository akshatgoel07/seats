"use client";

/**
 * Canvas 2D seat layer (R18 / 10k-seat support) — zero new dependencies.
 *
 * Replaces the per-seat SVG <g>/<rect> nodes with a single <canvas> for large
 * layouts (the approach seats.io/SeatGeek use). Thousands of seats become one
 * DOM node, so pan/zoom/hover/select stay smooth at 10k+ seats:
 *  - draws only on-screen seats (viewport culled) on demand;
 *  - redraws every frame during a pan/zoom gesture (canvas redraw of 10k rects
 *    is a few ms, unlike reconciling 10k DOM nodes);
 *  - hit-tests clicks/hover via a uniform-grid spatial index (O(1)), and keeps a
 *    DOM tooltip overlay (rendered by the parent) for the hovered seat.
 *
 * Coordinate mapping matches the sibling <svg viewBox> with the default
 * preserveAspectRatio="xMidYMid meet", so a canvas overlay aligns with the SVG
 * boundary/section elements drawn underneath.
 */

import React, { useCallback, useEffect, useRef } from "react";
import { isSeatDisabled, shouldApplyOpacityFilter } from "../utils/index";
import { querySeatAtPoint } from "../utils/spatialIndex.js";

const SIZE_FACTOR = 0.88;

function viewToScreen(vb, W, H) {
  // Replicate SVG xMidYMid meet.
  const scale = Math.min(W / vb.width, H / vb.height);
  const offsetX = (W - vb.width * scale) / 2;
  const offsetY = (H - vb.height * scale) / 2;
  return { scale, offsetX, offsetY };
}

export function SeatCanvas({
  seatMap,
  spatialIndex,
  viewBox,
  viewBoxRef,
  isDragging,
  getSeatColor,
  getDarkenedSeatColor,
  isSeatSelected,
  hoveredSeatId,
  selectedLegendType,
  onSeatClick,
  onHoverSeat,
  // viewport gesture handlers (pan/zoom) from useViewportControls
  onViewportMouseDown,
  onViewportMouseMove,
  onViewportMouseUp,
  onViewportWheel,
  onViewportTouchStart,
  onViewportTouchMove,
  onViewportTouchEnd,
}) {
  const canvasRef = useRef(/** @type {HTMLCanvasElement | null} */ (null));
  const rafRef = useRef(/** @type {number | null} */ (null));

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;
    if (W === 0 || H === 0) return;
    const bw = Math.round(W * dpr);
    const bh = Math.round(H * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const vb = (viewBoxRef && viewBoxRef.current) || viewBox;
    const { scale, offsetX, offsetY } = viewToScreen(vb, W, H);
    const cullMargin = 48;

    for (const seatId in seatMap) {
      const seat = seatMap[seatId];
      const pos = seat.position;
      if (!pos) continue;
      const sx = (pos.x - vb.x) * scale + offsetX;
      const sy = (pos.y - vb.y) * scale + offsetY;
      if (sx < -cullMargin || sx > W + cullMargin || sy < -cullMargin || sy > H + cullMargin) {
        continue;
      }
      const w = ((seat.dimensions?.width || 20) * SIZE_FACTOR) * scale;
      const h = ((seat.dimensions?.height || 20) * SIZE_FACTOR) * scale;
      if (w < 0.5 || h < 0.5) continue;

      const selected = isSeatSelected(seatId);
      const fill = getSeatColor(seat);
      const stroke = getDarkenedSeatColor(seat);
      const opacity = shouldApplyOpacityFilter(seat, selected, selectedLegendType)
        ? 0.3
        : 1;
      const r = Math.min(w, h) / 2;
      const rot = pos.rotation || 0;

      ctx.globalAlpha = opacity;
      ctx.fillStyle = fill;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = selected ? 1.5 : 0.5;
      ctx.beginPath();
      if (rot) {
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate((rot * Math.PI) / 180);
        ctx.roundRect(-w / 2, -h / 2, w, h, r);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.roundRect(sx - w / 2, sy - h / 2, w, h, r);
        ctx.fill();
        ctx.stroke();
      }
    }

    // Hovered-seat halo (a thin DOM tooltip is rendered separately by the parent).
    if (hoveredSeatId && seatMap[hoveredSeatId]) {
      const seat = seatMap[hoveredSeatId];
      const pos = seat.position;
      if (pos) {
        const sx = (pos.x - vb.x) * scale + offsetX;
        const sy = (pos.y - vb.y) * scale + offsetY;
        const w = ((seat.dimensions?.width || 20) * SIZE_FACTOR) * scale;
        const h = ((seat.dimensions?.height || 20) * SIZE_FACTOR) * scale;
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "#111827";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(sx - w / 2 - 1, sy - h / 2 - 1, w + 2, h + 2, Math.min(w, h) / 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }, [
    seatMap,
    viewBox,
    viewBoxRef,
    getSeatColor,
    getDarkenedSeatColor,
    isSeatSelected,
    hoveredSeatId,
    selectedLegendType,
  ]);

  // Keep latest draw in a ref for the gesture loop.
  const drawRef = useRef(draw);
  useEffect(() => {
    drawRef.current = draw;
  }, [draw]);

  // On-demand redraw whenever inputs change (coalesced to one frame).
  useEffect(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      drawRef.current();
    });
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [draw]);

  // During an active drag, the React viewBox is frozen (R8); redraw every frame
  // from the live viewBoxRef so the canvas tracks the gesture.
  useEffect(() => {
    if (!isDragging) return;
    let active = true;
    let id;
    const loop = () => {
      if (!active) return;
      drawRef.current();
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => {
      active = false;
      if (id) cancelAnimationFrame(id);
    };
  }, [isDragging]);

  // Redraw on container resize.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => drawRef.current());
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  const screenToWorld = useCallback(
    (clientX, clientY) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const W = rect.width;
      const H = rect.height;
      const vb = (viewBoxRef && viewBoxRef.current) || viewBox;
      const { scale, offsetX, offsetY } = viewToScreen(vb, W, H);
      const sx = clientX - rect.left;
      const sy = clientY - rect.top;
      return {
        x: (sx - offsetX) / scale + vb.x,
        y: (sy - offsetY) / scale + vb.y,
      };
    },
    [viewBox, viewBoxRef],
  );

  const handleMove = useCallback(
    (e) => {
      if (onViewportMouseMove) onViewportMouseMove(e);
      if (isDragging) return; // skip hover hit-testing during a pan
      const world = screenToWorld(e.clientX, e.clientY);
      if (!world) return;
      const seatId = querySeatAtPoint(spatialIndex, seatMap, world.x, world.y, SIZE_FACTOR);
      onHoverSeat(seatId ? { id: seatId, seat: seatMap[seatId] } : null);
    },
    [onViewportMouseMove, isDragging, screenToWorld, spatialIndex, seatMap, onHoverSeat],
  );

  const handleClick = useCallback(
    (e) => {
      const world = screenToWorld(e.clientX, e.clientY);
      if (!world) return;
      const seatId = querySeatAtPoint(spatialIndex, seatMap, world.x, world.y, SIZE_FACTOR);
      if (!seatId) return;
      const seat = seatMap[seatId];
      if (isSeatDisabled(seat)) return;
      onSeatClick(seatId, seat);
    },
    [screenToWorld, spatialIndex, seatMap, onSeatClick],
  );

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ touchAction: "none", userSelect: "none", width: "100%", height: "100%" }}
      onMouseDown={onViewportMouseDown}
      onMouseMove={handleMove}
      onMouseUp={onViewportMouseUp}
      onMouseLeave={(e) => {
        if (onViewportMouseUp) onViewportMouseUp(e);
        onHoverSeat(null);
      }}
      onClick={handleClick}
      onWheel={onViewportWheel}
      onTouchStart={onViewportTouchStart}
      onTouchMove={onViewportTouchMove}
      onTouchEnd={onViewportTouchEnd}
    />
  );
}
