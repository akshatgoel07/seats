// Data structure definitions and defaults for the seat layout editor

export const TOOL_TYPES = {
  SELECT: "select",
  ROW_LINE: "row-line",
  ROW_ARC: "row-arc",
  MULTI_ROW: "multi-row",
  SEAT: "seat",
  ELEMENT_CIRCLE: "element-circle",
  ELEMENT_TABLE: "element-table",
  ELEMENT_RECTANGLE: "element-rectangle",
  ELEMENT_PATH: "element-path",
  ELEMENT_TEXT: "element-text",
  STANDING_SECTION: "standing-section",
  PAN: "pan",
  IMAGE_UPLOAD: "image-upload",
  MEASURE: "measure",
};

export const GEOMETRY_TYPES = {
  LINE: "line",
  ARC: "arc",
};

export const ELEMENT_TYPES = {
  CIRCLE: "circle",
  RECTANGLE: "rectangle",
  PATH: "path",
  TEXT: "text",
  IMAGE: "image",
  STANDING_SECTION: "standing-section",
  SEATING_SECTION: "seating-section",
  SECTION_BOUNDARY: "section-boundary",
};

// Create a unique ID
export function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

// Utility functions for dynamic category mapping
export function createDynamicCategories(seatTypes) {
  return seatTypes.map((seatType) => ({
    id: seatType.sst_id.toString(),
    name: seatType.sst_seat_type || `Seat Type ${seatType.sst_id}`,
    color:
      seatType.sst_seat_color_code || generateCategoryColor(seatType.sst_id),
    price: 0, // Price might be fetched from a different endpoint or field
    screen_seat_type_id: seatType.sst_id,
    is_open_seating_area: seatType.is_open_seating_area,
    sst_no_of_seats: seatType.sst_no_of_seats,
  }));
}

// Create standing section from API data
export function createStandingSectionFromAPI(apiStandingSection) {
  return createElement(
    ELEMENT_TYPES.STANDING_SECTION,
    0, // Will be set when placed
    0, // Will be set when placed
    200, // Default width
    150, // Default height
    {
      standingCapacity: apiStandingSection.sst_no_of_seats || 100,
      sectionType: "general",
      fillColor: "transparent", // Transparent for clean look
      strokeColor: "transparent", // No border for clean look
      strokeWidth: 0, // No border width
      opacity: 1.0, // Full opacity
      label: apiStandingSection.sst_seat_type || "Standing Section",
      entryPoints: [],
      exitPoints: [],
      // API data for reference
      apiData: apiStandingSection,
    },
  );
}

export function mapSeatTypeToCategory(seatTypeId, categories) {
  const category = categories.find(
    (cat) => cat.screen_seat_type_id === seatTypeId,
  );
  return category ? category.id : "default";
}

export function getCategoryById(categoryId, categories) {
  return categories.find((cat) => cat.id === categoryId) || null;
}

function generateCategoryColor(seatTypeId) {
  // Generate consistent colors based on seat type ID
  const colors = [
    "#4a90e2", // Blue
    "#7ed321", // Green
    "#f5a623", // Orange
    "#e94b3c", // Red
    "#9013fe", // Purple
    "#50e3c2", // Teal
    "#b8e986", // Light green
    "#f8e71c", // Yellow
    "#f0932b", // Orange
    "#eb4d4b", // Red
    "#6c5ce7", // Purple
    "#a29bfe", // Light purple
    "#fd79a8", // Pink
    "#00b894", // Dark teal
    "#00cec9", // Cyan
  ];

  return colors[seatTypeId % colors.length];
}

// Venue structure
export function createVenue(name = "New Venue", categories = []) {
  return {
    id: generateId(),
    name,
    sections: /** @type {string[]} */ ([]), // Array of section IDs
    categories:
      categories.length > 0
        ? categories
        : [
            {
              id: "default",
              name: "Default",
              color: "#4a90e2",
              price: 0,
            },
          ],
  };
}

// Section structure
export function createSection(name = "New Section", categoryId = "default") {
  return {
    id: generateId(),
    name,
    categoryId,
    rows: [], // Array of row IDs
    transform: {
      x: 0,
      y: 0,
      rotation: 0,
    },
  };
}

// Section boundary structure for closed path sections
export function createSectionBoundary(
  name = "New Section",
  categoryId = "default",
  pathElement = /** @type {{ id?: any } | null} */ (null),
) {
  return {
    id: generateId(),
    name,
    categoryId,
    pathElementId: pathElement?.id || null, // Reference to the path element
    isClosed: true,
    showAsSolid: true, // Whether to show as solid area when zoomed out
    zoomThreshold: 0.5, // Zoom level below which to show as solid
    transform: {
      x: 0,
      y: 0,
      rotation: 0,
    },
  };
}

// Row structure
export function createRow(
  sectionId,
  geometry,
  seatCount = 10,
  spacing = 40,
  categoryId = "default",
  curve = 0,
) {
  return {
    id: generateId(),
    sectionId,
    geometry, // { kind: "line", p1: {x, y}, p2: {x, y} } or { kind: "arc", center: {x, y}, radiusX, radiusY, startAngle, endAngle }
    seatCount,
    spacing,
    categoryId,
    curve,
    transform: {
      x: 0,
      y: 0,
      rotation: 0,
    },
  };
}

// Seat structure
export function createSeat(
  rowId,
  localX,
  localY,
  label = "",
  categoryId = "default",
  width = 20,
  height = 20,
) {
  return {
    id: generateId(),
    rowId,
    localX, // Position relative to row
    localY,
    width: width || 20,
    height: height || 20,
    radius: 10,
    label,
    categoryId,
    isAvailable: true,
  };
}

// View state
export function createViewState() {
  return {
    scale: 1.0,
    tx: 400, // Translation X
    ty: 300, // Translation Y
  };
}

// Element structure for layout elements like tables, paths, etc.
export function createElement(
  type,
  x,
  y,
  width = 50,
  height = 50,
  properties: any = {},
) {
  const baseElement = {
    id: generateId(),
    type,
    x,
    y,
    width,
    height,
    rotation: 0,
    fillColor: "#f0f0f0",
    strokeColor: "#333333",
    strokeWidth: 2,
    opacity: 1,
    label: "",
    ...properties,
  };

  if (type === ELEMENT_TYPES.CIRCLE) {
    return {
      ...baseElement,
      radius: Math.min(width, height) / 2,
    };
  } else if (type === ELEMENT_TYPES.PATH) {
    return {
      ...baseElement,
      points: properties.points || [
        { x, y },
        { x: x + 50, y: y + 50 },
      ],
      curveHandles: properties.curveHandles || {},
      strokeWidth: properties.strokeWidth || 2,
      strokeColor: properties.strokeColor || "rgba(0, 0, 0, 0.9)",
      fillColor: properties.fillColor || "transparent",
      opacity: properties.opacity || 0.8,
      label: properties.label || "Path",
      isClosed: properties.isClosed || false,
      scale: properties.scale || 1.0,
    };
  } else if (type === ELEMENT_TYPES.TEXT) {
    return {
      ...baseElement,
      text: properties.text || "Text",
      fontSize: properties.fontSize || 16,
      fontFamily: properties.fontFamily || "Arial",
      fontWeight: properties.fontWeight || "normal",
      textAlign: properties.textAlign || "center",
      fillColor: "#000000",
      strokeColor: "transparent",
      strokeWidth: 0,
      rotation: properties.rotation || 0,
    };
  } else if (type === ELEMENT_TYPES.IMAGE) {
    return {
      ...baseElement,
      src: properties.src || "",
      imageWidth: properties.imageWidth || width,
      imageHeight: properties.imageHeight || height,
      opacity: properties.opacity || 1,
      fillColor: "transparent",
      strokeColor: "transparent",
      strokeWidth: 0,
      locked: properties.locked || false,
    };
  } else if (type === ELEMENT_TYPES.RECTANGLE) {
    return {
      ...baseElement,
      borderRadius: properties.borderRadius || 0,
    };
  } else if (type === ELEMENT_TYPES.STANDING_SECTION) {
    return {
      ...baseElement,
      type: ELEMENT_TYPES.STANDING_SECTION,
      standingCapacity: properties.standingCapacity || 50,
      sectionType: properties.sectionType || "general", // general, vip, premium
      entryPoints: properties.entryPoints || [],
      exitPoints: properties.exitPoints || [],
      fillColor: properties.fillColor || "#e5e7eb",
      strokeColor: properties.strokeColor || "transparent",
      strokeWidth: properties.strokeWidth || 0, // Always 0 for clean appearance
      label: properties.label || "Standing Section",
      opacity: properties.opacity || 1.0, // Full opacity by default
      backgroundImage: properties.backgroundImage || null,
      backgroundImageWidth: properties.backgroundImageWidth || null,
      backgroundImageHeight: properties.backgroundImageHeight || null,
    };
  } else if (type === ELEMENT_TYPES.SEATING_SECTION) {
    return {
      ...baseElement,
      type: ELEMENT_TYPES.SEATING_SECTION,
      sectionName: properties.sectionName || "",
      categoryId: properties.categoryId || "default",
      fillColor: properties.fillColor || "#e5e7eb",
      strokeColor: properties.strokeColor || "#6b7280",
      strokeWidth: properties.strokeWidth || 2,
      label: properties.label || "",
      opacity: properties.opacity || 1.0,
      backgroundImage: properties.backgroundImage || null,
      backgroundImageWidth: properties.backgroundImageWidth || null,
      backgroundImageHeight: properties.backgroundImageHeight || null,
      zoomThreshold: properties.zoomThreshold || 0.5, // Zoom level for showing seats
      showAsSolid:
        properties.showAsSolid !== undefined ? properties.showAsSolid : true,
    };
  } else if (type === ELEMENT_TYPES.SECTION_BOUNDARY) {
    return {
      ...baseElement,
      type: ELEMENT_TYPES.SECTION_BOUNDARY,
      points: properties.points || [],
      curveHandles: properties.curveHandles || {},
      fillColor: properties.fillColor || "rgba(0, 0, 0, 0.1)",
      strokeColor: properties.strokeColor || "rgba(0, 0, 0, 0.9)",
      strokeWidth: properties.strokeWidth || 2,
      label: properties.label || "Section Boundary",
      opacity: properties.opacity || 0.8,
      showAsSolid:
        properties.showAsSolid !== undefined ? properties.showAsSolid : true,
      zoomThreshold: properties.zoomThreshold || 0.5,
      sectionName: properties.sectionName || "New Section",
      categoryId: properties.categoryId || "default",
    };
  }

  return baseElement;
}

// Scene structure (contains all venue data)
export function createScene(categories = []) {
  const venue = createVenue("Opera House", categories);

  return {
    venue,
    sections: {}, // Section ID -> Section object
    rows: {}, // Row ID -> Row object
    seats: {}, // Seat ID -> Seat object
    elements: {}, // Element ID -> Element object (tables, shapes, paths)
    view: createViewState(),
  };
}

// Global default settings for seat layout
export function createGlobalSettings(firstCategoryId = null) {
  return {
    seatWidth: 20,
    seatHeight: 20,
    seatSpacing: 7.0,
    rowSpacing: 30,
    defaultSeatCount: 10,
    categoryId: firstCategoryId,
    defaultCategoryId: firstCategoryId,
    seatSpacingLocked: false,
    seatCountLocked: false,
    showSeatingSectionStroke: false,
    showSectionBoundaryInRenderer: false,
  };
}

export function createToolSettings() {
  return {
    [TOOL_TYPES.ELEMENT_TEXT]: {
      text: "Text",
      fontSize: 16,
      fontWeight: "normal",
      fontFamily: "Arial",
      textAlign: "center",
      fillColor: "#000000",
      strokeColor: "#000000",
      strokeWidth: 0,
    },
    [TOOL_TYPES.ELEMENT_CIRCLE]: {
      radius: 25,
      fillColor: "#f0f0f0",
      strokeColor: "#333333",
      strokeWidth: 2,
    },
    [TOOL_TYPES.ELEMENT_RECTANGLE]: {
      width: 100,
      height: 80,
      fillColor: "#dbeafe",
      strokeColor: "#3b82f6",
      strokeWidth: 2,
      rotation: 0,
      borderRadius: 8,
    },
    [TOOL_TYPES.ELEMENT_PATH]: {
      strokeColor: "rgba(0, 0, 0, 0.9)",
      strokeWidth: 2,
      opacity: 1.0,
    },
    [TOOL_TYPES.SEAT]: {
      categoryId: "default",
      width: 20,
      height: 20,
    },
    [TOOL_TYPES.ROW_LINE]: {
      categoryId: "default",
      seatCount: 10,
      seatSpacing: 7.0,
      seatWidth: 20,
      seatHeight: 20,
    },
    [TOOL_TYPES.ROW_ARC]: {
      categoryId: "default",
      seatCount: 10,
      seatSpacing: 7.0,
      seatWidth: 20,
      seatHeight: 20,
    },
    [TOOL_TYPES.MULTI_ROW]: {
      categoryId: "default",
      seatCount: 10,
      seatSpacing: 7.0,
      seatWidth: 20,
      seatHeight: 20,
      rowSpacing: 30,
    },
    [TOOL_TYPES.ELEMENT_TABLE]: {
      categoryId: "default",
      seatCount: 10,
      tableRadius: 30,
      seatRadius: 39,
    },
    [TOOL_TYPES.STANDING_SECTION]: {
      width: 150,
      height: 100,
      standingCapacity: 50,
      sectionType: "general",
      fillColor: "#e5e7eb",
      strokeColor: "transparent", // No border by default for clean look
      strokeWidth: 0,
      opacity: 1.0,
      label: "Standing Section",
      backgroundImage: null,
      backgroundImageWidth: null,
      backgroundImageHeight: null,
    },
    [TOOL_TYPES.ELEMENT_PATH]: {
      strokeColor: "rgba(0, 0, 0, 0.9)",
      strokeWidth: 2,
      opacity: 1.0,
      fillColor: "rgba(0, 0, 0, 0.1)",
      showAsSolid: true,
      zoomThreshold: 0.5,
    },
    [TOOL_TYPES.SELECT]: {},
    [TOOL_TYPES.PAN]: {},
  };
}

// Editor state
export function createDefaultEditorState(categories = []) {
  const scene = createScene(categories);

  // Add a default section
  const defaultSection = createSection(
    "Orchestra",
    categories.length > 0 ? categories[0].id : "default",
  );
  scene.sections[defaultSection.id] = defaultSection;
  scene.venue.sections.push(defaultSection.id);

  return {
    currentTool: TOOL_TYPES.SELECT,
    selectedIds: [],
    scene,
    isGridVisible: true,
    history: {
      past: [],
      present: scene,
      future: [],
    },
    clipboard: {
      rows: [],
      seats: [],
      elements: [],
      isEmpty: true,
    },
    pathCompletionRequested: false,
    drawingCancelled: false,
    globalSettings: createGlobalSettings(),
    toolSettings: createToolSettings(),
  };
}

// Geometry helpers
export function createLineGeometry(x1, y1, x2, y2) {
  return {
    kind: GEOMETRY_TYPES.LINE,
    p1: { x: x1, y: y1 },
    p2: { x: x2, y: y2 },
  };
}

export function createArcGeometry(
  centerX,
  centerY,
  radiusX,
  radiusY,
  startAngle,
  endAngle,
) {
  return {
    kind: GEOMETRY_TYPES.ARC,
    center: { x: centerX, y: centerY },
    radiusX, // Major axis (horizontal)
    radiusY, // Minor axis (vertical)
    startAngle,
    endAngle,
  };
}

// Backward compatibility - create circular arc
export function createCircularArcGeometry(
  centerX,
  centerY,
  radius,
  startAngle,
  endAngle,
) {
  return createArcGeometry(
    centerX,
    centerY,
    radius,
    radius,
    startAngle,
    endAngle,
  );
}

// Utility functions
export function getRowLength(geometry) {
  if (geometry.kind === GEOMETRY_TYPES.LINE) {
    const dx = geometry.p2.x - geometry.p1.x;
    const dy = geometry.p2.y - geometry.p1.y;
    return Math.sqrt(dx * dx + dy * dy);
  } else if (geometry.kind === GEOMETRY_TYPES.ARC) {
    const angleSpan = Math.abs(geometry.endAngle - geometry.startAngle);
    // For elliptical arcs, use the average of the two radii for length approximation
    const avgRadius = (geometry.radiusX + geometry.radiusY) / 2;
    return avgRadius * angleSpan;
  }
  return 0;
}

export function getRowDirection(geometry) {
  if (geometry.kind === GEOMETRY_TYPES.LINE) {
    const dx = geometry.p2.x - geometry.p1.x;
    const dy = geometry.p2.y - geometry.p1.y;
    return Math.atan2(dy, dx);
  } else if (geometry.kind === GEOMETRY_TYPES.ARC) {
    // For arcs, direction changes along the curve
    return geometry.startAngle;
  }
  return 0;
}

export function getPointOnRow(geometry, t) {
  // t is between 0 and 1, representing position along the row
  if (geometry.kind === GEOMETRY_TYPES.LINE) {
    const { p1, p2 } = geometry;
    return {
      x: p1.x + t * (p2.x - p1.x),
      y: p1.y + t * (p2.y - p1.y),
    };
  } else if (geometry.kind === GEOMETRY_TYPES.ARC) {
    const { center, radiusX, radiusY, startAngle, endAngle } = geometry;
    const angle = startAngle + t * (endAngle - startAngle);
    return {
      x: center.x + radiusX * Math.cos(angle),
      y: center.y + radiusY * Math.sin(angle),
    };
  }
  return { x: 0, y: 0 };
}

// Get aspect ratio of elliptical arc (major/minor axis ratio)
export function getArcAspectRatio(geometry) {
  if (geometry.kind === GEOMETRY_TYPES.ARC) {
    return geometry.radiusX / geometry.radiusY;
  }
  return 1; // Default for circular or other geometries
}

// Migrate old arc geometry to new format (handles legacy data with single radius)
export function migrateArcGeometry(geometry) {
  if (geometry.kind === GEOMETRY_TYPES.ARC) {
    // If it has the old single radius property, convert to elliptical
    if (geometry.radius && !geometry.radiusX) {
      geometry.radiusX = geometry.radius;
      geometry.radiusY = geometry.radius;
      delete geometry.radius; // Remove old property
    }
  }
  return geometry;
}

// Table labeling utility functions
export function generateTableLabel(rowIndex, columnIndex) {
  // Convert row index (0-based) to letter (A, B, C, etc.)
  const rowLetter = String.fromCharCode(65 + rowIndex);

  // Column index (0-based) becomes 1-based number
  const columnNumber = columnIndex + 1;

  return `${rowLetter}-${columnNumber}`;
}

export function parseTableLabel(label) {
  // Parse label like "A-1", "B-2" back to row/column indices
  if (!label || typeof label !== "string" || label.length < 3) {
    return { rowIndex: 0, columnIndex: 0 };
  }

  const parts = label.split("-");
  if (parts.length !== 2) {
    return { rowIndex: 0, columnIndex: 0 };
  }

  const rowLetter = parts[0].toUpperCase();
  const columnNumber = parseInt(parts[1]);

  if (rowLetter < "A" || rowLetter > "Z" || isNaN(columnNumber)) {
    return { rowIndex: 0, columnIndex: 0 };
  }

  return {
    rowIndex: rowLetter.charCodeAt(0) - 65,
    columnIndex: columnNumber - 1,
  };
}

export function detectTableGrid(elements) {
  console.log("Filtering table elements (circles)...");
  const tables = Object.values(elements).filter(
    (element) => element.type === ELEMENT_TYPES.CIRCLE,
  );
  console.log(`Found ${tables.length} circle elements`);

  if (tables.length === 0) {
    console.log("No tables found, returning empty grid");
    return { rows: 0, columns: 0, grid: [] };
  }

  console.log("Grouping tables by Y positions (rows)...", tables);
  const rowGroups = {};
  tables.forEach((table) => {
    const y = Math.floor(table.y / 50 + 0.5) * 50;

    console.log(`Table at y=${table.y} rounded to y=${y}`);
    if (!rowGroups[y]) {
      rowGroups[y] = [];
    }
    rowGroups[y].push(table);
  });

  console.log("Sorting Y positions for row order...");
  const sortedYPositions = Object.keys(rowGroups)
    .map(Number)
    .sort((a, b) => a - b);
  console.log(`Sorted Y positions: ${sortedYPositions}`);

  console.log("Processing each row to group by X positions (columns)...");
  const grid = sortedYPositions.map((y, rowIndex) => {
    console.log(`Processing row ${rowIndex} at y=${y}`);
    const rowTables = rowGroups[y];

    const columnGroups = {};
    rowTables.forEach((table) => {
      const x = Math.round(table.x / 50) * 50;
      console.log(`Table at x=${table.x} rounded to x=${x}`);
      if (!columnGroups[x]) {
        columnGroups[x] = [];
      }
      columnGroups[x].push(table);
    });
    console.log("rowGroups", rowGroups);
    console.log("columnGroups", columnGroups);
    console.log("Sorting X positions for column order...");
    const sortedXPositions = Object.keys(columnGroups)
      .map(Number)
      .sort((a, b) => a - b);
    console.log(`Sorted X positions for row ${rowIndex}: ${sortedXPositions}`);

    return sortedXPositions.map((x, colIndex) => {
      console.log(`Processing cell at row ${rowIndex}, col ${colIndex}`);
      const colTables = columnGroups[x];

      console.log(`Updating labels for ${colTables.length} tables in cell`);
      colTables.forEach((table) => {
        const newLabel = generateTableLabel(rowIndex, colIndex);
        console.log(`Assigning label ${newLabel} to table at x=${x}, y=${y}`);
        table.label = newLabel;
      });

      return {
        rowIndex,
        colIndex,
        x,
        y,
        tables: colTables,
        label: generateTableLabel(rowIndex, colIndex),
      };
    });
  });

  console.log("Finalizing grid structure...");
  return {
    rows: sortedYPositions.length,
    columns: Math.max(...grid.map((row) => row.length)),
    grid: grid.flat(),
  };
}
export function assignTableLabelsToGrid(elements, seats = {}) {
  const gridInfo = detectTableGrid(elements);

  // Update all table labels in the elements object
  gridInfo.grid.forEach((cell) => {
    cell.tables.forEach((table) => {
      // Update the label in the elements object
      elements[table.id] = {
        ...elements[table.id],
        label: cell.label,
      };

      // Find and update seats around this table
      const tableCenterX = table.x;
      const tableCenterY = table.y;
      const tableRadius = table.radius || 30;

      // Look for seats within a reasonable distance of the table center
      Object.values(seats).forEach((seat) => {
        if (seat.rowId === null) {
          // Standalone seats (table seats)
          const distance = Math.sqrt(
            Math.pow(seat.localX - tableCenterX, 2) +
              Math.pow(seat.localY - tableCenterY, 2),
          );

          // If seat is within table radius + some tolerance, assign table-based label
          if (distance <= tableRadius + 20) {
            const angle = Math.atan2(
              seat.localY - tableCenterY,
              seat.localX - tableCenterX,
            );
            const seatIndex =
              Math.round(((angle + Math.PI) / (2 * Math.PI)) * 10) % 10;

            // Update seat label based on table label and position
            const seatLabel = `${cell.label}-${seatIndex + 1}`;
            seats[seat.id] = {
              ...seats[seat.id],
              label: seatLabel,
            };
          }
        }
      });
    });
  });

  return gridInfo;
}

export function getNextTableLabel(elements) {
  const gridInfo = detectTableGrid(elements);

  if (gridInfo.grid.length === 0) {
    return "A-1";
  }

  // Find the highest row and column indices used
  let maxRowIndex = 0;
  let maxColIndex = 0;

  gridInfo.grid.forEach((cell) => {
    maxRowIndex = Math.max(maxRowIndex, cell.rowIndex);
    maxColIndex = Math.max(maxColIndex, cell.colIndex);
  });

  // Generate the next label in sequence
  const nextRowIndex = maxRowIndex;
  const nextColIndex = maxColIndex + 1;

  return generateTableLabel(nextRowIndex, nextColIndex);
}

// Test utility to verify dynamic category integration
export function testDynamicCategoryIntegration() {
  // Mock seat types data (similar to API response)
  const mockSeatTypes = [
    {
      sst_id: 70,
      sst_seat_type: "Lounges",
      sst_seat_color_code: "#2c32dd",
    },
    {
      sst_id: 69,
      sst_seat_type: "Premium",
      sst_seat_color_code: "#dd2cce",
    },
    {
      sst_id: 68,
      sst_seat_type: "Standard",
      sst_seat_color_code: "#dc2828",
    },
  ];

  // Create dynamic categories
  const dynamicCategories = createDynamicCategories(mockSeatTypes);
  console.log("Dynamic categories:", dynamicCategories);

  // Test mapping
  const mappedCategoryId = mapSeatTypeToCategory(70, dynamicCategories);
  console.log("Mapped category ID for seat type 70:", mappedCategoryId);

  // Test category lookup
  const category = getCategoryById(mappedCategoryId, dynamicCategories);
  console.log("Found category:", category);

  return { dynamicCategories, mappedCategoryId, category };
}
