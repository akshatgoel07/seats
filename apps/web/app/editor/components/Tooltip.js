"use client";

import React, { useState, useRef, useLayoutEffect } from "react";

const Tooltip = ({ children, content, position = "right" }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [tooltipStyle, setTooltipStyle] = useState(/** @type {Record<string, any>} */ ({}));
  const triggerRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const tooltipRef = useRef(/** @type {HTMLDivElement | null} */ (null));

  // Measure the trigger/tooltip rects and position the tooltip before the
  // browser paints. useLayoutEffect (not useEffect) runs synchronously after
  // the DOM mutation, so the tooltip never flashes at its pre-measured spot.
  useLayoutEffect(() => {
    if (isVisible && triggerRef.current && tooltipRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();

      let style = {};

      switch (position) {
        case "right":
          style = {
            left: `${triggerRect.right + 8}px`,
            top: `${
              triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2
            }px`,
          };
          break;
        case "left":
          style = {
            left: `${triggerRect.left - tooltipRect.width - 8}px`,
            top: `${
              triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2
            }px`,
          };
          break;
        case "top":
          style = {
            left: `${
              triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2
            }px`,
            top: `${triggerRect.top - tooltipRect.height - 8}px`,
          };
          break;
        case "bottom":
          style = {
            left: `${
              triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2
            }px`,
            top: `${triggerRect.bottom + 8}px`,
          };
          break;
        default:
          style = {
            left: `${triggerRect.right + 8}px`,
            top: `${
              triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2
            }px`,
          };
      }

      setTooltipStyle(style);
    }
  }, [isVisible, position]);

  return (
    <div
      ref={triggerRef}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      className="relative inline-block"
    >
      {children}
      {isVisible && (
        <div
          ref={tooltipRef}
          style={{
            position: "fixed",
            ...tooltipStyle,
            zIndex: 9999,
          }}
          className="animate-tooltip-fade-in"
        >
          <div
            className="px-3 py-2 text-sm font-medium text-white rounded-lg shadow-lg whitespace-nowrap"
            style={{ backgroundColor: "#6071FC" }}
          >
            {content}
          </div>
        </div>
      )}
    </div>
  );
};

export default Tooltip;
