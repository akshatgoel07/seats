/**
 * Render tool preview when hovering with an active tool
 * Shows what will be placed when the user clicks
 */
export function renderToolPreview(
  ctx,
  state,
  mousePosition,
  worldToScreen,
  ELEMENT_TYPES,
  categoryMap = new Map(),
) {
  if (!mousePosition) return;

  const { currentTool, toolSettings } = state;

  // Skip preview if already drawing/dragging
  if (!currentTool || currentTool === "select" || currentTool === "pan") return;

  ctx.save();
  ctx.globalAlpha = 0.6; // Semi-transparent preview

  const screenPos = worldToScreen(mousePosition.x, mousePosition.y);
  const scale = state.scene.view.scale;

  // Seat tool preview
  if (currentTool === "seat") {
    const seatToolSettings = toolSettings[currentTool] || {};
    const categoryId =
      seatToolSettings.categoryId ||
      state.scene.venue?.categories?.[0]?.id ||
      "default";
    const seatWidth = (seatToolSettings.width || 20) * scale;
    const seatHeight = (seatToolSettings.height || 20) * scale;

    const category = categoryMap.get(categoryId);
    const color = category?.color || "#cccccc";

    ctx.fillStyle = color;
    ctx.strokeStyle = "#8d6fbf";
    ctx.lineWidth = 2;

    const radius = Math.min(seatWidth / 2, seatHeight / 2);
    ctx.beginPath();
    ctx.roundRect(
      screenPos.x - seatWidth / 2,
      screenPos.y - seatHeight / 2,
      seatWidth,
      seatHeight,
      radius,
    );
    ctx.fill();
    ctx.stroke();
  }

  // Row line tool preview - show a single seat preview
  else if (currentTool === "row-line" || currentTool === "row-arc") {
    const rowToolSettings = toolSettings[currentTool] || {};
    const categoryId =
      rowToolSettings.categoryId ||
      state.scene.venue?.categories?.[0]?.id ||
      "default";
    const seatWidth =
      (rowToolSettings.seatWidth || state.globalSettings?.seatWidth || 20) *
      scale;
    const seatHeight =
      (rowToolSettings.seatHeight || state.globalSettings?.seatHeight || 20) *
      scale;

    const category = categoryMap.get(categoryId);
    const color = category?.color || "#cccccc";

    ctx.fillStyle = color;
    ctx.strokeStyle = "#8d6fbf";
    ctx.lineWidth = 2;

    const radius = Math.min(seatWidth / 2, seatHeight / 2);
    ctx.beginPath();
    ctx.roundRect(
      screenPos.x - seatWidth / 2,
      screenPos.y - seatHeight / 2,
      seatWidth,
      seatHeight,
      radius,
    );
    ctx.fill();
    ctx.stroke();
  }

  // Circle tool preview
  else if (currentTool === "element-circle") {
    const circleSettings = toolSettings[currentTool] || {};
    const radius = (circleSettings.radius || 40) * scale;

    ctx.fillStyle = circleSettings.fillColor || "#e8f4ff";
    ctx.strokeStyle = circleSettings.strokeColor || "#2563eb";
    ctx.lineWidth = circleSettings.strokeWidth || 2;

    ctx.beginPath();
    ctx.arc(screenPos.x, screenPos.y, radius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();

    // Draw center crosshair
    ctx.strokeStyle = "#8d6fbf";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(screenPos.x - 10, screenPos.y);
    ctx.lineTo(screenPos.x + 10, screenPos.y);
    ctx.moveTo(screenPos.x, screenPos.y - 10);
    ctx.lineTo(screenPos.x, screenPos.y + 10);
    ctx.stroke();
  }

  // Rectangle tool preview
  else if (currentTool === "element-rectangle") {
    const rectSettings = toolSettings[currentTool] || {};
    const width = (rectSettings.width || 100) * scale;
    const height = (rectSettings.height || 60) * scale;
    const borderRadius = (rectSettings.borderRadius || 8) * scale;

    ctx.fillStyle = rectSettings.fillColor || "#f0f9ff";
    ctx.strokeStyle = rectSettings.strokeColor || "#0ea5e9";
    ctx.lineWidth = rectSettings.strokeWidth || 2;

    ctx.beginPath();
    ctx.roundRect(
      screenPos.x - width / 2,
      screenPos.y - height / 2,
      width,
      height,
      borderRadius,
    );
    ctx.fill();
    ctx.stroke();

    // Draw center crosshair
    ctx.strokeStyle = "#8d6fbf";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(screenPos.x - 10, screenPos.y);
    ctx.lineTo(screenPos.x + 10, screenPos.y);
    ctx.moveTo(screenPos.x, screenPos.y - 10);
    ctx.lineTo(screenPos.x, screenPos.y + 10);
    ctx.stroke();
  }

  // Text tool preview
  else if (currentTool === "element-text") {
    const textSettings = toolSettings[currentTool] || {};
    const ctext = textSettings.text || "Text";
    const fontSize = (textSettings.fontSize || 16) * scale;
    const fontWeight = textSettings.fontWeight || "normal";
    const fontFamily = textSettings.fontFamily || "Arial";

    ctx.fillStyle = textSettings.fillColor || "#000000";
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    ctx.textAlign = textSettings.textAlign || "center";
    ctx.textBaseline = "middle";

    ctx.fillText(ctext, screenPos.x, screenPos.y);

    // Draw cursor indicator
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = "#8d6fbf";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(screenPos.x, screenPos.y - fontSize);
    ctx.lineTo(screenPos.x, screenPos.y + fontSize);
    ctx.stroke();
  }

  // Table tool preview
  else if (currentTool === "element-table") {
    const tableSettings = toolSettings[currentTool] || {};
    const tableRadius = (tableSettings.tableRadius || 30) * scale;
    const seatRadius = tableSettings.seatRadius || 39;
    const seatCount = tableSettings.seatCount || 10;
    const fillColor = tableSettings.fillColor || "#f0f0f0";
    const strokeColor = tableSettings.strokeColor || "#333333";
    const strokeWidth = tableSettings.strokeWidth || 2;

    // Get seat color from selected category
    const categoryId =
      tableSettings.categoryId ||
      state.scene.venue?.categories?.[0]?.id ||
      "default";
    const category = categoryMap.get(categoryId);
    const seatColor = category?.color || "#cccccc";

    // Table snapping: Find nearby tables and snap to X or Y axis
    const snapTolerance = tableSettings.snapTolerance || 25; // pixels
    let snappedX = mousePosition.x;
    let snappedY = mousePosition.y;
    let xSnapped = false;
    let ySnapped = false;
    let snapLines = []; // Store snap lines to draw

    // Check all existing tables (circle elements with "Table" label pattern)
    Object.values(state.scene.elements).forEach((existingElement) => {
      if (existingElement.type === ELEMENT_TYPES.CIRCLE &&
          (existingElement.label === "Table" ||
           existingElement.label?.startsWith("T") ||
           existingElement.label?.includes("Table"))) {

        // Check X-axis alignment (snap to same X coordinate)
        if (!xSnapped) {
          const xDistance = Math.abs(mousePosition.x - existingElement.x);
          if (xDistance < snapTolerance) {
            snappedX = existingElement.x;
            xSnapped = true;
            snapLines.push({ type: 'vertical', pos: existingElement.x });
          }
        }

        // Check Y-axis alignment (snap to same Y coordinate)
        if (!ySnapped) {
          const yDistance = Math.abs(mousePosition.y - existingElement.y);
          if (yDistance < snapTolerance) {
            snappedY = existingElement.y;
            ySnapped = true;
            snapLines.push({ type: 'horizontal', pos: existingElement.y });
          }
        }
      }
    });

    // Use snapped position for preview
    const previewScreenPos = worldToScreen(snappedX, snappedY);

    // Draw snap guide lines if snapped
    if (xSnapped || ySnapped) {
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = "#3b82f6"; // Blue snap indicator
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);

      snapLines.forEach(line => {
        const lineScreenPos = worldToScreen(line.pos, line.pos);
        ctx.beginPath();
        if (line.type === 'vertical') {
          ctx.moveTo(lineScreenPos.x, 0);
          ctx.lineTo(lineScreenPos.x, ctx.canvas.height);
        } else {
          ctx.moveTo(0, lineScreenPos.y);
          ctx.lineTo(ctx.canvas.width, lineScreenPos.y);
        }
        ctx.stroke();
      });

      ctx.restore();
    }

    // Draw table
    ctx.fillStyle = fillColor;
    ctx.strokeStyle = xSnapped || ySnapped ? "#3b82f6" : strokeColor;
    ctx.lineWidth = strokeWidth + (xSnapped || ySnapped ? 1 : 0);
    ctx.beginPath();
    ctx.arc(previewScreenPos.x, previewScreenPos.y, tableRadius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();

    // Draw seats around table
    const seatSpacing = (2 * Math.PI) / seatCount;
    for (let i = 0; i < seatCount; i++) {
      const angle = i * seatSpacing;
      const seatX = previewScreenPos.x + seatRadius * scale * Math.cos(angle);
      const seatY = previewScreenPos.y + seatRadius * scale * Math.sin(angle);

      ctx.fillStyle = seatColor;
      ctx.strokeStyle = "#8d6fbf";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(seatX, seatY, 6 * scale, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
    }
  }

  // Multi-row tool preview
  else if (currentTool === "multi-row") {
    // Show crosshair cursor preview
    ctx.strokeStyle = "#8d6fbf";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);

    // Draw crosshair
    ctx.beginPath();
    ctx.moveTo(screenPos.x - 12, screenPos.y);
    ctx.lineTo(screenPos.x + 12, screenPos.y);
    ctx.moveTo(screenPos.x, screenPos.y - 12);
    ctx.lineTo(screenPos.x, screenPos.y + 12);
    ctx.stroke();

    // Draw center dot
    ctx.setLineDash([]);
    ctx.fillStyle = "#8d6fbf";
    ctx.beginPath();
    ctx.arc(screenPos.x, screenPos.y, 2, 0, 2 * Math.PI);
    ctx.fill();
  }

  // Standing section preview
  else if (currentTool === "standing-section") {
    const standingSettings = toolSettings[currentTool] || {};
    const width = (standingSettings.width || 150) * scale;
    const height = (standingSettings.height || 100) * scale;
    const borderRadius = 8 * scale;

    ctx.fillStyle = standingSettings.fillColor || "#e5e7eb";
    ctx.strokeStyle = standingSettings.strokeColor || "#6b7280";
    ctx.lineWidth = standingSettings.strokeWidth || 2;

    ctx.beginPath();
    ctx.roundRect(
      screenPos.x - width / 2,
      screenPos.y - height / 2,
      width,
      height,
      borderRadius,
    );
    ctx.fill();

    if (standingSettings.strokeWidth > 0) {
      ctx.stroke();
    }

    // Draw capacity label
    const capacity = standingSettings.standingCapacity || 50;
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#374151";
    ctx.font = `bold ${12 * scale}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${capacity} people`, screenPos.x, screenPos.y);

    // Draw center crosshair
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = "#8d6fbf";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(screenPos.x - 10, screenPos.y);
    ctx.lineTo(screenPos.x + 10, screenPos.y);
    ctx.moveTo(screenPos.x, screenPos.y - 10);
    ctx.lineTo(screenPos.x, screenPos.y + 10);
    ctx.stroke();
  }

  ctx.restore();
}
