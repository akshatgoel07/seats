import React, { useState, useMemo } from "react";
import { RotateCw, RotateCcw } from "lucide-react";
import { PropertySection, InputField, SelectField } from "./UIComponents.tsx";
import type { EditorCategory, EditorScene, EditorSeat } from "../../types.ts";

type SeatUpdate = Record<string, unknown>;
type SeatPropertiesProps = {
  selectedSeats: EditorSeat[];
  multipleSelected: boolean;
  categories: EditorCategory[];
  onSeatUpdate: (id: string, updates: SeatUpdate) => void;
  onSeatsUpdate: (ids: string[], updates: SeatUpdate) => void;
  onAdjustSeatSpacing: (seatIds: string[], delta: number) => void;
  onRotateSelectedSeats: (angle: number) => void;
  scene: EditorScene;
  onRowUpdate: (id: string, updates: SeatUpdate) => void;
};

export const SeatProperties = ({
  selectedSeats,
  multipleSelected,
  categories,
  onSeatUpdate,
  onSeatsUpdate,
  onAdjustSeatSpacing,
  onRotateSelectedSeats,
  scene,
  onRowUpdate,
}: SeatPropertiesProps) => {
  const [bulkWidth, setBulkWidth] = useState("");
  const [bulkHeight, setBulkHeight] = useState("");
  const [bulkRadius, setBulkRadius] = useState("");
  const [rotationAngle, setRotationAngle] = useState(0);
  const [previousRotation, setPreviousRotation] = useState(0);

  const inferredRowFromSelectedSeats = useMemo(() => {
    if (selectedSeats.length === 0) return null;
    const rowIds = Array.from(
      new Set(selectedSeats.map((s) => s.rowId).filter(Boolean)),
    );
    if (rowIds.length === 1) {
      return scene.rows[rowIds[0] as string];
    }
    return null;
  }, [selectedSeats, scene.rows]);

  // Reset the bulk-edit inputs whenever the seat selection changes. Adjusting
  // the state during render (via a previous-value comparison) rather than in an
  // effect means the panel never paints the prior selection's values for a
  // frame before clearing them.
  const selectionKey = selectedSeats.map((s) => s.id).join(",");
  const [prevSelectionKey, setPrevSelectionKey] = useState(selectionKey);
  if (selectionKey !== prevSelectionKey) {
    setPrevSelectionKey(selectionKey);
    setBulkWidth("");
    setBulkHeight("");
    setBulkRadius("");
  }

  // Keep the rotation field in sync with the inferred row's actual rotation.
  // Re-syncing during render avoids the stale-value flash a useEffect would
  // cause when the selection changes or the row is rotated from the canvas.
  const currentRotationDegrees = inferredRowFromSelectedSeats
    ? Math.round(
        ((inferredRowFromSelectedSeats.transform?.rotation || 0) * 180) /
          Math.PI,
      )
    : 0;
  const [prevRotationDegrees, setPrevRotationDegrees] = useState(
    /** @type {number | null} */ (null),
  );
  if (currentRotationDegrees !== prevRotationDegrees) {
    setPrevRotationDegrees(currentRotationDegrees);
    setRotationAngle(currentRotationDegrees);
    setPreviousRotation(currentRotationDegrees);
  }
  const renderSingleSeatProperties = (seat: EditorSeat) => (
    <>
      <InputField
        label="Label"
        value={seat.label}
        onChange={(value) => {
          onSeatUpdate(seat.id, { label: value });
        }}
      />

      <div className="grid grid-cols-2 gap-2">
        <InputField
          label="Width"
          type="number"
          value={seat.width}
          onChange={(value) => {
            onSeatUpdate(seat.id, {
              width: parseInt(String(value)) || 30,
            });
          }}
          min="10"
          max="60"
        />
        <InputField
          label="Height"
          type="number"
          value={seat.height}
          onChange={(value) => {
            onSeatUpdate(seat.id, {
              height: parseInt(String(value)) || 30,
            });
          }}
          min="10"
          max="60"
        />
      </div>

      <InputField
        label="Corner Radius (Curve)"
        type="number"
        value={seat.radius}
        onChange={(value) => {
          onSeatUpdate(seat.id, {
            radius: parseInt(String(value)) || 0,
          });
        }}
        min="0"
        max="30"
        step="1"
      />

      <div className="grid grid-cols-2 gap-2">
        <InputField
          label="X Position"
          type="number"
          value={Math.round(seat.localX)}
          onChange={(value) => {
            onSeatUpdate(seat.id, {
              localX: parseInt(String(value)) || 0,
            });
          }}
        />
        <InputField
          label="Y Position"
          type="number"
          value={Math.round(seat.localY)}
          onChange={(value) => {
            onSeatUpdate(seat.id, {
              localY: parseInt(String(value)) || 0,
            });
          }}
        />
      </div>

      <SelectField
        label="Category"
        value={seat.categoryId}
        onChange={(value) => {
          onSeatUpdate(seat.id, {
            categoryId: value,
          });
        }}
        options={categories.map((cat) => ({
          value: cat.id,
          label: cat.name,
        }))}
      />
    </>
  );

  const renderBulkSeatProperties = () => (
    <>
      {/* <p className="text-sm text-gray-600 mb-3">
        {selectedSeats.length} seats selected. Changes will apply to all
        selected seats.
      </p> */}

      {/* <div className="mb-4">
        <label className="block text-sm font-medium text-gray-600 mb-2">
          Adjust Spacing
        </label>
        <div className="flex gap-2">
          <button
            onClick={() => {
              onAdjustSeatSpacing(
                selectedSeats.map((s) => s.id),
                -0.5,
              );
            }}
            className="flex-1 px-3 py-2 bg-purple text-white rounded-md hover:bg-purple-700 transition-colors flex items-center justify-center"
            style={{backgroundColor: '#8d6fbf'}}
            title="Decrease spacing"
          >
            <span className="text-lg font-bold">-</span>
          </button>
          <button
            onClick={() => {
              onAdjustSeatSpacing(
                selectedSeats.map((s) => s.id),
                0.5,
              );
            }}
            className="flex-1 px-3 py-2 bg-purple text-white rounded-md hover:bg-purple-700 transition-colors flex items-center justify-center"
            style={{backgroundColor: '#8d6fbf'}}
            title="Increase spacing"
          >
            <span className="text-lg font-bold">+</span>
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Adjust spacing between selected seats
        </p>
      </div> */}

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-600 mb-2">
          Rotate Group
        </label>

        {/* Fixed angle rotation buttons */}
        <div className="grid grid-cols-2 gap-2 mb-2">
          <button
            onClick={() => {
              if (inferredRowFromSelectedSeats && onRowUpdate) {
                const row = inferredRowFromSelectedSeats;
                const currentRotation = row.transform?.rotation || 0;
                const newRotation = currentRotation - Math.PI / 12;
                onRowUpdate(row.id, {
                  transform: {
                    ...row.transform,
                    rotation: newRotation,
                  },
                });
              } else {
                onRotateSelectedSeats(-Math.PI / 12);
              }
            }}
            className="px-3 py-2 bg-purple text-white rounded-md hover:bg-purple-700 transition-colors flex items-center justify-center gap-1"
            style={{ backgroundColor: "#8d6fbf" }}
            title="Rotate counter-clockwise 15 degrees"
          >
            <RotateCcw className="w-5 h-5" />
            <span className="text-sm">15°</span>
          </button>
          <button
            onClick={() => {
              if (inferredRowFromSelectedSeats && onRowUpdate) {
                const row = inferredRowFromSelectedSeats;
                const currentRotation = row.transform?.rotation || 0;
                const newRotation = currentRotation + Math.PI / 12;
                onRowUpdate(row.id, {
                  transform: {
                    ...row.transform,
                    rotation: newRotation,
                  },
                });
              } else {
                onRotateSelectedSeats(Math.PI / 12);
              }
            }}
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
            onClick={() => {
              if (inferredRowFromSelectedSeats && onRowUpdate) {
                const row = inferredRowFromSelectedSeats;
                const currentRotation = row.transform?.rotation || 0;
                const newRotation = currentRotation - Math.PI / 4;
                onRowUpdate(row.id, {
                  transform: {
                    ...row.transform,
                    rotation: newRotation,
                  },
                });
              } else {
                onRotateSelectedSeats(-Math.PI / 4);
              }
            }}
            className="px-3 py-2 bg-purple text-white rounded-md hover:bg-purple-700 transition-colors flex items-center justify-center gap-1"
            style={{ backgroundColor: "#8d6fbf" }}
            title="Rotate counter-clockwise 45 degrees"
          >
            <RotateCcw className="w-5 h-5" />
            <span className="text-sm">45°</span>
          </button>
          <button
            onClick={() => {
              if (inferredRowFromSelectedSeats && onRowUpdate) {
                const row = inferredRowFromSelectedSeats;
                const currentRotation = row.transform?.rotation || 0;
                const newRotation = currentRotation + Math.PI / 4;
                onRowUpdate(row.id, {
                  transform: {
                    ...row.transform,
                    rotation: newRotation,
                  },
                });
              } else {
                onRotateSelectedSeats(Math.PI / 4);
              }
            }}
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
                const oldValue = rotationAngle;
                setRotationAngle(newValue);
                setPreviousRotation(newValue);
                if (inferredRowFromSelectedSeats && onRowUpdate) {
                  const row = inferredRowFromSelectedSeats;
                  const radians = (newValue * Math.PI) / 180;
                  onRowUpdate(row.id, {
                    transform: {
                      ...row.transform,
                      rotation: radians,
                    },
                  });
                } else {
                  const delta = newValue - oldValue;
                  onRotateSelectedSeats((delta * Math.PI) / 180);
                }
              }}
              className="w-20 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              min="-360"
              max="360"
              step="1"
            />
            <span className="text-xs text-gray-600">degrees</span>
            <button
              onClick={() => {
                if (inferredRowFromSelectedSeats && onRowUpdate) {
                  const row = inferredRowFromSelectedSeats;
                  onRowUpdate(row.id, {
                    transform: {
                      ...row.transform,
                      rotation: 0,
                    },
                  });
                  setRotationAngle(0);
                  setPreviousRotation(0);
                } else if (rotationAngle !== 0) {
                  onRotateSelectedSeats((-rotationAngle * Math.PI) / 180);
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
                const oldValue = rotationAngle;
                setRotationAngle(newValue);
                setPreviousRotation(newValue);
                if (inferredRowFromSelectedSeats && onRowUpdate) {
                  const row = inferredRowFromSelectedSeats;
                  const radians = (newValue * Math.PI) / 180;
                  onRowUpdate(row.id, {
                    transform: {
                      ...row.transform,
                      rotation: radians,
                    },
                  });
                } else {
                  const delta = newValue - oldValue;
                  onRotateSelectedSeats((delta * Math.PI) / 180);
                }
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

        <p className="text-xs text-gray-500 mt-2">
          Use buttons for quick rotation or set custom angle ([, ] keys)
        </p>
      </div>

      <SelectField
        label="Category"
        value=""
        onChange={(value) => {
          if (value) {
            onSeatsUpdate(
              selectedSeats.map((s) => s.id),
              { categoryId: value },
            );
          }
        }}
        options={[
          { value: "", label: "Select category..." },
          ...categories.map((cat) => ({
            value: cat.id,
            label: cat.name,
          })),
        ]}
      />

      <div className="grid grid-cols-2 gap-2">
        <InputField
          label="Seat Width"
          type="number"
          value={bulkWidth}
          onChange={(value) => {
            setBulkWidth(String(value));
            if (value) {
              onSeatsUpdate(
                selectedSeats.map((s) => s.id),
                { width: parseInt(String(value)) || 30 },
              );
            }
          }}
          min="10"
          max="60"
          placeholder="Set width..."
        />
        <InputField
          label="Seat Height"
          type="number"
          value={bulkHeight}
          onChange={(value) => {
            setBulkHeight(String(value));
            if (value) {
              onSeatsUpdate(
                selectedSeats.map((s) => s.id),
                { height: parseInt(String(value)) || 30 },
              );
            }
          }}
          min="10"
          max="60"
          placeholder="Set height..."
        />
      </div>

      {inferredRowFromSelectedSeats && (
        <InputField
          label="Seat Spacing"
          type="number"
          value={inferredRowFromSelectedSeats.spacing || ""}
          onChange={(value) => {
            if (value) {
              const spacingValue = parseFloat(String(value)) || 7.0;
              const currentSpacing = inferredRowFromSelectedSeats.spacing || 7.0;
              const delta = spacingValue - currentSpacing;
              if (delta !== 0) {
                onAdjustSeatSpacing(
                  selectedSeats.map((s) => s.id),
                  delta,
                );
              }
            }
          }}
          min="1"
          max="50"
          step="0.1"
          placeholder="Set spacing..."
        />
      )}

      {inferredRowFromSelectedSeats && (
        <InputField
          label="Row Spacing"
          type="number"
          value={inferredRowFromSelectedSeats.rowSpacing || ""}
          onChange={(value) => {
            if (value && onRowUpdate) {
              onRowUpdate(inferredRowFromSelectedSeats.id, {
                rowSpacing: parseInt(String(value)) || 30,
              });
            }
          }}
          min="10"
          max="200"
          placeholder="Set row spacing..."
        />
      )}
    </>
  );

  return (
    <PropertySection
      title={`Seat Properties ${
        selectedSeats.length > 1 ? `(${selectedSeats.length})` : ""
      }`}
    >
      {!multipleSelected && selectedSeats.length === 1
        ? renderSingleSeatProperties(selectedSeats[0])
        : renderBulkSeatProperties()}
    </PropertySection>
  );
};
