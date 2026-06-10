/**
 * TextElement component
 * Renders a text SVG element with scaling and rotation
 */

import React from "react";

export function TextElement({ element, elementId }) {
  const scale = element.scale || 1.0;
  // Convert rotation from radians to degrees for SVG transform
  const rotationDegrees = ((element.rotation || 0) * 180) / Math.PI;

  return (
    <text
      key={elementId}
      x={element.x}
      y={element.y}
      fill={element.fillColor || "#000000"}
      fontSize={(element.fontSize || 16) * scale}
      fontFamily={element.fontFamily || "Arial"}
      fontWeight={element.fontWeight || "normal"}
      textAnchor={element.textAlign === "center" ? "middle" : "start"}
      dominantBaseline="middle"
      opacity={element.opacity || 1}
      transform={`rotate(${rotationDegrees} ${element.x} ${element.y})`}
      pointerEvents="none"
      style={{ cursor: "default", userSelect: "none" }}
    >
      {element.text || "Text"}
    </text>
  );
}
