import { ACTIONS } from "./actions.js";
import {
  generateId,
  createSection,
  migrateArcGeometry,
  assignTableLabelsToGrid,
} from "./types.js";
import {
  generateSeatsForRow,
  findAngleForArcLength,
  calculateEllipticalArcLength,
} from "./geometry.js";
import { generateSeatLabel } from "./seatNaming.js";

// Helper function to update both scene and history.present
function updateScene(state, newScene) {
  return {
    ...state,
    scene: newScene,
    history: {
      ...state.history,
      present: newScene,
    },
  };
}

export function editorReducer(state, action) {
  switch (action.type) {
    case ACTIONS.SET_TOOL:
      return { ...state, currentTool: action.payload, selectedIds: [] };

    case ACTIONS.SET_SELECTION:
      return { ...state, selectedIds: action.payload };

    case ACTIONS.ADD_TO_SELECTION:
      if (state.selectedIds.includes(action.payload)) {
        return state;
      }
      return { ...state, selectedIds: [...state.selectedIds, action.payload] };

    case ACTIONS.CLEAR_SELECTION:
      return { ...state, selectedIds: [] };

    case ACTIONS.UPDATE_VIEW:
      return {
        ...state,
        scene: {
          ...state.scene,
          view: { ...state.scene.view, ...action.payload },
        },
      };

    case ACTIONS.ADD_ROW: {
      const row = action.payload;

      // Validate that the section exists
      if (!state.scene.sections[row.sectionId]) {
        console.error(
          `Cannot add row: Section ${row.sectionId} does not exist`,
        );
        return state;
      }

      // Calculate the row index (position in all rows) for naming
      const existingRowIds = Object.keys(state.scene.rows);
      const rowIndex = existingRowIds.length; // 0-based index

      // Generate seats for the row using global settings and row index for naming
      const newSeats = generateSeatsForRow(
        row,
        state.globalSettings,
        [],
        rowIndex,
      );
      const seatsById = newSeats.reduce((acc, seat) => {
        acc[seat.id] = seat;
        return acc;
      }, {});

      const newScene = {
        ...state.scene,
        rows: {
          ...state.scene.rows,
          [row.id]: row,
        },
        seats: {
          ...state.scene.seats,
          ...seatsById,
        },
        sections: {
          ...state.scene.sections,
          [row.sectionId]: {
            ...state.scene.sections[row.sectionId],
            rows: [
              ...(state.scene.sections[row.sectionId]?.rows || []),
              row.id,
            ],
          },
        },
      };

      return updateScene(state, newScene);
    }

    case ACTIONS.ADD_SEAT: {
      const seat = action.payload;
      const newScene = {
        ...state.scene,
        seats: {
          ...state.scene.seats,
          [seat.id]: seat,
        },
      };
      return updateScene(state, newScene);
    }

    case ACTIONS.UPDATE_ROW: {
      const { id, updates } = action.payload;
      const prevRow = state.scene.rows[id];
      const updatedRow = { ...prevRow, ...updates };

      let newSeats = { ...state.scene.seats };

      const onlySeatCountChanged =
        Object.prototype.hasOwnProperty.call(updates, "seatCount") &&
        !updates.geometry &&
        !Object.prototype.hasOwnProperty.call(updates, "spacing") &&
        !Object.prototype.hasOwnProperty.call(updates, "curve");

      if (
        updates.geometry ||
        updates.seatCount ||
        updates.spacing ||
        updates.curve
      ) {
        if (onlySeatCountChanged) {
          const existingSeats = Object.values(state.scene.seats)
            .filter((s) => s.rowId === id)
            .slice();

          if (existingSeats.length >= 1) {
            const row = prevRow;
            let sorted = existingSeats.slice();
            if (row.geometry.kind === "line") {
              sorted.sort((a, b) =>
                a.localX === b.localX
                  ? a.localY - b.localY
                  : a.localX - b.localX,
              );
            } else if (row.geometry.kind === "arc") {
              const c = row.geometry.center;
              sorted.sort(
                (a, b) =>
                  Math.atan2(a.localY - c.y, a.localX - c.x) -
                  Math.atan2(b.localY - c.y, b.localX - c.x),
              );
            }

            const first = sorted[0];
            let spacingDistance = updatedRow.spacing || prevRow.spacing || 40;

            if (sorted.length >= 2) {
              if (row.geometry.kind === "line") {
                const last = sorted[sorted.length - 1];
                const dx = last.localX - first.localX;
                const dy = last.localY - first.localY;
                const total = Math.hypot(dx, dy);
                const gaps = sorted.length - 1;
                if (gaps > 0) spacingDistance = total / gaps;
              } else if (row.geometry.kind === "arc") {
                const c = row.geometry.center;
                const a0 = Math.atan2(first.localY - c.y, first.localX - c.x);
                const last = sorted[sorted.length - 1];
                const a1 = Math.atan2(last.localY - c.y, last.localX - c.x);
                const totalArc = calculateEllipticalArcLength(
                  row.geometry.radiusX,
                  row.geometry.radiusY,
                  row.geometry.startAngle,
                  row.geometry.endAngle,
                );
                const gaps = sorted.length - 1;
                if (gaps > 0) spacingDistance = totalArc / gaps;
              }
            }

            const desiredCount = Math.max(1, updatedRow.seatCount || 1);

            // Preserve selected seat indexes within this row
            const prevSelectedIndexes = state.selectedIds
              .map((sid) => sorted.findIndex((s) => s.id === sid))
              .filter((idx) => idx >= 0);

            // Remove old seats for this row
            Object.keys(newSeats).forEach((seatId) => {
              if (newSeats[seatId].rowId === id) delete newSeats[seatId];
            });

            // Recreate seats preserving start and spacing
            const created = [];
            if (row.geometry.kind === "line") {
              const p1 = { x: first.localX, y: first.localY };
              const last = sorted[sorted.length - 1];
              const dirX =
                last.localX - first.localX ||
                row.geometry.p2.x - row.geometry.p1.x;
              const dirY =
                last.localY - first.localY ||
                row.geometry.p2.y - row.geometry.p1.y;
              const len = Math.hypot(dirX, dirY) || 1;
              const ux = dirX / len;
              const uy = dirY / len;
              for (let i = 0; i < desiredCount; i++) {
                let localX = p1.x + ux * spacingDistance * i;
                let localY = p1.y + uy * spacingDistance * i;

                // Apply curve effect if present
                if (Math.abs(updatedRow.curve || 0) > 0.001) {
                  // Calculate position relative to center (0 = center, -1/1 = ends)
                  const t = i / (desiredCount - 1);
                  const centerOffset = t - 0.5; // -0.5 to 0.5, where 0 is center

                  // Create a smooth curve effect (parabolic)
                  const curveEffect = -Math.pow(centerOffset * 2, 2) + 1; // 1 at center, 0 at ends
                  const curveOffset =
                    (updatedRow.curve || 0) * curveEffect * 20;

                  // Apply the curve offset perpendicular to the row direction
                  localX += -uy * curveOffset; // Perpendicular to (ux, uy)
                  localY += ux * curveOffset;
                }

                created.push({
                  ...sorted[0],
                  id: generateId(),
                  rowId: id,
                  localX,
                  localY,
                  label: String(i + 1),
                });
              }
            } else if (row.geometry.kind === "arc") {
              const c = row.geometry.center;
              const { radiusX, radiusY, startAngle, endAngle } = row.geometry;
              const a0 = Math.atan2(first.localY - c.y, first.localX - c.x);

              for (let i = 0; i < desiredCount; i++) {
                const targetLength = i * spacingDistance;
                const angle = findAngleForArcLength(
                  radiusX,
                  radiusY,
                  startAngle,
                  endAngle,
                  targetLength,
                );

                let localX = c.x + radiusX * Math.cos(angle);
                let localY = c.y + radiusY * Math.sin(angle);

                // Apply curve effect if present
                if (Math.abs(updatedRow.curve || 0) > 0.001) {
                  // Calculate position relative to center (0 = center, -1/1 = ends)
                  const t = i / (desiredCount - 1);
                  const centerOffset = t - 0.5; // -0.5 to 0.5, where 0 is center

                  // Create a smooth curve effect (parabolic)
                  const curveEffect = -Math.pow(centerOffset * 2, 2) + 1; // 1 at center, 0 at ends
                  const curveOffset =
                    (updatedRow.curve || 0) * curveEffect * 20;

                  // For arc geometry, the normal direction is radial from center
                  const normalX = Math.cos(angle);
                  const normalY = Math.sin(angle);

                  localX += normalX * curveOffset;
                  localY += normalY * curveOffset;
                }

                created.push({
                  ...sorted[0],
                  id: generateId(),
                  rowId: id,
                  localX,
                  localY,
                  label: String(i + 1),
                });
              }
            }

            created.forEach((s) => {
              newSeats[s.id] = s;
            });

            updatedRow.spacing = spacingDistance;

            // Reselect seats by index where possible
            if (prevSelectedIndexes.length > 0) {
              const newSelection = [];
              prevSelectedIndexes.forEach((idx) => {
                const clamped = Math.max(0, Math.min(created.length - 1, idx));
                if (created[clamped]) newSelection.push(created[clamped].id);
              });
              return {
                ...state,
                scene: {
                  ...state.scene,
                  rows: { ...state.scene.rows, [id]: updatedRow },
                  seats: newSeats,
                },
                selectedIds: newSelection,
              };
            }
          }
        }

        // Default: regenerate using geometry helper
        Object.keys(newSeats).forEach((seatId) => {
          if (newSeats[seatId].rowId === id) delete newSeats[seatId];
        });

        // Get existing seats for this row to preserve dimensions
        const existingRowSeats = Object.values(state.scene.seats)
          .filter((seat) => seat.rowId === id)
          .sort((a, b) => {
            if (updatedRow.geometry.kind === "line") {
              return a.localX === b.localX
                ? a.localY - b.localY
                : a.localX - b.localX;
            } else if (updatedRow.geometry.kind === "arc") {
              const c = updatedRow.geometry.center;
              return (
                Math.atan2(a.localY - c.y, a.localX - c.x) -
                Math.atan2(b.localY - c.y, b.localX - c.x)
              );
            }
            return 0;
          });

        // Calculate the row index (position in all rows) for naming
        const allRowIds = Object.keys(state.scene.rows);
        const rowIndex = allRowIds.indexOf(id);

        const rowSeats = generateSeatsForRow(
          updatedRow,
          state.globalSettings,
          existingRowSeats,
          rowIndex >= 0 ? rowIndex : null,
        );
        rowSeats.forEach((seat) => {
          newSeats[seat.id] = seat;
        });

        // Preserve seat selection when seats are regenerated
        const prevSelectedIndexes = [];
        const existingSeats = Object.values(state.scene.seats)
          .filter((s) => s.rowId === id)
          .sort((a, b) => {
            if (updatedRow.geometry.kind === "line") {
              return a.localX === b.localX
                ? a.localY - b.localY
                : a.localX - b.localX;
            } else if (updatedRow.geometry.kind === "arc") {
              const c = updatedRow.geometry.center;
              return (
                Math.atan2(a.localY - c.y, a.localX - c.x) -
                Math.atan2(b.localY - c.y, b.localX - c.x)
              );
            }
            return 0;
          });

        state.selectedIds.forEach((selectedId) => {
          const seat = Object.values(state.scene.seats).find(
            (s) => s.id === selectedId && s.rowId === id,
          );
          if (seat) {
            const index = existingSeats.findIndex((s) => s.id === selectedId);
            if (index >= 0) prevSelectedIndexes.push(index);
          }
        });

        // Reselect seats by index where possible
        if (prevSelectedIndexes.length > 0) {
          const newSelection = [];
          prevSelectedIndexes.forEach((idx) => {
            const clamped = Math.max(0, Math.min(rowSeats.length - 1, idx));
            if (rowSeats[clamped]) newSelection.push(rowSeats[clamped].id);
          });

          return {
            ...state,
            scene: {
              ...state.scene,
              rows: {
                ...state.scene.rows,
                [id]: updatedRow,
              },
              seats: newSeats,
            },
            selectedIds: newSelection,
          };
        }
      }

      return {
        ...state,
        scene: {
          ...state.scene,
          rows: {
            ...state.scene.rows,
            [id]: updatedRow,
          },
          seats: newSeats,
        },
      };
    }

    case ACTIONS.UPDATE_SEAT: {
      const { seatId, updates } = action.payload;
      const newSeats = { ...state.scene.seats };

      if (newSeats[seatId]) {
        newSeats[seatId] = {
          ...newSeats[seatId],
          ...updates,
        };
      }

      const newScene = {
        ...state.scene,
        seats: newSeats,
      };
      return updateScene(state, newScene);
    }

    case ACTIONS.UPDATE_SEATS: {
      const { seatIds, updates } = action.payload;
      const newSeats = { ...state.scene.seats };

      seatIds.forEach((seatId) => {
        if (newSeats[seatId]) {
          newSeats[seatId] = {
            ...newSeats[seatId],
            ...updates,
          };
        }
      });

      const newScene = {
        ...state.scene,
        seats: newSeats,
      };
      return updateScene(state, newScene);
    }

    case ACTIONS.MOVE_SEATS: {
      const { seatIds, deltaX, deltaY } = action.payload;
      const newSeats = { ...state.scene.seats };
      const newRows = { ...state.scene.rows };

      // Update seat positions
      seatIds.forEach((seatId) => {
        if (newSeats[seatId]) {
          newSeats[seatId] = {
            ...newSeats[seatId],
            localX: newSeats[seatId].localX + deltaX,
            localY: newSeats[seatId].localY + deltaY,
          };
        }
      });

      // Check if entire rows were moved and update row geometry accordingly
      const movedRows = new Set();
      const rowSeatCounts = {};

      // Count seats per row for moved seats
      seatIds.forEach((seatId) => {
        const seat = newSeats[seatId];
        if (seat) {
          const rowId = seat.rowId;
          rowSeatCounts[rowId] = (rowSeatCounts[rowId] || 0) + 1;
        }
      });

      // For each row, check if all seats were moved
      Object.keys(rowSeatCounts).forEach((rowId) => {
        const allSeatsInRow = Object.values(newSeats).filter(
          (seat) => seat.rowId === rowId,
        );
        const movedSeatsInRow = rowSeatCounts[rowId];

        // If all seats in the row were moved, move the row geometry too
        if (movedSeatsInRow === allSeatsInRow.length && newRows[rowId]) {
          const row = newRows[rowId];
          const updatedGeometry = { ...row.geometry };

          if (updatedGeometry.kind === "line") {
            updatedGeometry.p1 = {
              x: updatedGeometry.p1.x + deltaX,
              y: updatedGeometry.p1.y + deltaY,
            };
            updatedGeometry.p2 = {
              x: updatedGeometry.p2.x + deltaX,
              y: updatedGeometry.p2.y + deltaY,
            };
          } else if (updatedGeometry.kind === "arc") {
            updatedGeometry.center = {
              x: updatedGeometry.center.x + deltaX,
              y: updatedGeometry.center.y + deltaY,
            };
          }

          newRows[rowId] = {
            ...row,
            geometry: updatedGeometry,
          };
          movedRows.add(rowId);
        }
      });

      const newScene = {
        ...state.scene,
        seats: newSeats,
        rows: newRows,
      };
      return updateScene(state, newScene);
    }

    case ACTIONS.ADJUST_SEAT_SPACING: {
      const { seatIds, spacingDelta } = action.payload;
      const newSeats = { ...state.scene.seats };
      const newRows = { ...state.scene.rows };

      // Only adjust spacing for seats that are in the same row
      const seatsByRow = {};
      seatIds.forEach((seatId) => {
        const seat = newSeats[seatId];
        if (seat) {
          if (!seatsByRow[seat.rowId]) {
            seatsByRow[seat.rowId] = [];
          }
          seatsByRow[seat.rowId].push(seat);
        }
      });

      // Process each row separately
      Object.keys(seatsByRow).forEach((rowId) => {
        const rowSeats = seatsByRow[rowId];
        if (rowSeats.length < 2) return; // Need at least 2 seats to adjust spacing

        // Sort seats by position along the row
        const row = state.scene.rows[rowId];
        if (!row) return;

        // For line geometry, sort by x position (assuming horizontal row)
        // For arc geometry, sort by angle
        rowSeats.sort((a, b) => {
          if (row.geometry.kind === "line") {
            return a.localX - b.localX;
          } else if (row.geometry.kind === "arc") {
            // Calculate angle for each seat relative to arc center
            const center = row.geometry.center;
            const angleA = Math.atan2(a.localY - center.y, a.localX - center.x);
            const angleB = Math.atan2(b.localY - center.y, b.localX - center.x);
            return angleA - angleB;
          }
          return 0;
        });

        // Calculate the total length and redistribute seats evenly
        if (rowSeats.length >= 2) {
          // Calculate the direction and length of the row segment
          const firstSeat = rowSeats[0];
          const lastSeat = rowSeats[rowSeats.length - 1];

          // For line geometry, use x-coordinates
          // For arc geometry, use angular position
          let totalLength = 0;
          let segmentDirection = { x: 0, y: 0 };

          if (row.geometry.kind === "line") {
            const dx = lastSeat.localX - firstSeat.localX;
            const dy = lastSeat.localY - firstSeat.localY;
            totalLength = Math.sqrt(dx * dx + dy * dy);
            segmentDirection = { x: dx, y: dy };
          } else if (row.geometry.kind === "arc") {
            const center = row.geometry.center;
            const angle1 = Math.atan2(
              firstSeat.localY - center.y,
              firstSeat.localX - center.x,
            );
            const angle2 = Math.atan2(
              lastSeat.localY - center.y,
              lastSeat.localX - center.x,
            );

            // Calculate the actual arc length between the first and last seat
            // This is the most direct and accurate approach
            totalLength = calculateEllipticalArcLength(
              row.geometry.radiusX,
              row.geometry.radiusY,
              Math.min(angle1, angle2), // Start from the smaller angle
              Math.max(angle1, angle2), // End at the larger angle
            );

            segmentDirection = {
              x: lastSeat.localX - firstSeat.localX,
              y: lastSeat.localY - firstSeat.localY,
            };
          }

          // Calculate new spacing - ensure minimum spacing
          const numGaps = rowSeats.length - 1;
          const currentSpacing = totalLength / numGaps;
          const newSpacing = Math.max(10, currentSpacing + spacingDelta);
          const newTotalLength = newSpacing * numGaps;

          // Calculate scale factor to maintain overall span
          const scaleFactor = newTotalLength / totalLength;

          // Keep first seat in place, redistribute others
          for (let i = 1; i < rowSeats.length; i++) {
            const seat = rowSeats[i];
            const t = i / (rowSeats.length - 1); // Position along segment (0 to 1)

            if (row.geometry.kind === "line") {
              // Linear interpolation along the line
              const baseX =
                firstSeat.localX + segmentDirection.x * t * scaleFactor;
              const baseY =
                firstSeat.localY + segmentDirection.y * t * scaleFactor;

              // Apply curve effect to the new position
              if (Math.abs(row.curve || 0) > 0.001) {
                const centerOffset = t - 0.5; // -0.5 to 0.5, where 0 is center
                const curveEffect = -Math.pow(centerOffset * 2, 2) + 1; // 1 at center, 0 at ends
                const curveOffset = (row.curve || 0) * curveEffect * 20;

                // Apply the curve offset perpendicular to the row direction
                const length = Math.sqrt(
                  segmentDirection.x * segmentDirection.x +
                    segmentDirection.y * segmentDirection.y,
                );
                if (length > 0) {
                  const normalX = -segmentDirection.y / length;
                  const normalY = segmentDirection.x / length;

                  newSeats[seat.id] = {
                    ...seat,
                    localX: baseX + normalX * curveOffset,
                    localY: baseY + normalY * curveOffset,
                  };
                } else {
                  newSeats[seat.id] = {
                    ...seat,
                    localX: baseX,
                    localY: baseY,
                  };
                }
              } else {
                newSeats[seat.id] = {
                  ...seat,
                  localX: baseX,
                  localY: baseY,
                };
              }
            } else if (row.geometry.kind === "arc") {
              // For arc geometry, calculate position along the arc and apply curve
              const center = row.geometry.center;
              const { radiusX, radiusY } = row.geometry;

              // Use the actual angle positions of first and last seats as reference
              const firstSeatAngle = Math.atan2(
                firstSeat.localY - center.y,
                firstSeat.localX - center.x,
              );
              const lastSeatAngle = Math.atan2(
                lastSeat.localY - center.y,
                lastSeat.localX - center.x,
              );

              // Calculate the target angle based on the actual seat positions
              const targetAngle =
                firstSeatAngle + t * (lastSeatAngle - firstSeatAngle);

              let localX = center.x + radiusX * Math.cos(targetAngle);
              let localY = center.y + radiusY * Math.sin(targetAngle);

              // Apply curve effect for arc geometry
              if (Math.abs(row.curve || 0) > 0.001) {
                const centerOffset = t - 0.5; // -0.5 to 0.5, where 0 is center
                const curveEffect = -Math.pow(centerOffset * 2, 2) + 1; // 1 at center, 0 at ends
                const curveOffset = (row.curve || 0) * curveEffect * 20;

                // For arc geometry, the normal direction is radial from center
                const radialAngle = targetAngle;
                const normalX = Math.cos(radialAngle);
                const normalY = Math.sin(radialAngle);

                localX += normalX * curveOffset;
                localY += normalY * curveOffset;
              }

              newSeats[seat.id] = {
                ...seat,
                localX,
                localY,
              };
            }
          }

          // Update the row's spacing property to reflect the new average spacing
          // Preserve the original curve value
          newRows[rowId] = {
            ...row,
            spacing: newSpacing,
            curve: row.curve || 0, // Ensure curve is preserved
          };
        }
      });

      const newScene = {
        ...state.scene,
        seats: newSeats,
        rows: newRows,
      };
      return updateScene(state, newScene);
    }

    case ACTIONS.ROTATE_SELECTED_SEATS: {
      const { angle } = action.payload;
      const newSeats = { ...state.scene.seats };

      if (state.selectedIds.length === 0) return state;

      // Calculate center of selected seats
      const selectedSeats = state.selectedIds
        .map((id) => state.scene.seats[id])
        .filter(Boolean);

      if (selectedSeats.length === 0) return state;

      // Calculate the center of the selection for rotation
      let centerX = 0;
      let centerY = 0;

      selectedSeats.forEach((seat) => {
        centerX += seat.localX;
        centerY += seat.localY;
      });

      centerX /= selectedSeats.length;
      centerY /= selectedSeats.length;

      // Rotate each selected seat around the center
      selectedSeats.forEach((seat) => {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        // Translate to origin
        const dx = seat.localX - centerX;
        const dy = seat.localY - centerY;

        // Rotate
        const rotatedX = dx * cos - dy * sin;
        const rotatedY = dx * sin + dy * cos;

        // Translate back
        newSeats[seat.id] = {
          ...seat,
          localX: centerX + rotatedX,
          localY: centerY + rotatedY,
        };
      });

      const newScene = {
        ...state.scene,
        seats: newSeats,
      };
      return updateScene(state, newScene);
    }

    case ACTIONS.ADD_ELEMENT: {
      const element = action.payload;
      const newScene = {
        ...state.scene,
        elements: {
          ...state.scene.elements,
          [element.id]: element,
        },
      };
      return updateScene(state, newScene);
    }

    case ACTIONS.ADD_TABLE_WITH_SEATS: {
      const { table, seats } = action.payload;

      // Add table element and all seats in a single operation
      const seatsById = seats.reduce((acc, seat) => {
        acc[seat.id] = seat;
        return acc;
      }, {});

      const newScene = {
        ...state.scene,
        elements: {
          ...state.scene.elements,
          [table.id]: table,
        },
        seats: {
          ...state.scene.seats,
          ...seatsById,
        },
      };
      return updateScene(state, newScene);
    }

    case ACTIONS.UPDATE_TABLE_GROUP: {
      const { table, oldSeats, config } = action.payload;
      const { seatCount, tableRadius, seatRadius, categoryId } = config;

      // Update table properties
      const newElements = {
        ...state.scene.elements,
        [table.id]: {
          ...table,
          radius: tableRadius,
          width: tableRadius * 2,
          height: tableRadius * 2,
        },
      };

      // Delete old seats
      const newSeats = { ...state.scene.seats };
      oldSeats.forEach((seat) => {
        delete newSeats[seat.id];
      });

      // Create new seats around the table
      const tableX = table.x;
      const tableY = table.y;
      const newSeatsArray = [];

      for (let i = 0; i < seatCount; i++) {
        const angle = (i / seatCount) * 2 * Math.PI;
        const seatX = tableX + seatRadius * Math.cos(angle);
        const seatY = tableY + seatRadius * Math.sin(angle);

        const seat = {
          id: generateId(),
          rowId: null, // Standalone seat (table seat)
          localX: seatX,
          localY: seatY,
          width: 14,
          height: 14,
          radius: 7,
          label: table.label ? `${table.label}-${i + 1}` : "",
          categoryId: categoryId,
        };

        newSeatsArray.push(seat);
        newSeats[seat.id] = seat;
      }

      const newScene = {
        ...state.scene,
        elements: newElements,
        seats: newSeats,
      };

      // Update selection to include table and new seats
      const newSelectedIds = [table.id, ...newSeatsArray.map((s) => s.id)];

      return {
        ...updateScene(state, newScene),
        selectedIds: newSelectedIds,
      };
    }

    case ACTIONS.UPDATE_ELEMENT: {
      const { id, updates } = action.payload;
      const newElements = { ...state.scene.elements };

      if (newElements[id]) {
        newElements[id] = {
          ...newElements[id],
          ...updates,
        };
      }

      const newScene = {
        ...state.scene,
        elements: newElements,
      };
      return updateScene(state, newScene);
    }

    case ACTIONS.ASSIGN_TABLE_LABELS: {
      const newElements = { ...state.scene.elements };
      const newSeats = { ...state.scene.seats };
      assignTableLabelsToGrid(newElements, newSeats);

      const newScene = {
        ...state.scene,
        elements: newElements,
        seats: newSeats,
      };
      return updateScene(state, newScene);
    }

    case ACTIONS.MOVE_ELEMENTS: {
      const { elementIds, deltaX, deltaY } = action.payload;
      const newElements = { ...state.scene.elements };
      const newSeats = { ...state.scene.seats };

      // Filter out child elements that are part of groups - only move the groups themselves
      const elementsToMove = elementIds.filter((elementId) => {
        const element = newElements[elementId];
        return !element || !element.parentGroupId; // Only move elements that are not children of groups
      });

      // Also include group elements that are directly selected
      const groupElements = elementIds.filter((elementId) => {
        const element = newElements[elementId];
        return element && element.type === "group";
      });

      const allElementsToMove = [
        ...new Set([...elementsToMove, ...groupElements]),
      ];

      const tablesBeingMoved = [];

      allElementsToMove.forEach((elementId) => {
        if (newElements[elementId]) {
          const element = newElements[elementId];

          // Only move if element is not locked (or if it's not an image)
          if (element.type !== "image" || !element.locked) {
            const oldX = element.x;
            const oldY = element.y;

            newElements[elementId] = {
              ...element,
              x: element.x + deltaX,
              y: element.y + deltaY,
            };

            if (element.type === "circle") {
              tablesBeingMoved.push({
                id: elementId,
                oldX,
                oldY,
                newX: element.x + deltaX,
                newY: element.y + deltaY,
                radius: element.radius || 30,
              });
            }

            // Also update points for path and section boundary elements (but not for groups or grouped children)
            if (
              (element.type === "path" ||
                element.type === "section-boundary") &&
              element.points &&
              !element.parentGroupId
            ) {
              newElements[elementId].points = element.points.map((point) => ({
                x: point.x + deltaX,
                y: point.y + deltaY,
              }));
            }

            // Also update curve handles for path and section boundary elements (but not for groups or grouped children)
            if (
              (element.type === "path" ||
                element.type === "section-boundary") &&
              element.curveHandles &&
              !element.parentGroupId
            ) {
              const adjustedCurveHandles = {};
              Object.entries(element.curveHandles).forEach(
                ([segmentIndex, handles]) => {
                  if (handles) {
                    adjustedCurveHandles[segmentIndex] = {
                      cp1: handles.cp1
                        ? {
                            x: handles.cp1.x + deltaX,
                            y: handles.cp1.y + deltaY,
                          }
                        : null,
                      cp2: handles.cp2
                        ? {
                            x: handles.cp2.x + deltaX,
                            y: handles.cp2.y + deltaY,
                          }
                        : null,
                    };
                  }
                },
              );
              newElements[elementId].curveHandles = adjustedCurveHandles;
            }

            // Update pathBoundary for standing sections and seating sections converted from paths
            if (
              (element.type === "standing-section" ||
                element.type === "seating-section") &&
              element.pathBoundary &&
              element.pathBoundary.points &&
              !element.parentGroupId
            ) {
              newElements[elementId].pathBoundary = {
                ...element.pathBoundary,
                points: element.pathBoundary.points.map((point) => ({
                  x: point.x + deltaX,
                  y: point.y + deltaY,
                })),
              };

              // Also update curve handles in pathBoundary if they exist
              if (element.pathBoundary.curveHandles) {
                const adjustedCurveHandles = {};
                Object.entries(element.pathBoundary.curveHandles).forEach(
                  ([segmentIndex, handles]) => {
                    if (handles) {
                      adjustedCurveHandles[segmentIndex] = {
                        cp1: handles.cp1
                          ? {
                              x: handles.cp1.x + deltaX,
                              y: handles.cp1.y + deltaY,
                            }
                          : null,
                        cp2: handles.cp2
                          ? {
                              x: handles.cp2.x + deltaX,
                              y: handles.cp2.y + deltaY,
                            }
                          : null,
                      };
                    }
                  },
                );
                newElements[elementId].pathBoundary.curveHandles =
                  adjustedCurveHandles;
              }
            }
          }
        }
      });

      tablesBeingMoved.forEach((table) => {
        Object.values(newSeats).forEach((seat) => {
          if (seat.rowId === null && !state.selectedIds.includes(seat.id)) {
            const distance = Math.sqrt(
              Math.pow(seat.localX - table.oldX, 2) +
                Math.pow(seat.localY - table.oldY, 2),
            );

            if (distance <= table.radius + 20) {
              newSeats[seat.id] = {
                ...seat,
                localX: seat.localX + deltaX,
                localY: seat.localY + deltaY,
              };
            }
          }
        });
      });

      const newSceneMove = {
        ...state.scene,
        elements: newElements,
        seats: newSeats,
      };
      return updateScene(state, newSceneMove);
    }

    case ACTIONS.ADD_IMAGE: {
      const image = action.payload;
      const newScene = {
        ...state.scene,
        elements: {
          ...state.scene.elements,
          [image.id]: image,
        },
      };
      return updateScene(state, newScene);
    }

    case ACTIONS.UPDATE_IMAGE: {
      const { id, updates } = action.payload;
      const newElements = { ...state.scene.elements };

      if (newElements[id]) {
        newElements[id] = {
          ...newElements[id],
          ...updates,
        };
      }

      const newScene = {
        ...state.scene,
        elements: newElements,
      };
      return updateScene(state, newScene);
    }

    case ACTIONS.LOCK_IMAGE: {
      const { id } = action.payload;
      const newElements = { ...state.scene.elements };

      if (newElements[id] && newElements[id].type === "image") {
        newElements[id] = {
          ...newElements[id],
          locked: true,
        };
      }

      const newScene = {
        ...state.scene,
        elements: newElements,
      };
      return updateScene(state, newScene);
    }

    case ACTIONS.UNLOCK_IMAGE: {
      const { id } = action.payload;
      const newElements = { ...state.scene.elements };

      if (newElements[id] && newElements[id].type === "image") {
        newElements[id] = {
          ...newElements[id],
          locked: false,
        };
      }

      const newScene = {
        ...state.scene,
        elements: newElements,
      };
      return updateScene(state, newScene);
    }

    case ACTIONS.DELETE_ITEMS: {
      const idsToDelete = action.payload;
      const newState = { ...state };

      // Remove seats
      const newSeats = { ...newState.scene.seats };
      idsToDelete.forEach((id) => {
        if (newSeats[id]) {
          delete newSeats[id];
        }
      });

      // Remove rows
      const newRows = { ...newState.scene.rows };
      idsToDelete.forEach((id) => {
        if (newRows[id]) {
          delete newRows[id];
        }
      });

      // Remove elements
      const newElements = { ...newState.scene.elements };
      idsToDelete.forEach((id) => {
        if (newElements[id]) {
          delete newElements[id];
        }
      });

      // Check for rows that became empty after seat deletion
      const remainingSeats = Object.values(newSeats);
      const emptyRowIds = [];

      Object.values(newRows).forEach((row) => {
        const rowSeats = remainingSeats.filter((seat) => seat.rowId === row.id);
        if (rowSeats.length === 0) {
          emptyRowIds.push(row.id);
        }
      });

      // Remove empty rows
      emptyRowIds.forEach((rowId) => {
        delete newRows[rowId];
      });

      // Remove sections and update venue
      const newSections = { ...newState.scene.sections };
      const newVenueSections = [...newState.scene.venue.sections];
      idsToDelete.forEach((id) => {
        if (newSections[id]) {
          delete newSections[id];
          const index = newVenueSections.indexOf(id);
          if (index > -1) {
            newVenueSections.splice(index, 1);
          }
        }
      });

      // Also remove sections that have no rows left
      const remainingRows = Object.values(newRows);
      Object.values(newSections).forEach((section) => {
        const sectionRows = remainingRows.filter(
          (row) => row.sectionId === section.id,
        );
        if (sectionRows.length === 0) {
          delete newSections[section.id];
          const index = newVenueSections.indexOf(section.id);
          if (index > -1) {
            newVenueSections.splice(index, 1);
          }
        }
      });

      // Clean up empty rows from sections' row lists
      Object.values(newSections).forEach((section) => {
        if (section.rows) {
          section.rows = section.rows.filter((rowId) => newRows[rowId]);
        }
      });

      const newScene = {
        ...newState.scene,
        seats: newSeats,
        rows: newRows,
        elements: newElements,
        sections: newSections,
        venue: {
          ...newState.scene.venue,
          sections: newVenueSections,
        },
      };

      return {
        ...updateScene(newState, newScene),
        selectedIds: newState.selectedIds.filter(
          (id) => !idsToDelete.includes(id),
        ),
      };
    }

    case ACTIONS.TOGGLE_GRID:
      return { ...state, isGridVisible: !state.isGridVisible };

    case ACTIONS.LOAD_SCENE: {
      const loadedScene = action.payload;
      // Ensure the scene has a view state, create default if missing.
      // Also normalise any map fields that the API may return as null.
      let scene = {
        ...loadedScene,
        seats:    loadedScene.seats    || {},
        rows:     loadedScene.rows     || {},
        elements: loadedScene.elements || {},
        sections: loadedScene.sections || {},
        view: loadedScene.view || {
          scale: 1.0,
          tx: 400,
          ty: 300,
        },
      };

      // Ensure categories exist, create default if missing
      if (
        !scene.venue ||
        !scene.venue.categories ||
        scene.venue.categories.length === 0
      ) {
        scene = {
          ...scene,
          venue: {
            ...scene.venue,
            categories: [
              {
                id: "default",
                name: "Default",
                color: "#4a90e2",
                price: 0,
              },
            ],
          },
        };
      }

      // Ensure sections exist, create default if missing
      if (!scene.sections || Object.keys(scene.sections).length === 0) {
        const defaultCategoryId = scene.venue.categories[0]?.id || "default";
        const defaultSection = createSection("Orchestra", defaultCategoryId);
        scene = {
          ...scene,
          sections: {
            [defaultSection.id]: defaultSection,
          },
          venue: {
            ...scene.venue,
            sections: [defaultSection.id],
          },
        };
      }

      // Migrate old arc geometry to new elliptical format
      if (scene.rows) {
        Object.keys(scene.rows).forEach((rowId) => {
          const row = scene.rows[rowId];
          if (row.geometry && row.geometry.kind === "arc") {
            scene.rows[rowId] = {
              ...row,
              geometry: migrateArcGeometry(row.geometry),
            };
          }
        });
      }

      // Initialize globalSettings with first category if not set
      const firstCategoryId = scene.venue.categories[0]?.id || "default";
      const newGlobalSettings = {
        ...state.globalSettings,
        categoryId: state.globalSettings?.categoryId || firstCategoryId,
        defaultCategoryId:
          state.globalSettings?.defaultCategoryId || firstCategoryId,
        showSectionBoundaryInRenderer:
          loadedScene.showSectionBoundaryInRenderer ??
          state.globalSettings?.showSectionBoundaryInRenderer ??
          false,
      };

      return {
        ...state,
        scene,
        selectedIds: [],
        globalSettings: newGlobalSettings,
        history: {
          past: [],
          present: scene,
          future: [],
        },
      };
    }

    case ACTIONS.SAVE_TO_HISTORY: {
      // Save the CURRENT state before an action is performed
      const newPast = [...state.history.past, state.history.present];

      // Limit history size to prevent memory issues
      const maxHistory = 50;
      if (newPast.length > maxHistory) {
        newPast.shift();
      }

      return {
        ...state,
        history: {
          past: newPast,
          present: state.scene, // Keep current scene as present
          future: [], // Clear future when new action is performed
        },
      };
    }

    case ACTIONS.COMMIT_TO_HISTORY: {
      // Commit the current scene state to history (used after continuous updates)
      // This updates the present state in history without saving to past.
      // structuredClone is a native deep copy that avoids the cost of
      // JSON string (de)serialization over the full (potentially multi-thousand
      // seat) scene on every commit.
      const currentSceneSnapshot = structuredClone(state.scene);

      return {
        ...state,
        history: {
          ...state.history,
          present: currentSceneSnapshot,
        },
      };
    }

    case ACTIONS.UNDO:
      if (state.history.past.length === 0) {
        return state; // Nothing to undo
      }

      const previousScene = state.history.past[state.history.past.length - 1];
      const newPast = state.history.past.slice(0, -1);

      return {
        ...state,
        scene: previousScene,
        history: {
          past: newPast,
          present: previousScene,
          future: [state.history.present, ...state.history.future],
        },
        selectedIds: [], // Clear selection on undo
      };

    case ACTIONS.REDO:
      if (state.history.future.length === 0) {
        return state; // Nothing to redo
      }

      const nextScene = state.history.future[0];
      const newFuture = state.history.future.slice(1);

      return {
        ...state,
        scene: nextScene,
        history: {
          past: [...state.history.past, state.history.present],
          present: nextScene,
          future: newFuture,
        },
        selectedIds: [], // Clear selection on redo
      };

    case ACTIONS.COPY_ROWS: {
      const selectedRowIds = new Set();
      const selectedElementIds = new Set();
      const copiedRows = [];
      const copiedSeats = [];
      const copiedElements = [];

      // Find all rows that have selected seats, and collect selected elements and standalone seats
      state.selectedIds.forEach((selectedId) => {
        const seat = state.scene.seats[selectedId];
        const element = state.scene.elements[selectedId];

        if (seat) {
          if (seat.rowId) {
            selectedRowIds.add(seat.rowId);
          } else {
            // Standalone seat (like table seats)
            copiedSeats.push({ ...seat });
          }
        } else if (element) {
          selectedElementIds.add(selectedId);
        }
      });

      // Copy row data and their seats
      selectedRowIds.forEach((rowId) => {
        const row = state.scene.rows[rowId];
        if (row) {
          copiedRows.push({ ...row });

          // Copy all seats in this row
          Object.values(state.scene.seats).forEach((seat) => {
            if (seat.rowId === rowId) {
              copiedSeats.push({ ...seat });
            }
          });
        }
      });

      // Copy selected elements (like tables)
      selectedElementIds.forEach((elementId) => {
        const element = state.scene.elements[elementId];
        if (element) {
          copiedElements.push({ ...element });
        }
      });

      return {
        ...state,
        clipboard: {
          rows: copiedRows,
          seats: copiedSeats,
          elements: copiedElements,
          isEmpty:
            copiedRows.length === 0 &&
            copiedSeats.length === 0 &&
            copiedElements.length === 0,
        },
      };
    }

    case ACTIONS.PASTE_ROWS: {
      if (state.clipboard.isEmpty) return state;

      const newState = { ...state };
      const newRows = { ...newState.scene.rows };
      const newSeats = { ...newState.scene.seats };
      const newSections = { ...newState.scene.sections };
      const newElements = { ...newState.scene.elements };
      const pasteOffset = action.payload?.offset || { x: 50, y: 50 };

      // Create ID mapping for copied rows, seats, and elements
      const rowIdMapping = {};
      const seatIdMapping = {};
      const elementIdMapping = {};
      const newSelectedIds = [];

      // Create new rows with updated IDs and positions
      state.clipboard.rows.forEach((originalRow) => {
        const newRowId = generateId();
        rowIdMapping[originalRow.id] = newRowId;

        // Apply paste offset to row geometry
        let newGeometry = { ...originalRow.geometry };
        if (newGeometry.kind === "line") {
          newGeometry.p1 = {
            x: newGeometry.p1.x + pasteOffset.x,
            y: newGeometry.p1.y + pasteOffset.y,
          };
          newGeometry.p2 = {
            x: newGeometry.p2.x + pasteOffset.x,
            y: newGeometry.p2.y + pasteOffset.y,
          };
        } else if (newGeometry.kind === "arc") {
          newGeometry.center = {
            x: newGeometry.center.x + pasteOffset.x,
            y: newGeometry.center.y + pasteOffset.y,
          };
        }

        // Ensure the target section exists
        let targetSectionId = originalRow.sectionId;
        if (!newSections[targetSectionId]) {
          // If the original section doesn't exist, use the first available section
          const availableSections = Object.keys(newSections);
          if (availableSections.length > 0) {
            targetSectionId = availableSections[0];
          } else {
            // Create a default section if none exist
            const defaultCategoryId =
              newState.scene.venue.categories[0]?.id || "default";
            const defaultSection = createSection(
              "Orchestra",
              defaultCategoryId,
            );
            newSections[defaultSection.id] = defaultSection;
            newState.scene.venue.sections.push(defaultSection.id);
            targetSectionId = defaultSection.id;
          }
        }

        const newRow = {
          ...originalRow,
          id: newRowId,
          sectionId: targetSectionId,
          geometry: newGeometry,
        };

        newRows[newRowId] = newRow;

        // Add row to section
        if (!newSections[targetSectionId].rows.includes(newRowId)) {
          newSections[targetSectionId].rows.push(newRowId);
        }
      });

      // Create new seats with updated IDs and positions
      // First, group seats by their new row IDs to update labels correctly
      const seatsByNewRow = {};
      state.clipboard.seats.forEach((originalSeat) => {
        const newRowId = rowIdMapping[originalSeat.rowId];
        if (newRowId) {
          if (!seatsByNewRow[newRowId]) {
            seatsByNewRow[newRowId] = [];
          }
          seatsByNewRow[newRowId].push(originalSeat);
        }
      });

      state.clipboard.seats.forEach((originalSeat) => {
        const newSeatId = generateId();
        seatIdMapping[originalSeat.id] = newSeatId;
        const newRowId = rowIdMapping[originalSeat.rowId];

        if (newRowId) {
          // Seat belongs to a row - update label based on new row position
          const allRowIds = Object.keys(newRows);
          const newRowIndex = allRowIds.indexOf(newRowId);

          // Find the seat's position within its row
          const rowSeats = seatsByNewRow[newRowId];
          const seatIndexInRow = rowSeats.indexOf(originalSeat);
          const seatNumber = seatIndexInRow + 1;

          // Generate new label based on new row position
          const newLabel =
            newRowIndex >= 0
              ? generateSeatLabel(newRowIndex, seatNumber)
              : originalSeat.label;

          const newSeat = {
            ...originalSeat,
            id: newSeatId,
            rowId: newRowId,
            label: newLabel, // Update label to reflect new row position
            localX: originalSeat.localX + pasteOffset.x,
            localY: originalSeat.localY + pasteOffset.y,
          };

          newSeats[newSeatId] = newSeat;
          newSelectedIds.push(newSeatId);
        } else {
          // Standalone seat (like table seats)
          const newSeat = {
            ...originalSeat,
            id: newSeatId,
            localX: originalSeat.localX + pasteOffset.x,
            localY: originalSeat.localY + pasteOffset.y,
          };

          newSeats[newSeatId] = newSeat;
          newSelectedIds.push(newSeatId);
        }
      });

      // Create new elements with updated IDs and positions
      state.clipboard.elements.forEach((originalElement) => {
        const newElementId = generateId();
        elementIdMapping[originalElement.id] = newElementId;

        const newElement = {
          ...originalElement,
          id: newElementId,
          x: originalElement.x + pasteOffset.x,
          y: originalElement.y + pasteOffset.y,
        };

        newElements[newElementId] = newElement;
        newSelectedIds.push(newElementId);
      });

      return {
        ...newState,
        scene: {
          ...newState.scene,
          rows: newRows,
          seats: newSeats,
          sections: newSections,
          elements: newElements,
        },
        selectedIds: newSelectedIds,
      };
    }

    case ACTIONS.COMPLETE_PATH: {
      return {
        ...state,
        pathCompletionRequested: !state.pathCompletionRequested,
      };
    }

    case ACTIONS.UPDATE_GLOBAL_SETTINGS: {
      return {
        ...state,
        globalSettings: {
          ...state.globalSettings,
          ...action.payload,
        },
      };
    }

    case ACTIONS.UPDATE_TOOL_SETTINGS: {
      const { toolType, settings } = action.payload;
      return {
        ...state,
        toolSettings: {
          ...state.toolSettings,
          [toolType]: {
            ...state.toolSettings[toolType],
            ...settings,
          },
        },
      };
    }

    case ACTIONS.GROUP_ELEMENTS: {
      const { elementIds } = action.payload;
      const newElements = { ...state.scene.elements };

      // Filter to only include actual elements (not seats or rows)
      const elementsToGroup = elementIds.filter((id) => newElements[id]);
      if (elementsToGroup.length < 2) return state; // Need at least 2 elements

      // Calculate bounding box for the group
      const groupElements = elementsToGroup.map((id) => newElements[id]);

      // Calculate min bounds including curve handles for path elements
      const allXCoords = [];
      const allYCoords = [];

      groupElements.forEach((el) => {
        allXCoords.push(el.x);
        allYCoords.push(el.y);

        // Include curve handles for path elements (using world coordinates)
        if (el.type === "path" && el.curveHandles) {
          Object.values(el.curveHandles).forEach((handles) => {
            if (handles && handles.cp1) {
              allXCoords.push(el.x + handles.cp1.x);
              allYCoords.push(el.y + handles.cp1.y);
            }
            if (handles && handles.cp2) {
              allXCoords.push(el.x + handles.cp2.x);
              allYCoords.push(el.y + handles.cp2.y);
            }
          });
        }
      });

      const minX = Math.min(...allXCoords);
      const minY = Math.min(...allYCoords);
      const maxX = Math.max(...allXCoords);
      const maxY = Math.max(...allYCoords);

      // Create a new group element
      const groupId = generateId();
      const groupElement = {
        id: groupId,
        type: "group",
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
        children: elementsToGroup,
        strokeColor: "rgba(0, 0, 0, 0.9)",
        strokeWidth: 2,
        fillColor: "transparent",
        opacity: 1,
      };

      // Update all grouped elements to be children of the group
      elementsToGroup.forEach((elementId) => {
        const element = newElements[elementId];
        const adjustedElement = {
          ...element,
          parentGroupId: groupId,
          // Adjust position relative to group origin
          x: element.x - minX,
          y: element.y - minY,
        };

        // Adjust points for path and section boundary elements (relative to element position, then to group origin)
        if (
          (element.type === "path" || element.type === "section-boundary") &&
          element.points
        ) {
          adjustedElement.points = element.points.map((point) => ({
            x: point.x + element.x - minX,
            y: point.y + element.y - minY,
          }));
        }

        // Adjust curve handles for path and section boundary elements (relative to element position, then to group origin)
        if (
          (element.type === "path" || element.type === "section-boundary") &&
          element.curveHandles
        ) {
          const adjustedCurveHandles = {};
          Object.entries(element.curveHandles).forEach(
            ([segmentIndex, handles]) => {
              if (handles) {
                adjustedCurveHandles[segmentIndex] = {
                  cp1: handles.cp1
                    ? {
                        x: handles.cp1.x + element.x - minX,
                        y: handles.cp1.y + element.y - minY,
                      }
                    : null,
                  cp2: handles.cp2
                    ? {
                        x: handles.cp2.x + element.x - minX,
                        y: handles.cp2.y + element.y - minY,
                      }
                    : null,
                };
              }
            },
          );
          adjustedElement.curveHandles = adjustedCurveHandles;
        }

        newElements[elementId] = adjustedElement;
      });

      // Add the group element
      newElements[groupId] = groupElement;

      return {
        ...state,
        scene: {
          ...state.scene,
          elements: newElements,
        },
        selectedIds: [groupId], // Select the new group
      };
    }

    case ACTIONS.UNGROUP_ELEMENTS: {
      const { groupId } = action.payload;
      const newElements = { ...state.scene.elements };

      const groupElement = newElements[groupId];
      if (!groupElement || groupElement.type !== "group") return state;

      const children = groupElement.children || [];
      const parentX = groupElement.x;
      const parentY = groupElement.y;

      // Restore original positions and remove parent group reference
      children.forEach((childId) => {
        if (newElements[childId]) {
          const childElement = newElements[childId];
          const restoredElement = {
            ...childElement,
            parentGroupId: null,
            // Restore absolute position
            x: childElement.x + parentX,
            y: childElement.y + parentY,
          };

          // Restore absolute points for path elements (child points are already relative to child position)
          if (childElement.type === "path" && childElement.points) {
            restoredElement.points = childElement.points.map((point) => ({
              x: point.x + parentX,
              y: point.y + parentY,
            }));
          }

          // Restore absolute curve handles for path elements (child handles are already relative to child position)
          if (childElement.type === "path" && childElement.curveHandles) {
            const restoredCurveHandles = {};
            Object.entries(childElement.curveHandles).forEach(
              ([segmentIndex, handles]) => {
                if (handles) {
                  restoredCurveHandles[segmentIndex] = {
                    cp1: handles.cp1
                      ? {
                          x: handles.cp1.x + parentX,
                          y: handles.cp1.y + parentY,
                        }
                      : null,
                    cp2: handles.cp2
                      ? {
                          x: handles.cp2.x + parentX,
                          y: handles.cp2.y + parentY,
                        }
                      : null,
                  };
                }
              },
            );
            restoredElement.curveHandles = restoredCurveHandles;
          }

          newElements[childId] = restoredElement;
        }
      });

      // Remove the group element
      delete newElements[groupId];

      return {
        ...state,
        scene: {
          ...state.scene,
          elements: newElements,
        },
        selectedIds: children, // Select all the ungrouped elements
      };
    }

    case ACTIONS.CANCEL_DRAWING:
      // Cancel any active drawing operation by toggling the flag
      return {
        ...state,
        drawingCancelled: !state.drawingCancelled,
      };

    default:
      return state;
  }
}
