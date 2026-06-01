/**
 * RectangleElement component
 * Renders a rectangle SVG element with scaling and rotation
 */

import React from "react";

export function RectangleElement({ element, elementId }) {
  const scale = element.scale || 1.0;

  return (
    <rect
      key={elementId}
      x={element.x - (element.width * scale) / 2}
      y={element.y - (element.height * scale) / 2}
      width={element.width * scale}
      height={element.height * scale}
      rx={(element.borderRadius || 0) * scale}
      ry={(element.borderRadius || 0) * scale}
      fill={element.fillColor || "#f0f0f0"}
      stroke={element.strokeColor || "#333333"}
      strokeWidth={(element.strokeWidth || 2) * scale}
      opacity={element.opacity || 1}
      transform={`rotate(${element.rotation || 0} ${element.x} ${element.y})`}
      pointerEvents="none"
      style={{ cursor: "default" }}
    />
  );
}
