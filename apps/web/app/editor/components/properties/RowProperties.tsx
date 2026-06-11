import React, { useState } from "react";
import { PropertySection, InputField, SelectField } from "./UIComponents.tsx";
import { ChevronLeft, ChevronRight, RotateCcw, RotateCw } from "lucide-react";
import type { EditorCategory, EditorRow, EditorScene } from "../../types.ts";

type RowUpdate = Record<string, unknown>;
type LineGeometry = Extract<EditorRow["geometry"], { kind: "line" }>;
type ArcGeometry = Extract<EditorRow["geometry"], { kind: "arc" }>;
type RowPropertiesProps = {
  selectedRows: EditorRow[];
  multipleSelected: boolean;
  inferredRowFromSelectedSeats: EditorRow;
  scene: EditorScene;
  categories: EditorCategory[];
  onRowUpdate: (id: string, updates: RowUpdate) => void;
  onAdjustSeatSpacing: (seatIds: string[], delta: number) => void;
};

export const RowProperties = ({
  selectedRows,
  multipleSelected,
  inferredRowFromSelectedSeats,
  scene,
  categories,
  onRowUpdate,
  onAdjustSeatSpacing,
}: RowPropertiesProps) => {
  const [isEditingSeatCount, setIsEditingSeatCount] = useState(false);
  const [tempSeatCount, setTempSeatCount] = useState("");
  const [isEditingSpacing, setIsEditingSpacing] = useState(false);
  const [tempSpacing, setTempSpacing] = useState("");
  const [isEditingCurve, setIsEditingCurve] = useState(false);
  const [tempCurve, setTempCurve] = useState("");
  const [rotationAngle, setRotationAngle] = useState(0);
  const [previousRotation, setPreviousRotation] = useState(0);

  const handleSeatCountClick = () => {
    setIsEditingSeatCount(true);
    setTempSeatCount(inferredRowFromSelectedSeats.seatCount?.toString() || "1");
  };

  const handleSeatCountBlur = () => {
    const newValue = parseInt(tempSeatCount) || 1;
    if (newValue !== inferredRowFromSelectedSeats.seatCount) {
      onRowUpdate(inferredRowFromSelectedSeats.id, {
        seatCount: Math.min(100, Math.max(1, newValue)),
      });
    }
    setIsEditingSeatCount(false);
    setTempSeatCount("");
  };

  const handleSeatCountKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSeatCountBlur();
    } else if (e.key === "Escape") {
      setIsEditingSeatCount(false);
      setTempSeatCount("");
    }
  };

  const handleSpacingClick = () => {
    setIsEditingSpacing(true);
    setTempSpacing(inferredRowFromSelectedSeats.spacing?.toString() || "30");
  };

  const handleSpacingBlur = () => {
    const newValue = parseFloat(tempSpacing) || 30;
    if (newValue !== inferredRowFromSelectedSeats.spacing) {
      onRowUpdate(inferredRowFromSelectedSeats.id, {
        spacing: Math.min(100, Math.max(20, newValue)),
      });
    }
    setIsEditingSpacing(false);
    setTempSpacing("");
  };

  const handleSpacingKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSpacingBlur();
    } else if (e.key === "Escape") {
      setIsEditingSpacing(false);
      setTempSpacing("");
    }
  };

  const handleCurveClick = () => {
    setIsEditingCurve(true);
    setTempCurve(formatCurveValue(inferredRowFromSelectedSeats.curve || 0));
  };

  // Helper function to format curve values for display
  const formatCurveValue = (value: number) => {
    if (typeof value !== "number") return "0";
    // Round to 2 decimal places to avoid floating-point precision issues
    return (Math.round(value * 100) / 100).toString();
  };

  const handleCurveBlur = () => {
    const newValue = Math.round((parseFloat(tempCurve) || 0) * 100) / 100;
    if (newValue !== (inferredRowFromSelectedSeats.curve || 0)) {
      onRowUpdate(inferredRowFromSelectedSeats.id, {
        curve: newValue,
      });
    }
    setIsEditingCurve(false);
    setTempCurve("");
  };

  const handleCurveKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleCurveBlur();
    } else if (e.key === "Escape") {
      setIsEditingCurve(false);
      setTempCurve("");
    }
  };

  // Helper function to rotate a row by a given angle (in radians)
  const rotateRow = (rowId: string, angleRadians: number) => {
    const row = scene.rows[rowId];
    if (!row) return;

    const currentRotation = row.transform?.rotation || 0;
    const newRotation = currentRotation + angleRadians;

    onRowUpdate(rowId, {
      transform: {
        ...row.transform,
        rotation: newRotation,
      },
    });
  };

  // Sync the rotation field to the current row's actual rotation. Computed and
  // applied during render (via a previous-value comparison) instead of in an
  // effect, so the field never shows the previously selected row's angle for a
  // frame before updating.
  let currentRow = null;
  if (selectedRows.length === 1) {
    currentRow = selectedRows[0];
  } else if (inferredRowFromSelectedSeats) {
    currentRow = inferredRowFromSelectedSeats;
  }
  const currentRotationDegrees = currentRow
    ? Math.round(((currentRow.transform?.rotation || 0) * 180) / Math.PI)
    : 0;
  const [prevRotationDegrees, setPrevRotationDegrees] = useState(
    /** @type {number | null} */ (null),
  );
  if (currentRotationDegrees !== prevRotationDegrees) {
    setPrevRotationDegrees(currentRotationDegrees);
    setRotationAngle(currentRotationDegrees);
    setPreviousRotation(currentRotationDegrees);
  }

  const renderSingleRowProperties = (row: EditorRow) => (
    <>
      <InputField
        label="Seat Count"
        type="number"
        value={row.seatCount}
        onChange={(value) =>
          onRowUpdate(row.id, {
            seatCount: parseInt(String(value)) || 1,
          })
        }
        min="1"
        max="50"
        disabled={true}
      />

      <div className="flex items-center justify-between py-3">
        <p className="">Spacing</p>
        <div className="flex items-center border border-gray-300 rounded-lg px-2 py-1.5 w-32 bg-white">
          <button
            onClick={(e) => {
              const rowSeatIds = Object.values(scene.seats)
                .filter((s) => s.rowId === row.id)
                .map((s) => s.id);
              if (rowSeatIds.length >= 2) {
                // Use smaller increment when Shift is pressed
                const spacingDelta = e.shiftKey ? -1 : -0.1;
                onAdjustSeatSpacing(rowSeatIds, spacingDelta);
              }
            }}
            className="text-gray-400 hover:text-gray-600 px-1"
            title={
              window.navigator.platform.includes("Mac")
                ? "Decrease distance (hold Shift for larger steps)"
                : "Decrease distance (hold Shift for larger steps)"
            }
          >
            <ChevronLeft />
          </button>
          <span className="flex-1 text-center text-lg font-normal">
            {(row.spacing || 0).toFixed(1)}
          </span>
          <button
            onClick={(e) => {
              const rowSeatIds = Object.values(scene.seats)
                .filter((s) => s.rowId === row.id)
                .map((s) => s.id);
              if (rowSeatIds.length >= 2) {
                // Use smaller increment when Shift is pressed
                const spacingDelta = e.shiftKey ? 1 : 0.1;
                onAdjustSeatSpacing(rowSeatIds, spacingDelta);
              }
            }}
            className="text-gray-400 hover:text-gray-600 px-1"
            title={
              window.navigator.platform.includes("Mac")
                ? "Increase distance (hold Shift for larger steps)"
                : "Increase distance (hold Shift for larger steps)"
            }
          >
            <ChevronRight />
          </button>
        </div>
      </div>

      <div className="mb-3 p-2 bg-purple-50 rounded">
        <div className="flex gap-2">
          <button
            onClick={() =>
              onRowUpdate(row.id, {
                seatCount: Math.max(1, (row.seatCount || 1) - 1),
              })
            }
            className="flex-1 px-3 py-2 bg-gray-200 hover:bg-gray-300 rounded-md"
            title="Decrease number of seats"
          >
            -
          </button>
          <button
            onClick={() =>
              onRowUpdate(row.id, {
                seatCount: Math.min(100, (row.seatCount || 1) + 1),
              })
            }
            className="flex-1 px-3 py-2 bg-gray-200 hover:bg-gray-300 rounded-md"
            title="Increase number of seats"
          >
            +
          </button>
        </div>
      </div>

      <SelectField
        label="Category"
        value={row.categoryId}
        onChange={(value) =>
          onRowUpdate(row.id, {
            categoryId: value,
          })
        }
        options={categories.map((cat) => ({
          value: cat.id,
          label: cat.name,
        }))}
      />

      <InputField
        label="Curve"
        type="number"
        value={formatCurveValue(row.curve || 0)}
        onChange={(value) =>
          onRowUpdate(row.id, {
            curve: Math.round((parseFloat(String(value)) || 0) * 100) / 100,
          })
        }
        step="0.1"
        title="Curve intensity (0 = no curve, positive values create upward curve, negative values create downward curve)"
      />

      {/* Rotation Control - Hidden when multiple rows are selected */}
      {selectedRows.length <= 1 && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-600 mb-2">
            Rotate Row
          </label>

          {/* Fixed angle rotation buttons */}
          <div className="grid grid-cols-2 gap-2 mb-2">
            <button
              onClick={() => rotateRow(row.id, -Math.PI / 12)}
              className="px-3 py-2 bg-purple text-white rounded-md hover:bg-purple-700 transition-colors flex items-center justify-center gap-1"
              style={{ backgroundColor: "#8d6fbf" }}
              title="Rotate counter-clockwise 15 degrees"
            >
              <RotateCcw className="w-5 h-5" />
              <span className="text-sm">15°</span>
            </button>
            <button
              onClick={() => rotateRow(row.id, Math.PI / 12)}
              className="px-3 py-2 bg-purple text-white rounded-md hover:bg-purple-700 transition-colors flex items-center justify-center gap-1"
              style={{ backgroundColor: "#8d6fbf" }}
              title="Rotate clockwise 15 degrees"
            >
              <RotateCw className="w-5 h-5" />
              <span className="text-sm">15°</span>
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <button
              onClick={() => rotateRow(row.id, -Math.PI / 4)}
              className="px-3 py-2 bg-purple text-white rounded-md hover:bg-purple-700 transition-colors flex items-center justify-center gap-1"
              style={{ backgroundColor: "#8d6fbf" }}
              title="Rotate counter-clockwise 45 degrees"
            >
              <RotateCcw className="w-5 h-5" />
              <span className="text-sm">45°</span>
            </button>
            <button
              onClick={() => rotateRow(row.id, Math.PI / 4)}
              className="px-3 py-2 bg-purple text-white rounded-md hover:bg-purple-700 transition-colors flex items-center justify-center gap-1"
              style={{ backgroundColor: "#8d6fbf" }}
              title="Rotate clockwise 45 degrees"
            >
              <RotateCw className="w-5 h-5" />
              <span className="text-sm">45°</span>
            </button>
          </div>

          {/* Custom angle rotation with slider */}
          <div className="space-y-2 pt-3 border-t border-gray-200">
            <div className="flex gap-2 items-center">
              <input
                type="number"
                value={rotationAngle}
                onChange={(e) => {
                  const newValue = parseFloat(e.target.value) || 0;
                  const delta = newValue - previousRotation;
                  setRotationAngle(newValue);
                  setPreviousRotation(newValue);
                  // Apply the rotation delta
                  rotateRow(row.id, (delta * Math.PI) / 180);
                }}
                className="w-20 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                min="-360"
                max="360"
                step="1"
              />
              <span className="text-xs text-gray-600">degrees</span>
              <button
                onClick={() => {
                  // Reset to 0 by rotating back
                  if (rotationAngle !== 0) {
                    rotateRow(row.id, (-rotationAngle * Math.PI) / 180);
                    setRotationAngle(0);
                    setPreviousRotation(0);
                  }
                }}
                className="px-3 py-2 bg-purple text-white rounded-md hover:bg-purple-700 transition-colors text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: "#8d6fbf" }}
                title="Reset rotation to 0"
                disabled={rotationAngle === 0}
              >
                Reset
              </button>
            </div>

            {/* Slider */}
            <div className="relative">
              <input
                type="range"
                value={rotationAngle}
                onChange={(e) => {
                  const newValue = parseFloat(e.target.value);
                  const delta = newValue - previousRotation;
                  setRotationAngle(newValue);
                  setPreviousRotation(newValue);
                  // Apply the rotation delta immediately
                  rotateRow(row.id, (delta * Math.PI) / 180);
                }}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                min="-180"
                max="180"
                step="1"
                style={{
                  background: `linear-gradient(to right, #8d6fbf 0%, #8d6fbf ${
                    ((rotationAngle + 180) / 360) * 100
                  }%, #e5e7eb ${
                    ((rotationAngle + 180) / 360) * 100
                  }%, #e5e7eb 100%)`,
                }}
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>-180°</span>
                <span>0°</span>
                <span>180°</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Line Geometry */}
      {row.geometry.kind === "line" && (
        <>
          <div className="text-sm font-medium text-gray-600 mb-2">
            Line Geometry
          </div>
          <div className="grid grid-cols-2 gap-2">
            <InputField
              label="Start X"
              type="number"
              value={Math.round(row.geometry.p1.x)}
              onChange={(value) => {
                const newGeometry = {
                  ...row.geometry,
                  p1: {
                    ...(row.geometry as LineGeometry).p1,
                    x: parseInt(String(value)) || 0,
                  },
                };
                onRowUpdate(row.id, {
                  geometry: newGeometry,
                });
              }}
            />
            <InputField
              label="Start Y"
              type="number"
              value={Math.round(row.geometry.p1.y)}
              onChange={(value) => {
                const newGeometry = {
                  ...row.geometry,
                  p1: {
                    ...(row.geometry as LineGeometry).p1,
                    y: parseInt(String(value)) || 0,
                  },
                };
                onRowUpdate(row.id, {
                  geometry: newGeometry,
                });
              }}
            />
            <InputField
              label="End X"
              type="number"
              value={Math.round(row.geometry.p2.x)}
              onChange={(value) => {
                const newGeometry = {
                  ...row.geometry,
                  p2: {
                    ...(row.geometry as LineGeometry).p2,
                    x: parseInt(String(value)) || 0,
                  },
                };
                onRowUpdate(row.id, {
                  geometry: newGeometry,
                });
              }}
            />
            <InputField
              label="End Y"
              type="number"
              value={Math.round(row.geometry.p2.y)}
              onChange={(value) => {
                const newGeometry = {
                  ...row.geometry,
                  p2: {
                    ...(row.geometry as LineGeometry).p2,
                    y: parseInt(String(value)) || 0,
                  },
                };
                onRowUpdate(row.id, {
                  geometry: newGeometry,
                });
              }}
            />
          </div>
        </>
      )}

      {/* Arc Geometry */}
      {row.geometry.kind === "arc" && (
        <>
          <div className="text-sm font-medium text-gray-600 mb-2">
            Arc Geometry
          </div>
          <div className="grid grid-cols-2 gap-2">
            <InputField
              label="Center X"
              type="number"
              value={Math.round(row.geometry.center.x)}
              onChange={(value) => {
                const newGeometry = {
                  ...row.geometry,
                  center: {
                    ...(row.geometry as ArcGeometry).center,
                    x: parseInt(String(value)) || 0,
                  },
                };
                onRowUpdate(row.id, {
                  geometry: newGeometry,
                });
              }}
            />
            <InputField
              label="Center Y"
              type="number"
              value={Math.round(row.geometry.center.y)}
              onChange={(value) => {
                const newGeometry = {
                  ...row.geometry,
                  center: {
                    ...(row.geometry as ArcGeometry).center,
                    y: parseInt(String(value)) || 0,
                  },
                };
                onRowUpdate(row.id, {
                  geometry: newGeometry,
                });
              }}
            />
            <InputField
              label="Radius X (Major)"
              type="number"
              value={Math.round(row.geometry.radiusX)}
              onChange={(value) => {
                const newGeometry = {
                  ...row.geometry,
                  radiusX: parseInt(String(value)) || 50,
                };
                onRowUpdate(row.id, {
                  geometry: newGeometry,
                });
              }}
              min="10"
            />
            <InputField
              label="Radius Y (Minor)"
              type="number"
              value={Math.round(row.geometry.radiusY)}
              onChange={(value) => {
                const newGeometry = {
                  ...row.geometry,
                  radiusY: parseInt(String(value)) || 50,
                };
                onRowUpdate(row.id, {
                  geometry: newGeometry,
                });
              }}
              min="10"
            />
          </div>

          <div className="text-sm font-medium text-gray-600 mb-2 mt-3">
            Arc Angles (Degrees)
          </div>
          <div className="grid grid-cols-2 gap-2">
            <InputField
              label="Start Angle"
              type="number"
              value={Math.round((row.geometry.startAngle * 180) / Math.PI)}
              onChange={(value) => {
                const angleInRadians = (parseInt(String(value)) || 0) * (Math.PI / 180);
                const newGeometry = {
                  ...row.geometry,
                  startAngle: angleInRadians,
                };
                onRowUpdate(row.id, {
                  geometry: newGeometry,
                });
              }}
              min="-180"
              max="180"
            />
            <InputField
              label="End Angle"
              type="number"
              value={Math.round((row.geometry.endAngle * 180) / Math.PI)}
              onChange={(value) => {
                const angleInRadians = (parseInt(String(value)) || 0) * (Math.PI / 180);
                const newGeometry = {
                  ...row.geometry,
                  endAngle: angleInRadians,
                };
                onRowUpdate(row.id, {
                  geometry: newGeometry,
                });
              }}
              min="-180"
              max="180"
            />
          </div>

          <div className="text-xs text-gray-500 mt-1 mb-3">
            Arc spans{" "}
            {Math.abs(
              Math.round(
                ((row.geometry.endAngle - row.geometry.startAngle) * 180) /
                  Math.PI,
              ),
            )}
            ° (
            {Math.round(
              (((row.geometry.radiusX || row.geometry.radius || 0) +
                (row.geometry.radiusY || row.geometry.radius || 0)) /
                2) *
                Math.abs(row.geometry.endAngle - row.geometry.startAngle),
            )}{" "}
            units)
          </div>

          <div className="text-sm font-medium text-gray-600 mb-2">
            Quick Arc Presets
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                const newGeometry = {
                  ...row.geometry,
                  startAngle: -Math.PI / 4, // -45°
                  endAngle: Math.PI / 4, // 45°
                };
                onRowUpdate(row.id, {
                  geometry: newGeometry,
                });
              }}
              className="px-3 py-2 text-sm bg-blue-100 hover:bg-purple-200 rounded border border-purple-300"
            >
              90° Arc
            </button>
            <button
              onClick={() => {
                const newGeometry = {
                  ...row.geometry,
                  startAngle: -Math.PI / 3, // -60°
                  endAngle: Math.PI / 3, // 60°
                };
                onRowUpdate(row.id, {
                  geometry: newGeometry,
                });
              }}
              className="px-3 py-2 text-sm bg-blue-100 hover:bg-purple-200 rounded border border-purple-300"
            >
              120° Arc
            </button>
            <button
              onClick={() => {
                const newGeometry = {
                  ...row.geometry,
                  startAngle: -Math.PI / 2, // -90°
                  endAngle: Math.PI / 2, // 90°
                };
                onRowUpdate(row.id, {
                  geometry: newGeometry,
                });
              }}
              className="px-3 py-2 text-sm bg-blue-100 hover:bg-purple-200 rounded border border-purple-300"
            >
              180° Arc
            </button>
            <button
              onClick={() => {
                const newGeometry = {
                  ...row.geometry,
                  startAngle: (-2 * Math.PI) / 3, // -120°
                  endAngle: (2 * Math.PI) / 3, // 120°
                };
                onRowUpdate(row.id, {
                  geometry: newGeometry,
                });
              }}
              className="px-3 py-2 text-sm bg-blue-100 hover:bg-purple-200 rounded border border-purple-300"
            >
              240° Arc
            </button>
          </div>
        </>
      )}
    </>
  );

  return (
    <>
      {selectedRows.length > 0 && (
        <PropertySection
          title={`Row Properties ${
            selectedRows.length > 1 ? `(${selectedRows.length})` : ""
          }`}
        >
          {!multipleSelected && selectedRows.length === 1 ? (
            renderSingleRowProperties(selectedRows[0])
          ) : (
            <p className="text-sm text-gray-600">
              Multiple rows selected. Individual properties not available.
            </p>
          )}
        </PropertySection>
      )}

      {selectedRows.length === 0 && inferredRowFromSelectedSeats && (
        <PropertySection title="Row Controls (from selection)">
          {/* <div className="text-xs text-gray-500 mb-2">
            Row:{" "}
            {inferredRowFromSelectedSeats.name ||
              inferredRowFromSelectedSeats.id}
          </div> */}
          <div className="flex items-center justify-between py-1">
            <p className="">Number of seats</p>
            <div className="flex items-center border border-gray-300 rounded-lg px-2 py-1.5 w-32 bg-white">
              <button
                onClick={() =>
                  onRowUpdate(inferredRowFromSelectedSeats.id, {
                    seatCount: Math.max(
                      1,
                      (inferredRowFromSelectedSeats.seatCount || 1) - 1,
                    ),
                  })
                }
                className="text-gray-400 hover:text-gray-600 px-1"
                title="Decrease number of seats"
              >
                <ChevronLeft />
              </button>
              {isEditingSeatCount ? (
                <input
                  type="number"
                  value={tempSeatCount}
                  onChange={(e) => setTempSeatCount(e.target.value)}
                  onBlur={handleSeatCountBlur}
                  onKeyDown={handleSeatCountKeyDown}
                  className="flex-1 text-center text-lg font-normal border-2 border-purple-300 rounded px-1 bg-white [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  min="1"
                  max="100"
                  autoFocus
                />
              ) : (
                <span
                  className="flex-1 text-center text-lg font-normal cursor-pointer hover:bg-gray-100 rounded px-1 "
                  onClick={handleSeatCountClick}
                  title="Click to edit seat count, then press Enter"
                >
                  {inferredRowFromSelectedSeats.seatCount || 1}
                </span>
              )}
              <button
                onClick={() =>
                  onRowUpdate(inferredRowFromSelectedSeats.id, {
                    seatCount: Math.min(
                      100,
                      (inferredRowFromSelectedSeats.seatCount || 1) + 1,
                    ),
                  })
                }
                className="text-gray-400 hover:text-gray-600 px-1"
                title="Increase number of seats"
              >
                <ChevronRight />
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between py-1">
            <p className="">Spacing</p>
            <div className="flex items-center border border-gray-300 rounded-lg px-2 py-1.5 w-32 bg-white">
              <button
                onClick={(e) => {
                  const rowSeatIds = Object.values(scene.seats)
                    .filter((s) => s.rowId === inferredRowFromSelectedSeats.id)
                    .map((s) => s.id);
                  if (rowSeatIds.length >= 2) {
                    // Use smaller increment when Shift is pressed
                    const spacingDelta = e.shiftKey ? -1 : -0.1;
                    onAdjustSeatSpacing(rowSeatIds, spacingDelta);
                  }
                }}
                className="text-gray-400 hover:text-gray-600 px-1"
                title={
                  window.navigator.platform.includes("Mac")
                    ? "Decrease distance (hold Shift for larger steps)"
                    : "Decrease distance (hold Shift for larger steps)"
                }
              >
                <ChevronLeft />
              </button>
              {isEditingSpacing ? (
                <input
                  type="number"
                  value={tempSpacing}
                  onChange={(e) => setTempSpacing(e.target.value)}
                  onBlur={handleSpacingBlur}
                  onKeyDown={handleSpacingKeyDown}
                  className="flex-1 text-center text-lg font-normal border-2 border-purple-300 rounded px-1 bg-white [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  min="20"
                  max="100"
                  step="0.1"
                  autoFocus
                />
              ) : (
                <span
                  className="flex-1 text-center text-lg font-normal cursor-pointer hover:bg-gray-100 rounded px-1"
                  onClick={handleSpacingClick}
                  title="Click to edit spacing, then press Enter"
                >
                  {(inferredRowFromSelectedSeats.spacing || 0).toFixed(1)}
                </span>
              )}
              <button
                onClick={(e) => {
                  const rowSeatIds = Object.values(scene.seats)
                    .filter((s) => s.rowId === inferredRowFromSelectedSeats.id)
                    .map((s) => s.id);
                  if (rowSeatIds.length >= 2) {
                    // Use smaller increment when Shift is pressed
                    const spacingDelta = e.shiftKey ? 1 : 0.1;
                    onAdjustSeatSpacing(rowSeatIds, spacingDelta);
                  }
                }}
                className="text-gray-400 hover:text-gray-600 px-1"
                title={
                  window.navigator.platform.includes("Mac")
                    ? "Increase distance (hold Shift for larger steps)"
                    : "Increase distance (hold Shift for larger steps)"
                }
              >
                <ChevronRight />
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between py-1">
            <p className="">Curve</p>
            <div className="flex items-center border border-gray-300 rounded-lg px-2 py-1.5 w-32 bg-white">
              <button
                onClick={(e) => {
                  const currentCurve = inferredRowFromSelectedSeats.curve || 0;
                  // Use smaller increment when Shift is pressed
                  const curveDelta = e.shiftKey ? -1 : -0.1;
                  const newCurve =
                    Math.round((currentCurve + curveDelta) * 100) / 100;
                  if (newCurve !== currentCurve) {
                    onRowUpdate(inferredRowFromSelectedSeats.id, {
                      curve: newCurve,
                    });
                  }
                }}
                className="text-gray-400 hover:text-gray-600 px-1"
                title={
                  window.navigator.platform.includes("Mac")
                    ? "Decrease curve (hold Shift for larger steps)"
                    : "Decrease curve (hold Shift for larger steps)"
                }
              >
                <ChevronLeft />
              </button>
              {isEditingCurve ? (
                <input
                  type="number"
                  value={tempCurve}
                  onChange={(e) => setTempCurve(e.target.value)}
                  onBlur={handleCurveBlur}
                  onKeyDown={handleCurveKeyDown}
                  className="flex-1 text-center text-lg font-normal border-2 border-purple-300 rounded px-1 bg-white [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  step="0.1"
                  autoFocus
                />
              ) : (
                <span
                  className="flex-1 text-center text-lg font-normal cursor-pointer hover:bg-gray-100 rounded px-1"
                  onClick={handleCurveClick}
                  title="Click to edit curve, then press Enter"
                >
                  {formatCurveValue(inferredRowFromSelectedSeats.curve || 0)}
                </span>
              )}
              <button
                onClick={(e) => {
                  const currentCurve = inferredRowFromSelectedSeats.curve || 0;
                  // Use smaller increment when Shift is pressed
                  const curveDelta = e.shiftKey ? 1 : 0.1;
                  const newCurve =
                    Math.round((currentCurve + curveDelta) * 100) / 100;
                  if (newCurve !== currentCurve) {
                    onRowUpdate(inferredRowFromSelectedSeats.id, {
                      curve: newCurve,
                    });
                  }
                }}
                className="text-gray-400 hover:text-gray-600 px-1"
                title={
                  window.navigator.platform.includes("Mac")
                    ? "Increase curve (hold Shift for larger steps)"
                    : "Increase curve (hold Shift for larger steps)"
                }
              >
                <ChevronRight />
              </button>
            </div>
          </div>
        </PropertySection>
      )}
    </>
  );
};
