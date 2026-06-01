"use client";

import React, { useState, useCallback, useRef } from "react";
import { useEditor } from "./EditorContext.js";
import {
  createSection,
  createElement,
  ELEMENT_TYPES,
  createStandingSectionFromAPI,
} from "./types.js";
import { ApiService } from "../../services/api.js";
import { useParams } from "next/navigation.js";
import { useSeatTypes } from "./hooks/useSeatTypes.js";
import {
  PropertySection,
  LazyPropertySection,
  SceneProperties,
  RowProperties,
  SeatProperties,
  ElementProperties,
  ActionsPanel,
  CategoriesPanel,
  SectionsPanel,
  SeatSettings,
} from "./components/properties/index.js";
import { ToolProperties } from "./components/properties/ToolProperties.js";
import { TableProperties } from "./components/properties/TableProperties.js";
import { PanelRightClose, PanelRightOpen } from "lucide-react";

export default function PropertiesPanel({ isVisible = true, onClose, onOpen }) {
  const { state, actions } = useEditor();
  const { selectedIds, scene, currentTool, toolSettings } = state;
  const [isSaving, setIsSaving] = useState(false);
  const { screenId } = useParams();
  // console.log("PropertiesPanel - screenId from URL params:", screenId);
  // console.log("PropertiesPanel - screenId type:", typeof screenId);
  const { seatTypes, regularSeatTypes, standingSections } =
    useSeatTypes(screenId);

  // Map API seat types to category structure expected by UI (only regular seats, not open seating areas)
  const categories = regularSeatTypes
    .map((seatType) => ({
      id: seatType.sst_id.toString(),
      name: seatType.sst_seat_type,
      color: seatType.sst_seat_color_code,
      price: 100, // Default price since not in API response
      order: seatType.sst_order,
    }))
    .sort((a, b) => a.order - b.order);

  // Get selected items
  const selectedSeats = selectedIds
    .filter((id) => scene.seats[id])
    .map((id) => scene.seats[id]);
  const selectedRows = selectedIds
    .filter((id) => scene.rows[id])
    .map((id) => scene.rows[id]);
  const selectedElements = selectedIds
    .filter((id) => scene.elements && scene.elements[id])
    .map((id) => scene.elements[id]);

  const inferredRowFromSelectedSeats = (() => {
    const rowIds = Array.from(
      new Set(selectedSeats.map((s) => s.rowId).filter(Boolean)),
    );
    if (rowIds.length === 1) {
      return scene.rows[rowIds[0]];
    }
    return null;
  })();

  // Detect table and seat group selection
  const tableAndSeatsGroup = (() => {
    // Check if we have exactly 1 table (circle element) and multiple seats
    const circleElements = selectedElements.filter(
      (el) => el.type === "circle",
    );
    const standaloneSeats = selectedSeats.filter((seat) => !seat.rowId);

    if (circleElements.length === 1 && standaloneSeats.length > 0) {
      const table = circleElements[0];
      const tableX = table.x;
      const tableY = table.y;

      // Check if seats are around the table (within reasonable distance)
      const seatsAroundTable = standaloneSeats.filter((seat) => {
        const distance = Math.sqrt(
          Math.pow(seat.localX - tableX, 2) + Math.pow(seat.localY - tableY, 2),
        );
        // Check if seat is within typical table radius range (20-150px)
        return distance >= 20 && distance <= 150;
      });

      // If we have seats around the table, consider it a table group
      if (
        seatsAroundTable.length > 0 &&
        seatsAroundTable.length === standaloneSeats.length
      ) {
        return {
          table: table,
          seats: seatsAroundTable,
        };
      }
    }

    return null;
  })();

  const hasSelection = selectedIds.length > 0;
  const multipleSelected = selectedIds.length > 1;

  // Debounce timer for property updates
  const debounceTimerRef = useRef(/** @type {ReturnType<typeof setTimeout> | null} */ (null));
  const firstUpdateRef = useRef(true);

  // Helper to handle debounced property updates
  const handleDebouncedUpdate = useCallback((updateAction) => {
    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Perform the update with history saving on first call only
    const shouldSaveHistory = firstUpdateRef.current;
    updateAction(shouldSaveHistory);

    if (firstUpdateRef.current) {
      firstUpdateRef.current = false;
    }

    // Set timeout to reset after user stops typing
    debounceTimerRef.current = setTimeout(() => {
      firstUpdateRef.current = true;
    }, 500);
  }, []);

  // Handle row updates with debouncing
  const handleRowUpdate = useCallback(
    (rowId, updates) => {
      handleDebouncedUpdate((saveHistory) => {
        actions.updateRow(rowId, updates, saveHistory);
      });
    },
    [actions, handleDebouncedUpdate],
  );

  // Handle seat updates with debouncing
  const handleSeatUpdate = useCallback(
    (seatId, updates) => {
      handleDebouncedUpdate((saveHistory) => {
        actions.updateSeat(seatId, updates, saveHistory);
      });
    },
    [actions, handleDebouncedUpdate],
  );

  // Handle multiple seat updates with debouncing
  const handleSeatsUpdate = useCallback(
    (seatIds, updates) => {
      handleDebouncedUpdate((saveHistory) => {
        actions.updateSeats(seatIds, updates, saveHistory);
      });
    },
    [actions, handleDebouncedUpdate],
  );

  // Handle element updates with debouncing
  const handleElementUpdate = useCallback(
    (elementId, updates) => {
      handleDebouncedUpdate((saveHistory) => {
        actions.updateElement(elementId, updates, saveHistory);
      });
    },
    [actions, handleDebouncedUpdate],
  );

  // Handle table group updates
  const handleTableGroupUpdate = useCallback(
    (table, seats, config) => {
      actions.updateTableGroup(table, seats, config);
    },
    [actions],
  );

  // Handle converting image to standing section
  const handleConvertImageToStandingSection = (elementId) => {
    const element = scene.elements[elementId];
    if (!element || element.type !== ELEMENT_TYPES.IMAGE) return;

    // Calculate standing capacity based on element size
    const area = element.width * element.height;
    const standingCapacity = Math.max(
      10,
      Math.min(200, Math.floor(area / 400)),
    ); // Roughly 400 pixels per person

    // Create standing section element with optional background image
    const standingSectionElement = createElement(
      ELEMENT_TYPES.STANDING_SECTION,
      element.x,
      element.y,
      element.width,
      element.height,
      {
        standingCapacity: standingCapacity,
        sectionType: "general",
        fillColor: element.src ? "transparent" : "#e5e7eb", // Transparent if background image, otherwise default color
        strokeColor: "transparent", // No border for clean look
        strokeWidth: 0, // No border width
        opacity: 1.0, // Full opacity
        label: "Standing Section",
        entryPoints: [],
        exitPoints: [],
        // Preserve the original image as background if it exists
        ...(element.src && {
          backgroundImage: element.src,
          backgroundImageWidth: element.imageWidth,
          backgroundImageHeight: element.imageHeight,
        }),
      },
    );

    // Add the standing section element and remove the image element
    actions.addElement(standingSectionElement);
    actions.deleteItems([elementId]);
    actions.setSelection([standingSectionElement.id]);
    actions.setTool("select");
  };

  // Handle converting image to seating section
  const handleConvertImageToSeatingSection = (elementId) => {
    const element = scene.elements[elementId];
    if (!element || element.type !== ELEMENT_TYPES.IMAGE) return;

    // Get the first category ID or default
    const categoryId = scene.venue?.categories?.[0]?.id || "default";

    // Create seating section element with optional background image
    const seatingSectionElement = createElement(
      ELEMENT_TYPES.SEATING_SECTION,
      element.x,
      element.y,
      element.width,
      element.height,
      {
        sectionName: "",
        categoryId: categoryId,
        fillColor: element.src ? "transparent" : "#e5e7eb", // Transparent if background image, otherwise default color
        strokeColor: "#6b7280", // Visible border for seating sections
        strokeWidth: 2,
        opacity: 1.0, // Full opacity
        label: "",
        zoomThreshold: 0.5, // Show as solid until zoomed in
        showAsSolid: true,
        // Preserve the original image as background if it exists
        ...(element.src && {
          backgroundImage: element.src,
          backgroundImageWidth: element.imageWidth,
          backgroundImageHeight: element.imageHeight,
        }),
      },
    );

    // Add the seating section element and remove the image element
    actions.addElement(seatingSectionElement);
    actions.deleteItems([elementId]);
    actions.setSelection([seatingSectionElement.id]);
    actions.setTool("select");
  };

  // Handle converting rectangle to standing section
  const handleConvertRectangleToStandingSection = (elementId) => {
    const element = scene.elements[elementId];
    if (!element || element.type !== ELEMENT_TYPES.RECTANGLE) return;

    // Calculate standing capacity based on element size
    const area = element.width * element.height;
    const standingCapacity = Math.max(
      10,
      Math.min(200, Math.floor(area / 400)),
    ); // Roughly 400 pixels per person

    // Create standing section element
    const standingSectionElement = createElement(
      ELEMENT_TYPES.STANDING_SECTION,
      element.x,
      element.y,
      element.width,
      element.height,
      {
        standingCapacity: standingCapacity,
        sectionType: "general",
        fillColor: "#e5e7eb",
        strokeColor: "transparent", // No border for clean look
        strokeWidth: 0, // No border width
        opacity: 1.0, // Full opacity
        label: "Standing Section",
        entryPoints: [],
        exitPoints: [],
      },
    );

    // Add the standing section element and remove the rectangle element
    actions.addElement(standingSectionElement);
    actions.deleteItems([elementId]);
    actions.setSelection([standingSectionElement.id]);
    actions.setTool("select");
  };

  // Handle converting rectangle to seating section
  const handleConvertRectangleToSeatingSection = (elementId) => {
    const element = scene.elements[elementId];
    if (!element || element.type !== ELEMENT_TYPES.RECTANGLE) return;

    // Get the first category ID or default
    const categoryId = scene.venue?.categories?.[0]?.id || "default";

    // Create seating section element
    const seatingSectionElement = createElement(
      ELEMENT_TYPES.SEATING_SECTION,
      element.x,
      element.y,
      element.width,
      element.height,
      {
        sectionName: "",
        categoryId: categoryId,
        fillColor: element.fillColor || "#e5e7eb",
        strokeColor: element.strokeColor || "#6b7280",
        strokeWidth: element.strokeWidth || 2,
        opacity: 1.0,
        label: element.label || "",
        zoomThreshold: 0.5,
        showAsSolid: true,
        rotation: element.rotation || 0,
      },
    );

    // Add the seating section element and remove the rectangle element
    actions.addElement(seatingSectionElement);
    actions.deleteItems([elementId]);
    actions.setSelection([seatingSectionElement.id]);
    actions.setTool("select");
  };

  // Handle converting closed path to standing section
  const handleConvertPathToStandingSection = (elementId) => {
    const element = scene.elements[elementId];
    if (!element || element.type !== "path" || !element.isClosed) return;

    // Calculate bounding box of the path
    const points = element.points;
    if (!points || points.length < 3) return;

    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const width = maxX - minX;
    const height = maxY - minY;
    const centerX = minX + width / 2;
    const centerY = minY + height / 2;

    // Estimate area using shoelace formula for polygon area
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }
    area = Math.abs(area) / 2;

    // Calculate standing capacity based on estimated area
    const standingCapacity = Math.max(
      10,
      Math.min(500, Math.floor(area / 400)),
    ); // Roughly 400 pixels per person

    // Create standing section element with the path as its boundary
    const standingSectionElement = createElement(
      ELEMENT_TYPES.STANDING_SECTION,
      centerX,
      centerY,
      width,
      height,
      {
        standingCapacity: standingCapacity,
        sectionType: "general",
        fillColor: "#e5e7eb",
        strokeColor: element.strokeColor || "transparent",
        strokeWidth: element.strokeWidth || 2,
        opacity: 1.0,
        label: element.label || "Standing Section",
        entryPoints: [],
        exitPoints: [],
        // Store original path data for custom rendering if needed
        pathBoundary: {
          points: element.points,
          curveHandles: element.curveHandles,
        },
      },
    );

    // Add the standing section element and remove the path element
    actions.addElement(standingSectionElement);
    actions.deleteItems([elementId]);
    actions.setSelection([standingSectionElement.id]);
    actions.setTool("select");
  };

  // Handle converting closed path to seating section
  const handleConvertPathToSeatingSection = (elementId) => {
    const element = scene.elements[elementId];
    if (!element || element.type !== "path" || !element.isClosed) return;

    // Calculate bounding box of the path
    const points = element.points;
    if (!points || points.length < 3) return;

    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const width = maxX - minX;
    const height = maxY - minY;
    const centerX = minX + width / 2;
    const centerY = minY + height / 2;

    // Get the first category ID or default (same as image conversion)
    const categoryId = scene.venue?.categories?.[0]?.id || "default";

    // Create seating section element (same type as image conversion)
    const seatingSectionElement = createElement(
      ELEMENT_TYPES.SEATING_SECTION,
      centerX,
      centerY,
      width,
      height,
      {
        sectionName: "",
        categoryId: categoryId,
        fillColor: element.fillColor || "transparent", // Use path fill or transparent
        strokeColor: element.strokeColor || "#6b7280", // Visible border for seating sections
        strokeWidth: element.strokeWidth || 2,
        opacity: 1.0, // Full opacity
        label: element.label || "",
        zoomThreshold: 0.5, // Show as solid until zoomed in
        showAsSolid: true,
        rotation: element.rotation || 0,
        // Store original path data for custom rendering (same as standing section conversion)
        pathBoundary: {
          points: element.points,
          curveHandles: element.curveHandles,
        },
      },
    );

    // Add the seating section element and remove the path element
    actions.addElement(seatingSectionElement);
    actions.deleteItems([elementId]);
    actions.setSelection([seatingSectionElement.id]);
    actions.setTool("select");
  };

  // Handle converting path to image
  const handleConvertPathToImage = (elementId) => {
    const element = scene.elements[elementId];
    if (!element || element.type !== "path") return;

    // Create SVG content from the path element
    let pathData = `M ${element.points[0].x} ${element.points[0].y}`;

    if (element.curveHandles && Object.keys(element.curveHandles).length > 0) {
      // Handle curved paths with control points
      for (let i = 1; i < element.points.length; i++) {
        const segmentIndex = i - 1;
        const segmentHandles = element.curveHandles[segmentIndex];

        if (segmentHandles && segmentHandles.cp1 && segmentHandles.cp2) {
          pathData += ` C ${segmentHandles.cp1.x} ${segmentHandles.cp1.y} ${segmentHandles.cp2.x} ${segmentHandles.cp2.y} ${element.points[i].x} ${element.points[i].y}`;
        } else {
          pathData += ` L ${element.points[i].x} ${element.points[i].y}`;
        }
      }
    } else {
      // Handle straight line paths
      for (let i = 1; i < element.points.length; i++) {
        pathData += ` L ${element.points[i].x} ${element.points[i].y}`;
      }
    }

    // Calculate bounds for proper viewBox
    const bounds = element.points.reduce(
      (acc, point) => ({
        minX: Math.min(acc.minX, point.x),
        minY: Math.min(acc.minY, point.y),
        maxX: Math.max(acc.maxX, point.x),
        maxY: Math.max(acc.maxY, point.y),
      }),
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
    );

    const width = bounds.maxX - bounds.minX || 200;
    const height = bounds.maxY - bounds.minY || 200;
    const padding = 10;

    const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width + padding * 2}" height="${height + padding * 2}" viewBox="${
      bounds.minX - padding
    } ${bounds.minY - padding} ${width + padding * 2} ${
      height + padding * 2
    }" xmlns="http://www.w3.org/2000/svg">
  <path
    d="${pathData}"
    stroke="${element.strokeColor || "#333333"}"
    strokeWidth="${element.strokeWidth || 2}"
    fill="${element.fillColor || "transparent"}"
    opacity="${element.opacity || 1}"
  />
</svg>`;

    // Create data URL
    const svgDataUrl = `data:image/svg+xml;base64,${btoa(svgContent)}`;

    // Create image element
    const img = new Image();
    img.onload = () => {
      const imageElement = createElement(
        ELEMENT_TYPES.IMAGE,
        element.x,
        element.y,
        img.width,
        img.height,
        {
          src: svgDataUrl,
          imageWidth: img.width,
          imageHeight: img.height,
          opacity: element.opacity || 1,
        },
      );

      // Add the image element and remove the path element
      actions.addImage(imageElement);
      actions.deleteItems([elementId]);
      actions.setSelection([imageElement.id]);
      actions.setTool("select");
    };
    img.src = svgDataUrl;
  };

  // Delete selected items
  // const handleDelete = () => {
  //   if (selectedIds.length > 0) {
  //     actions.deleteItems(selectedIds);
  //   }
  // };

  // Handle creating new section
  const handleCreateSection = () => {
    const defaultCategoryId = scene.venue.categories[0]?.id || "default";
    const newSection = createSection("New Section", defaultCategoryId);
    // For now, we'll add it to the scene directly
    // In a more complete implementation, we'd add an ADD_SECTION action
    const updatedScene = {
      ...scene,
      sections: {
        ...scene.sections,
        [newSection.id]: newSection,
      },
      venue: {
        ...scene.venue,
        sections: [...scene.venue.sections, newSection.id],
      },
    };
    // Use loadScene to update the entire scene
    actions.loadScene(updatedScene);
  };

  // Handle creating standing section from API data
  const handleCreateStandingSection = (apiStandingSection) => {
    const standingSectionElement =
      createStandingSectionFromAPI(apiStandingSection);
    actions.addElement(standingSectionElement);
    actions.setSelection([standingSectionElement.id]);
    actions.setTool("select");
  };

  // Handle tool settings updates
  const handleToolSettingsUpdate = (toolType, settings) => {
    actions.updateToolSettings(toolType, settings);
  };

  // Handle saving seat layout
  // const handleSaveSeatLayout = async () => {
  //   try {
  //     setIsSaving(true);

  //     // Group seats by row to calculate proper row and column numbers
  //     const seatsByRow = {};
  //     Object.values(scene.seats).forEach((seat) => {
  //       if (!seatsByRow[seat.rowId]) {
  //         seatsByRow[seat.rowId] = [];
  //       }
  //       seatsByRow[seat.rowId].push(seat);
  //     });

  //     // Sort seats within each row by their position to determine column order
  //     Object.keys(seatsByRow).forEach((rowId) => {
  //       const row = scene.rows[rowId];
  //       if (!row) return;

  //       // Sort seats by their position along the row
  //       seatsByRow[rowId].sort((a, b) => {
  //         if (row.geometry.kind === "line") {
  //           // For line geometry, sort by x position
  //           return a.localX - b.localX;
  //         } else if (row.geometry.kind === "arc") {
  //           // For arc geometry, sort by angle from center
  //           const center = row.geometry.center;
  //           const angleA = Math.atan2(a.localY - center.y, a.localX - center.x);
  //           const angleB = Math.atan2(b.localY - center.y, b.localX - center.x);
  //           return angleA - angleB;
  //         }
  //         return 0;
  //       });
  //     });

  //     // Extract seat data with proper row and column numbers
  //     const seatLayoutData = [];
  //     const rowIds = Object.keys(seatsByRow).sort(); // Sort rows for consistent ordering

  //     // Calculate total rows and columns
  //     const totalRows = rowIds.length;
  //     const totalColumns = Math.max(
  //       ...Object.values(seatsByRow).map((seats) => seats.length),
  //     );

  //     // Process standing sections (open seating areas) - generate individual seats
  //     Object.values(scene.elements).forEach((element) => {
  //       if (element.type === ELEMENT_TYPES.STANDING_SECTION) {
  //         const standingCapacity = element.standingCapacity || 100;
  //         const sectionWidth = element.width || 150;
  //         const sectionHeight = element.height || 100;

  //         // Calculate grid dimensions for distributing seats
  //         const seatsPerRow = Math.ceil(Math.sqrt(standingCapacity));
  //         const seatsPerCol = Math.ceil(standingCapacity / seatsPerRow);
  //         const seatSpacingX = sectionWidth / Math.max(seatsPerRow - 1, 1);
  //         const seatSpacingY = sectionHeight / Math.max(seatsPerCol - 1, 1);

  //         console.log(
  //           `Generating ${standingCapacity} individual seats for standing section: ${
  //             element.label || "Standing Section"
  //           }`,
  //         );

  //         // Generate individual seats for the standing section
  //         for (let i = 0; i < standingCapacity; i++) {
  //           const rowInGrid = Math.floor(i / seatsPerRow);
  //           const colInGrid = i % seatsPerRow;

  //           // Calculate position within the standing section
  //           const localX = colInGrid * seatSpacingX;
  //           const localY = rowInGrid * seatSpacingY;

  //           // Convert local position to world position
  //           const worldX = element.x + localX - sectionWidth / 2;
  //           const worldY = element.y + localY - sectionHeight / 2;

  //           // Get the sst_id for this standing section
  //           const standingSectionSstId =
  //             element.apiData?.sst_id ||
  //             standingSections.find(
  //               (section) => section.sst_seat_type === element.label,
  //             )?.sst_id ||
  //             standingSections[0]?.sst_id ||
  //             "";

  //           const standingSeatData = {
  //             sl_row_num: rowInGrid + 1, // 1-based row number within the standing section
  //             sl_seat_name: `${element.label || "Standing"}-${i + 1}`,
  //             sl_col_num: colInGrid + 1, // 1-based column number within the standing section
  //             screen_seat_type_id: standingSectionSstId, // Map to sst_id for standing areas
  //             sl_seat_status: "0", // Available
  //             sl_group_id: null,
  //             seat_reserve_type_id: 1, // Default reserve type
  //             is_open_seating_area: "Y",
  //             sl_meta_data: {
  //               id: `${element.id}_seat_${i + 1}`,
  //               Xposition: worldX,
  //               Yposition: worldY,
  //               rotation: 0, // Default rotation
  //               standingSectionId: element.id, // Reference to parent standing section
  //             },
  //           };

  //           seatLayoutData.push(standingSeatData);
  //         }

  //         console.log(
  //           `Added ${standingCapacity} individual standing seats for section: ${
  //             element.label || "Standing Section"
  //           }`,
  //         );
  //       }
  //     });

  //     rowIds.forEach((rowId, rowIndex) => {
  //       const rowSeats = seatsByRow[rowId];
  //       const row = scene.rows[rowId];
  //       if (!row) return;

  //       rowSeats.forEach((seat, seatIndex) => {
  //         seatLayoutData.push({
  //           sl_row_num: rowIndex + 1, // 1-based row number
  //           sl_seat_name: seat.label || `R${rowIndex + 1}C${seatIndex + 1}`,
  //           sl_col_num: seatIndex + 1, // 1-based column number
  //           screen_seat_type_id:
  //             parseInt(seat.categoryId) || categories[0]?.id || 113, // Use seat's category ID or first available category
  //           sl_seat_status: "0", // Available
  //           sl_group_id: null,
  //           seat_reserve_type_id: 1, // Default reserve type
  //           sl_meta_data: {
  //             id: seat.id, // Individual seat ID (e.g., "x67xjudfi")
  //             Xposition: seat.localX,
  //             Yposition: seat.localY,
  //             rotation: 0, // Default rotation
  //           },
  //         });
  //       });
  //     });

  //     if (seatLayoutData.length === 0) {
  //       alert("No seats or standing areas found to save");
  //       return;
  //     }

  //     // Validate screenId before API call
  //     if (!screenId) {
  //       console.error("screenId is undefined or null");
  //       alert("Error: screenId is missing. Please check the URL.");
  //       return;
  //     }

  //     console.log("About to call updateScreenLayout with screenId:", screenId);
  //     // console.log("Complete seat layout data:", seatLayoutData);

  //     // Submit to API
  //     const result = await ApiService.updateScreenLayout(
  //       seatLayoutData,
  //       totalRows,
  //       totalColumns,
  //       screenId.toString(),
  //       scene,
  //     );
  //     console.log("Seat layout saved successfully:", result);

  //     // Calculate total capacity including standing areas
  //     const standingSeats = seatLayoutData.filter(
  //       (seat) => seat.is_open_seating_area === "Y",
  //     );
  //     const regularSeats = seatLayoutData.filter(
  //       (seat) => seat.is_open_seating_area !== "Y",
  //     );

  //     const message =
  //       standingSeats.length > 0
  //         ? `Successfully saved ${regularSeats.length} regular seats and ${
  //             standingSeats.length
  //           } standing seats (${Math.round(
  //             standingSeats.length /
  //               (Object.values(scene.elements).filter(
  //                 (el) => el.type === ELEMENT_TYPES.STANDING_SECTION,
  //               ).length || 1),
  //           )} average capacity per standing section)`
  //         : `Successfully saved ${seatLayoutData.length} seats`;

  //     alert(message);
  //   } catch (error) {
  //     console.error("Error saving seat layout:", error);
  //     alert("Failed to save seat layout. Please try again.");
  //   } finally {
  //     setIsSaving(false);
  //   }
  // };

  // Show floating open button when panel is closed
  if (!isVisible) {
    return (
      <button
        onClick={onOpen}
        className="
          fixed right-4 top-20 z-50
          inline-flex items-center justify-center gap-2
          h-10 px-3
          bg-neutral-900/90 text-neutral-300
          border border-neutral-700
          rounded-lg
          shadow-lg backdrop-blur-sm
          transition-all duration-200
          hover:bg-neutral-800 hover:text-neutral-100 hover:border-neutral-600
          focus:outline-none focus:ring-2 focus:ring-neutral-600 focus:ring-offset-2 focus:ring-offset-neutral-950
        "
        title="Open Properties Panel"
      >
        <PanelRightOpen size={18} />
        <span className="text-sm font-medium">Properties</span>
      </button>
    );
  }

  return (
    <div
      data-properties-panel
      className="select-none fixed right-0 top-16 m-5 rounded-lg bottom-0 z-40 w-80 border border-[#E9EAEB] bg-[#FAFAFA]  flex flex-col shadow-2xl"
    >
      <div className="px-4 py-2 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">Properties</h2>
        <button
          onClick={onClose}
          className="
            inline-flex items-center justify-center
            h-8 w-8
            text-gray-500
            rounded-md
            transition-all duration-200
            hover:bg-gray-200 hover:text-gray-700
            focus:outline-none focus:ring-2 focus:ring-gray-400
          "
          title="Close Properties Panel"
        >
          <PanelRightClose size={18} />
        </button>
      </div>

      {/* {selectedSeats.length === 0 && (
        <LazyPropertySection>
          <ActionsPanel
            isSaving={isSaving}
            scene={scene}
            selectedIds={selectedIds}
            onSaveSeatLayout={handleSaveSeatLayout}
            onDeleteItems={handleDelete}
          />
        </LazyPropertySection>
      )} */}

      <div className="flex-1 overflow-y-auto overscroll-contain mb-20 ">
        {!hasSelection ? (
          <>
            {/* Show tool-specific properties when a tool is selected */}
            <LazyPropertySection>
              <ToolProperties
                currentTool={currentTool}
                toolSettings={toolSettings}
                categories={categories}
                onToolSettingsUpdate={handleToolSettingsUpdate}
                globalSettings={state.globalSettings}
                onUpdateGlobalSettings={actions.updateGlobalSettings}
                actions={actions}
              />
            </LazyPropertySection>

            {/* Show auto-assign button when table tool is selected */}
            {currentTool === "element-table" && (
              <LazyPropertySection>
                <div className="px-3">
                  <button
                    onClick={() => actions.assignTableLabels()}
                    className="w-full py-2 px-3 bg-green-500 text-white text-sm rounded-md hover:bg-green-600 transition-colors"
                    title="Auto-assign names to all tables and seats based on their grid positions"
                  >
                    Auto-assign names
                  </button>
                </div>
              </LazyPropertySection>
            )}
            {currentTool === "select" ||
            currentTool === "pan" ||
            !currentTool ? (
              <LazyPropertySection>
                <SeatSettings
                  globalSettings={state.globalSettings}
                  onUpdateGlobalSettings={actions.updateGlobalSettings}
                  categories={/** @type {any} */ (categories)}
                />
              </LazyPropertySection>
            ) : null}
          </>
        ) : (
          <>
            {/* {selectedSeats.length === 0 && (
              <LazyPropertySection>
                <SceneProperties
                  scene={scene}
                  onUpdateView={actions.updateView}
                />
              </LazyPropertySection>
            )} */}

            {/* Show TableProperties when a table and its seats are selected together */}
            {tableAndSeatsGroup ? (
              <LazyPropertySection>
                <TableProperties
                  table={tableAndSeatsGroup.table}
                  seats={tableAndSeatsGroup.seats}
                  categories={categories}
                  onTableUpdate={handleElementUpdate}
                  onSeatsUpdate={handleSeatsUpdate}
                  onUpdateTableGroup={handleTableGroupUpdate}
                />
              </LazyPropertySection>
            ) : (
              <>
                <LazyPropertySection>
                  <RowProperties
                    selectedRows={selectedRows}
                    multipleSelected={multipleSelected}
                    inferredRowFromSelectedSeats={inferredRowFromSelectedSeats}
                    scene={scene}
                    categories={categories}
                    onRowUpdate={handleRowUpdate}
                    onAdjustSeatSpacing={actions.adjustSeatSpacing}
                  />
                </LazyPropertySection>

                {/* Show SeatProperties only when seats are selected and not using element creation tools */}
                {selectedSeats.length > 0 &&
                  currentTool !== "element-circle" &&
                  currentTool !== "element-rectangle" &&
                  currentTool !== "element-text" &&
                  currentTool !== "element-path" && (
                    <LazyPropertySection>
                      <SeatProperties
                        selectedSeats={selectedSeats}
                        multipleSelected={multipleSelected}
                        categories={categories}
                        onSeatUpdate={handleSeatUpdate}
                        onSeatsUpdate={handleSeatsUpdate}
                        onAdjustSeatSpacing={actions.adjustSeatSpacing}
                        onRotateSelectedSeats={actions.rotateSelectedSeats}
                        scene={scene}
                        onRowUpdate={handleRowUpdate}
                      />
                    </LazyPropertySection>
                  )}

                {selectedSeats.length === 0 && (
                  <LazyPropertySection>
                    <ElementProperties
                      selectedElements={selectedElements}
                      multipleSelected={multipleSelected}
                      onElementUpdate={handleElementUpdate}
                      onLockImage={actions.lockImage}
                      onUnlockImage={actions.unlockImage}
                      onConvertPathToImage={handleConvertPathToImage}
                      onConvertImageToStandingSection={
                        handleConvertImageToStandingSection
                      }
                      onConvertImageToSeatingSection={
                        handleConvertImageToSeatingSection
                      }
                      onConvertRectangleToStandingSection={
                        handleConvertRectangleToStandingSection
                      }
                      onConvertRectangleToSeatingSection={
                        handleConvertRectangleToSeatingSection
                      }
                      onConvertPathToStandingSection={
                        handleConvertPathToStandingSection
                      }
                      onConvertPathToSeatingSection={
                        handleConvertPathToSeatingSection
                      }
                    />
                  </LazyPropertySection>
                )}
              </>
            )}

            {/* {selectedSeats.length === 0 && (
              <LazyPropertySection>
                <SectionsPanel
                  scene={scene}
                  onCreateSection={handleCreateSection}
                  standingSections={standingSections}
                  onCreateStandingSection={handleCreateStandingSection}
                />
              </LazyPropertySection>
            )} */}

            {/* <LazyPropertySection>
              <CategoriesPanel categories={categories} />
            </LazyPropertySection> */}
          </>
        )}
      </div>
    </div>
  );
}
