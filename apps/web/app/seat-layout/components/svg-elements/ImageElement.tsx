/**
 * ImageElement component
 * Renders an image SVG element (SVG images only) with scaling and rotation
 */

import React from "react";
import type { RendererElement } from "../../types.ts";

type ElementProps = {
  element: RendererElement;
  elementId: string;
};

export function ImageElement({ element, elementId }: ElementProps) {
  const scale = element.scale || 1.0;

  // Only render SVG images (background elements), not regular image files
  const isSvgImage =
    element.src &&
    (element.src.startsWith("data:image/svg+xml") ||
      element.src.endsWith(".svg"));

  if (!isSvgImage) {
    return null;
  }

  return (
    <image
      key={elementId}
      x={element.x - (element.width * scale) / 2}
      y={element.y - (element.height * scale) / 2}
      width={element.width * scale}
      height={element.height * scale}
      href={element.src}
      transform={`rotate(${element.rotation || 0} ${element.x} ${element.y})`}
      pointerEvents="none"
      style={{ cursor: "default" }}
    />
  );
}
