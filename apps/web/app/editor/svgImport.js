"use client";

import { createElement, ELEMENT_TYPES } from "./types.js";

export function svgPathsToElements(svgText, options = {}) {
  const { sampleDistance = 5, defaultStrokeColor = "#333333" } = options;
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, "image/svg+xml");
  const pathNodes = Array.from(doc.querySelectorAll("path"));
  const elements = [];

  pathNodes.forEach((node) => {
    const d = node.getAttribute("d");
    if (!d) return;

    const tempSvg = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    const tempPath = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    tempPath.setAttribute("d", d);
    tempSvg.appendChild(tempPath);

    let length = 0;
    try {
      length = tempPath.getTotalLength();
    } catch (_) {
      length = 0;
    }
    if (!isFinite(length) || length <= 0) return;

    const step = Math.max(1, sampleDistance);
    const points = [];
    for (let dist = 0; dist <= length; dist += step) {
      const pt = tempPath.getPointAtLength(dist);
      points.push({ x: pt.x, y: pt.y });
    }
    if (points.length < 2) return;

    const strokeColor = node.getAttribute("stroke") || defaultStrokeColor;
    const strokeWidth = parseFloat(node.getAttribute("strokeWidth") || "2");
    const opacity = parseFloat(node.getAttribute("opacity") || "1");
    const label = node.getAttribute("id") || node.getAttribute("class") || "";

    const element = createElement(ELEMENT_TYPES.PATH, 0, 0, 0, 0, {
      points,
      strokeColor,
      strokeWidth: isFinite(strokeWidth) ? strokeWidth : 2,
      opacity: isFinite(opacity) ? opacity : 1,
      label,
      fillColor: "transparent",
    });

    elements.push(element);
  });

  return elements;
}
