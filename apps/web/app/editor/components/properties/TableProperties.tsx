import React, { useState } from "react";
import {
  PropertySection,
  InputField,
  SelectField,
  ColorPicker,
} from "./UIComponents.tsx";
import { Lock, Unlock } from "lucide-react";
import type { EditorCategory, EditorElement, EditorSeat } from "../../types.ts";

type LooseTable = EditorElement & Record<string, any>;
type TablePropertiesProps = {
  table: LooseTable;
  seats: EditorSeat[];
  categories: EditorCategory[];
  onTableUpdate: (id: string, updates: Record<string, unknown>) => void;
  onSeatsUpdate: (ids: string[], updates: Record<string, unknown>) => void;
  onUpdateTableGroup: (
    table: LooseTable,
    oldSeats: EditorSeat[],
    config: Record<string, unknown>,
  ) => void;
};

export const TableProperties = ({
  table,
  seats,
  categories,
  onTableUpdate,
  onSeatsUpdate,
  onUpdateTableGroup,
}: TablePropertiesProps) => {
  // Calculate current properties from table and seats
  const currentSeatCount = seats.length;
  const currentTableRadius = table.radius || 30;

  // Calculate seat radius (distance from table center to seat center)
  const currentSeatRadius =
    seats.length > 0
      ? Math.sqrt(
          Math.pow(seats[0].localX - table.x, 2) +
            Math.pow(seats[0].localY - table.y, 2),
        )
      : 39;

  // Get current category (assuming all seats have same category)
  const defaultCategoryId =
    categories.length > 0 ? categories[0].id : "default";
  const currentCategoryId =
    seats.length > 0
      ? seats[0].categoryId === "default"
        ? defaultCategoryId
        : seats[0].categoryId
      : defaultCategoryId;

  // State for proportional lock
  const [isRadiusLocked, setIsRadiusLocked] = useState(false);

  // Calculate the ratio when lock is enabled
  const radiusRatio =
    isRadiusLocked && currentTableRadius > 0
      ? currentSeatRadius / currentTableRadius
      : null;

  return (
    <PropertySection title="Table & Seats Properties">
      <InputField
        label="Table Label"
        value={table.label || ""}
        onChange={(value) => {
          onTableUpdate(table.id, { label: value });
        }}
        placeholder="e.g., A-1"
      />

      <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
        <div className="text-sm font-medium text-blue-800 mb-1">
          Table Configuration
        </div>
        <div className="text-xs text-blue-600">
          Table with {currentSeatCount} seats around it
          <br />
          Click &quot;Update Table&quot; to apply changes
        </div>
      </div>

      <InputField
        label="Number of Seats"
        type="number"
        value={currentSeatCount}
        onChange={(value) => {
          const newSeatCount = Math.max(2, Math.min(20, parseInt(String(value)) || 10));
          onUpdateTableGroup(table, seats, {
            seatCount: newSeatCount,
            tableRadius: currentTableRadius,
            seatRadius: currentSeatRadius,
            categoryId: currentCategoryId,
          });
        }}
        min="2"
        max="20"
        title="Number of seats around the table"
      />

      <div className="flex items-end gap-2 mb-2">
        <div className="flex-1">
          <label className="text-sm font-medium text-gray-700 mb-1 block">
            Table Radius
          </label>
          <input
            type="number"
            min="10"
            max="100"
            value={Math.round(currentTableRadius)}
            onClick={(e) => e.currentTarget.select()}
            onChange={(e) => {
              const newTableRadius = Math.max(
                10,
                parseInt(e.target.value) || 30,
              );
              let newSeatRadius = currentSeatRadius;

              if (isRadiusLocked && radiusRatio) {
                newSeatRadius = Math.round(newTableRadius * radiusRatio);
              }

              onUpdateTableGroup(table, seats, {
                seatCount: currentSeatCount,
                tableRadius: newTableRadius,
                seatRadius: newSeatRadius,
                categoryId: currentCategoryId,
              });
            }}
            title="Radius of the table circle"
            className="border rounded-md placeholder:text-gray-400 selection:bg-[var(--color-primary-blue)] selection:text-white border-gray-300 h-9 w-full min-w-0 bg-white px-3 py-1 text-base shadow-sm transition-all outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus:border-[var(--color-primary-blue)] focus:ring-[var(--color-primary-blue)]/30 focus:ring-[3px] aria-invalid:ring-red-500/20 aria-invalid:border-red-500"
          />
        </div>
        <button
          onClick={() => setIsRadiusLocked(!isRadiusLocked)}
          className={`p-2 rounded-md transition-colors ${
            isRadiusLocked
              ? "bg-blue-100 text-blue-600 hover:bg-blue-200"
              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
          }`}
          title={
            isRadiusLocked ? "Unlock radii proportion" : "Lock radii proportion"
          }
        >
          {isRadiusLocked ? <Lock size={16} /> : <Unlock size={16} />}
        </button>
      </div>

      <InputField
        label="Seat Radius"
        type="number"
        value={Math.round(currentSeatRadius)}
        onChange={(value) => {
          const newSeatRadius = Math.max(20, parseInt(String(value)) || 39);
          let newTableRadius = currentTableRadius;

          if (isRadiusLocked && radiusRatio && currentTableRadius > 0) {
            newTableRadius = Math.round(newSeatRadius / radiusRatio);
          }

          onUpdateTableGroup(table, seats, {
            seatCount: currentSeatCount,
            tableRadius: newTableRadius,
            seatRadius: newSeatRadius,
            categoryId: currentCategoryId,
          });
        }}
        min="20"
        max="100"
        title="Distance from table center to seat centers"
      />

      <SelectField
        label="Seat Category"
        value={currentCategoryId}
        onChange={(value) => {
          // Update all seats with the new category
          const seatIds = seats.map((s) => s.id);
          onSeatsUpdate(seatIds, { categoryId: value });
        }}
        options={[
          ...categories.map((category) => ({
            value: category.id,
            label: `${category.name} (${category.color})`,
          })),
        ]}
      />

      <div className="grid grid-cols-2 gap-2">
        <ColorPicker
          label="Table Fill Color"
          value={table.fillColor || "#f0f0f0"}
          onChange={(value) => {
            onTableUpdate(table.id, { fillColor: value });
          }}
        />
        <ColorPicker
          label="Table Stroke Color"
          value={table.strokeColor || "#333333"}
          onChange={(value) => {
            onTableUpdate(table.id, { strokeColor: value });
          }}
        />
      </div>

      <InputField
        label="Table Stroke Width"
        type="number"
        value={table.strokeWidth || 2}
        onChange={(value) => {
          onTableUpdate(table.id, {
            strokeWidth: Math.max(1, Math.min(10, parseInt(String(value)) || 2)),
          });
        }}
        min="1"
        max="10"
      />

      <div className="grid grid-cols-2 gap-2">
        <InputField
          label="X Position"
          type="number"
          value={Math.round(table.x)}
          onChange={(value) => {
            const deltaX = parseInt(String(value)) - table.x;
            // Move table
            onTableUpdate(table.id, { x: parseInt(String(value)) });
            // Move all seats by the same delta
            seats.forEach((seat) => {
              onSeatsUpdate([seat.id], {
                localX: seat.localX + deltaX,
              });
            });
          }}
        />
        <InputField
          label="Y Position"
          type="number"
          value={Math.round(table.y)}
          onChange={(value) => {
            const deltaY = parseInt(String(value)) - table.y;
            // Move table
            onTableUpdate(table.id, { y: parseInt(String(value)) });
            // Move all seats by the same delta
            seats.forEach((seat) => {
              onSeatsUpdate([seat.id], {
                localY: seat.localY + deltaY,
              });
            });
          }}
        />
      </div>
    </PropertySection>
  );
};
