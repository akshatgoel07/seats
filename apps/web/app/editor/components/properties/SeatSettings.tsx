"use client";

import React from "react";
import { SelectField } from "./UIComponents.tsx";
import { Lock, Unlock } from "lucide-react";

/**
 * @param {{ label?: any, value?: any, onChange?: Function, min?: number|string, max?: number|string, step?: number|string, parseFn?: Function, defaultValue?: any, labelClassName?: string, isLocked?: boolean, onToggleLock?: React.MouseEventHandler<HTMLButtonElement>, showLock?: boolean }} props
 */
const SeatSettingInput = ({
  label,
  value,
  onChange,
  min,
  max,
  step,
  parseFn,
  defaultValue,
  labelClassName = "text-gray-700",
  isLocked,
  onToggleLock,
  showLock = false,
}: any) => {
  return (
    <>
      <label
        className={`text-sm font-medium whitespace-nowrap ${labelClassName}`}
      >
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onClick={(e) => /** @type {HTMLInputElement} */ (e.target).select()}
          onChange={(e) => onChange?.(parseFn?.(e.target.value) || defaultValue)}
          className="border rounded-md placeholder:text-gray-400 selection:bg-[var(--color-primary-blue)] selection:text-white border-gray-300 h-9 w-full min-w-0 bg-white px-3 py-1 text-base shadow-sm transition-all outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus:border-[var(--color-primary-blue)] focus:ring-[var(--color-primary-blue)]/30 focus:ring-[3px] aria-invalid:ring-red-500/20 aria-invalid:border-red-500"
        />
        {showLock && (
          <button
            onClick={onToggleLock}
            className={`p-2 rounded-md transition-colors ${
              isLocked
                ? "bg-blue-100 text-blue-600 hover:bg-blue-200"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
            title={isLocked ? "Unlock" : "Lock"}
          >
            {isLocked ? <Lock size={16} /> : <Unlock size={16} />}
          </button>
        )}
      </div>
    </>
  );
};

export const SeatSettings = ({
  globalSettings,
  onUpdateGlobalSettings,
  categories = [],
}) => {
  return (
    <div className="p-4">
      <h3 className="text-md font-semibold text-gray-800 mb-4">
        Seat Settings
      </h3>

      {categories.length > 0 && (
        <>
          <SelectField
            label="Seat Category"
            value={
              globalSettings.categoryId ||
              globalSettings.defaultCategoryId ||
              categories[0]?.id
            }
            onChange={(value) => {
              onUpdateGlobalSettings({
                categoryId: value,
              });
            }}
            options={[
              ...categories.map((category) => ({
                value: category.id,
                label: `${category.name} (${category.color})`,
              })),
            ]}
          />
        </>
      )}

      <div className="grid grid-cols-2 gap-x-3 gap-y-4">
        <div className="flex flex-col gap-1">
          <SeatSettingInput
            label="Seat Width"
            value={globalSettings.seatWidth}
            onChange={(value) =>
              onUpdateGlobalSettings({
                seatWidth: value,
              })
            }
            min="10"
            max="100"
            parseFn={parseInt}
            defaultValue={20}
            labelClassName="text-black"
          />
        </div>

        <div className="flex flex-col gap-1">
          <SeatSettingInput
            label="Seat Height"
            value={globalSettings.seatHeight}
            onChange={(value) =>
              onUpdateGlobalSettings({
                seatHeight: value,
              })
            }
            min="10"
            max="100"
            parseFn={parseInt}
            defaultValue={20}
          />
        </div>

        <div className="flex flex-col gap-1">
          <SeatSettingInput
            label="Seat Spacing"
            value={globalSettings.seatSpacing}
            onChange={(value) =>
              onUpdateGlobalSettings({
                seatSpacing: value,
              })
            }
            min="1"
            max="50"
            step="0.1"
            parseFn={parseFloat}
            defaultValue={7}
            showLock={true}
            isLocked={globalSettings.seatSpacingLocked}
            onToggleLock={() =>
              onUpdateGlobalSettings({
                seatSpacingLocked: !globalSettings.seatSpacingLocked,
              })
            }
          />
        </div>

        <div className="flex flex-col gap-1">
          <SeatSettingInput
            label="Row Spacing"
            value={globalSettings.rowSpacing}
            onChange={(value) =>
              onUpdateGlobalSettings({
                rowSpacing: value,
              })
            }
            min="10"
            max="200"
            parseFn={parseInt}
            defaultValue={30}
          />
        </div>

        <div className="flex flex-col gap-1">
          <SeatSettingInput
            label="Default Seat Count"
            value={globalSettings.defaultSeatCount}
            onChange={(value) =>
              onUpdateGlobalSettings({
                defaultSeatCount: value,
              })
            }
            min="1"
            max="100"
            parseFn={parseInt}
            defaultValue={10}
            showLock={true}
            isLocked={globalSettings.seatCountLocked}
            onToggleLock={() =>
              onUpdateGlobalSettings({
                seatCountLocked: !globalSettings.seatCountLocked,
              })
            }
          />
        </div>
      </div>
    </div>
  );
};
