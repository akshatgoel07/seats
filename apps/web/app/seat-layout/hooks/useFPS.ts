/**
 * Custom hook for measuring FPS (Frames Per Second)
 * Useful for performance monitoring during zoom/pan operations
 */

import { useState, useEffect, useRef } from "react";

export function useFPS() {
  const [fps, setFps] = useState(0);
  const [avgFps, setAvgFps] = useState(0);
  const [minFps, setMinFps] = useState(60);
  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(performance.now());
  const fpsHistoryRef = useRef<number[]>([]);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const measureFPS = () => {
      const now = performance.now();
      const delta = now - lastTimeRef.current;

      frameCountRef.current++;

      // Update FPS every second
      if (delta >= 1000) {
        const currentFps = Math.round((frameCountRef.current * 1000) / delta);
        setFps(currentFps);

        // Track FPS history for average calculation
        fpsHistoryRef.current.push(currentFps);
        if (fpsHistoryRef.current.length > 10) {
          fpsHistoryRef.current.shift();
        }

        // Calculate average FPS
        const avg = Math.round(
          fpsHistoryRef.current.reduce((a, b) => a + b, 0) /
            fpsHistoryRef.current.length
        );
        setAvgFps(avg);

        // Track minimum FPS
        setMinFps((prev) => Math.min(prev, currentFps));

        // Reset counters
        frameCountRef.current = 0;
        lastTimeRef.current = now;
      }

      animationFrameRef.current = requestAnimationFrame(measureFPS);
    };

    animationFrameRef.current = requestAnimationFrame(measureFPS);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const reset = () => {
    setMinFps(60);
    fpsHistoryRef.current = [];
  };

  return { fps, avgFps, minFps, reset };
}
