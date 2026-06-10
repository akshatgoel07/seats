/**
 * CircleElement component
 * Renders a circle SVG element with scaling and rotation
 */

import React from "react";

export function CircleElement({ element, elementId }) {
  const scale = element.scale || 1.0;
  const scaledX = element.x;
  const scaledY = element.y;

  return (
    <circle
      key={elementId}
      cx={scaledX}
      cy={scaledY}
      r={
        (element.radius || Math.min(element.width, element.height) / 2) * scale
      }
      fill={element.fillColor || "#f0f0f0"}
      stroke={element.strokeColor || "#333333"}
      strokeWidth={(element.strokeWidth || 2) * scale}
      opacity={element.opacity || 1}
      transform={`rotate(${element.rotation || 0} ${scaledX} ${scaledY})`}
      pointerEvents="none"
      style={{ cursor: "default" }}
    />
  );
}
