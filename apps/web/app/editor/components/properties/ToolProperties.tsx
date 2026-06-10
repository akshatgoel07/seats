"use client";

import React from "react";
import {
  PropertySection,
  InputField,
  SelectField,
  ColorPicker,
} from "./UIComponents.tsx";
import { TOOL_TYPES } from "../../types.ts";
import { ImageDropZone } from "../ImageDropZone.tsx";
import { Lock, Unlock } from "lucide-react";

export const ToolProperties = ({
  currentTool,
  toolSettings,
  categories,
  onToolSettingsUpdate,
  globalSettings,
  onUpdateGlobalSettings,
  actions,
}) => {
  if (!currentTool) {
    return null;
  }

  const settings = toolSettings[currentTool] || {};

  const renderTextToolProperties = () => (
    <PropertySection title="Text Tool Properties">
      <InputField
        label="Text Content"
        value={settings.text || "Text"}
        onChange={(value) => {
          onToolSettingsUpdate(currentTool, { text: value });
        }}
        placeholder="Enter default text content..."
      />

      <div className="grid grid-cols-2 gap-2">
        <InputField
          label="Font Size"
          type="number"
          value={settings.fontSize || 16}
          onChange={(value) => {
            onToolSettingsUpdate(currentTool, {
              fontSize: value,
            });
          }}
          min="8"
          max="72"
        />
        <SelectField
          label="Font Weight"
          value={settings.fontWeight || "normal"}
          onChange={(value) => {
            onToolSettingsUpdate(currentTool, { fontWeight: value });
          }}
          options={[
            { value: "normal", label: "Normal" },
            { value: "bold", label: "Bold" },
            { value: "lighter", label: "Light" },
          ]}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <SelectField
          label="Font Family"
          value={settings.fontFamily || "Arial"}
          onChange={(value) => {
            onToolSettingsUpdate(currentTool, { fontFamily: value });
          }}
          options={[
            { value: "Arial", label: "Arial" },
            { value: "Times New Roman", label: "Times" },
            { value: "Courier New", label: "Courier" },
            { value: "Georgia", label: "Georgia" },
            { value: "Verdana", label: "Verdana" },
          ]}
        />
        <SelectField
          label="Text Align"
          value={settings.textAlign || "center"}
          onChange={(value) => {
            onToolSettingsUpdate(currentTool, { textAlign: value });
          }}
          options={[
            { value: "left", label: "Left" },
            { value: "center", label: "Center" },
            { value: "right", label: "Right" },
          ]}
        />
      </div>

      <ColorPicker
        label="Text Color"
        value={settings.fillColor || "#000000"}
        onChange={(value) => {
          onToolSettingsUpdate(currentTool, { fillColor: value });
        }}
      />
    </PropertySection>
  );

  const renderCircleToolProperties = () => (
    <PropertySection title="Circle Tool Properties">
      <InputField
        label="Radius"
        type="number"
        value={settings.radius || 25}
        onChange={(value) => {
          onToolSettingsUpdate(currentTool, { radius: parseInt(value) || 25 });
        }}
        min="5"
      />

      <div className="grid grid-cols-2 gap-2">
        <ColorPicker
          label="Fill Color"
          value={settings.fillColor || "#f0f0f0"}
          onChange={(value) => {
            onToolSettingsUpdate(currentTool, { fillColor: value });
          }}
        />
        <ColorPicker
          label="Stroke Color"
          value={settings.strokeColor || "#333333"}
          onChange={(value) => {
            onToolSettingsUpdate(currentTool, { strokeColor: value });
          }}
        />
      </div>

      <InputField
        label="Stroke Width"
        type="number"
        value={settings.strokeWidth || 2}
        onChange={(value) => {
          onToolSettingsUpdate(currentTool, {
            strokeWidth: parseInt(value) || 1,
          });
        }}
        min="1"
        max="10"
      />
    </PropertySection>
  );

  const renderRectangleToolProperties = () => (
    <PropertySection title="Rectangle Tool Properties">
      <div className="grid grid-cols-2 gap-2">
        <InputField
          label="Width"
          type="number"
          value={settings.width || 100}
          onChange={(value) => {
            onToolSettingsUpdate(currentTool, {
              width: parseInt(value) || 100,
            });
          }}
          min="10"
        />
        <InputField
          label="Height"
          type="number"
          value={settings.height || 80}
          onChange={(value) => {
            onToolSettingsUpdate(currentTool, {
              height: parseInt(value) || 80,
            });
          }}
          min="10"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <ColorPicker
          label="Fill Color"
          value={settings.fillColor || "#dbeafe"}
          onChange={(value) => {
            onToolSettingsUpdate(currentTool, { fillColor: value });
          }}
        />

        <ColorPicker
          label="Stroke Color"
          value={settings.strokeColor || "#3b82f6"}
          onChange={(value) => {
            onToolSettingsUpdate(currentTool, { strokeColor: value });
          }}
        />
      </div>

      <InputField
        label="Stroke Width"
        type="number"
        value={settings.strokeWidth || 2}
        onChange={(value) => {
          onToolSettingsUpdate(currentTool, {
            strokeWidth: parseInt(value) || 1,
          });
        }}
        min="1"
        max="10"
      />

      <InputField
        label="Rotation (degrees)"
        type="number"
        value={Math.round((settings.rotation || 0) * (180 / Math.PI))}
        onChange={(value) => {
          const radians = (parseInt(value) || 0) * (Math.PI / 180);
          onToolSettingsUpdate(currentTool, { rotation: radians });
        }}
        min="-180"
        max="180"
      />
    </PropertySection>
  );

  const renderPathToolProperties = () => (
    <PropertySection title="Path Tool Properties">
      <ColorPicker
        label="Stroke Color"
        value={settings.strokeColor || "#333333"}
        onChange={(value) => {
          onToolSettingsUpdate(currentTool, { strokeColor: value });
        }}
      />

      <InputField
        label="Stroke Width"
        type="number"
        value={settings.strokeWidth || 2}
        onChange={(value) => {
          onToolSettingsUpdate(currentTool, {
            strokeWidth: parseInt(value) || 1,
          });
        }}
        min="1"
        max="10"
      />

      <InputField
        label="Opacity"
        type="number"
        value={settings.opacity || 1.0}
        onChange={(value) => {
          onToolSettingsUpdate(currentTool, {
            opacity: Math.max(0, Math.min(1, parseFloat(value) || 1)),
          });
        }}
        min="0"
        max="1"
        step="0.1"
      />
    </PropertySection>
  );

  const renderRowToolProperties = (toolType) => {
    const isLineRow = toolType === TOOL_TYPES.ROW_LINE;
    const isMultiRow = toolType === TOOL_TYPES.MULTI_ROW;

    const defaultCategoryId =
      categories.length > 0 ? categories[0].id : "default";
    const currentCategoryId = globalSettings?.categoryId || defaultCategoryId;
    const currentSeatCount = globalSettings?.defaultSeatCount || 10;
    const currentSeatSpacing = globalSettings?.seatSpacing || 7.0;
    const currentRowSpacing =
      settings.rowSpacing || globalSettings?.rowSpacing || 30;
    const currentSeatWidth = globalSettings?.seatWidth || 20;
    const currentSeatHeight = globalSettings?.seatHeight || 20;
    const isSeatCountLocked = globalSettings?.seatCountLocked || false;
    const isSeatSpacingLocked = globalSettings?.seatSpacingLocked || false;

    const title = isMultiRow
      ? "Multi-Row Tool Properties"
      : `${isLineRow ? "Line" : "Arc"} Row Tool Properties`;

    return (
      <PropertySection title={title}>
        <SelectField
          label="Seat Category"
          value={currentCategoryId}
          onChange={(value) => {
            onToolSettingsUpdate(currentTool, { categoryId: value });
            onUpdateGlobalSettings({ categoryId: value });
          }}
          options={[
            ...categories.map((category) => ({
              value: category.id,
              label: `${category.name} (${category.color})`,
            })),
          ]}
        />
        <div
          className={`grid ${
            isMultiRow ? "grid-cols-1" : "grid-cols-2"
          } gap-x-3 gap-y-4 mb-2`}
        >
          {!isMultiRow && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium whitespace-nowrap text-gray-700">
                Seat Count
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={currentSeatCount}
                  onClick={(e) => /** @type {HTMLInputElement} */ (e.target).select()}
                  onChange={(e) => {
                    const parsedValue = parseInt(e.target.value) || 10;
                    onToolSettingsUpdate(currentTool, {
                      seatCount: parsedValue,
                    });
                    onUpdateGlobalSettings({ defaultSeatCount: parsedValue });
                  }}
                  className="border rounded-md placeholder:text-gray-400 selection:bg-[var(--color-primary-blue)] selection:text-white border-gray-300 h-9 w-full min-w-0 bg-white px-3 py-1 text-base shadow-sm transition-all outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus:border-[var(--color-primary-blue)] focus:ring-[var(--color-primary-blue)]/30 focus:ring-[3px] aria-invalid:ring-red-500/20 aria-invalid:border-red-500"
                />
                <button
                  onClick={() =>
                    onUpdateGlobalSettings({
                      seatCountLocked: !isSeatCountLocked,
                    })
                  }
                  className={`p-2 rounded-md transition-colors ${
                    isSeatCountLocked
                      ? "bg-blue-100 text-blue-600 hover:bg-blue-200"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                  title={isSeatCountLocked ? "Unlock" : "Lock"}
                >
                  {isSeatCountLocked ? (
                    <Lock size={16} />
                  ) : (
                    <Unlock size={16} />
                  )}
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium whitespace-nowrap text-gray-700">
              Seat Spacing
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                max="50"
                step="0.1"
                value={currentSeatSpacing}
                onClick={(e) => /** @type {HTMLInputElement} */ (e.target).select()}
                onChange={(e) => {
                  const parsedValue = parseFloat(e.target.value) || 7.0;
                  onToolSettingsUpdate(currentTool, {
                    seatSpacing: parsedValue,
                  });
                  onUpdateGlobalSettings({ seatSpacing: parsedValue });
                }}
                className="border rounded-md placeholder:text-gray-400 selection:bg-[var(--color-primary-blue)] selection:text-white border-gray-300 h-9 w-full min-w-0 bg-white px-3 py-1 text-base shadow-sm transition-all outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus:border-[var(--color-primary-blue)] focus:ring-[var(--color-primary-blue)]/30 focus:ring-[3px] aria-invalid:ring-red-500/20 aria-invalid:border-red-500"
              />
              <button
                onClick={() =>
                  onUpdateGlobalSettings({
                    seatSpacingLocked: !isSeatSpacingLocked,
                  })
                }
                className={`p-2 rounded-md transition-colors ${
                  isSeatSpacingLocked
                    ? "bg-blue-100 text-blue-600 hover:bg-blue-200"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
                title={isSeatSpacingLocked ? "Unlock" : "Lock"}
              >
                {isSeatSpacingLocked ? (
                  <Lock size={16} />
                ) : (
                  <Unlock size={16} />
                )}
              </button>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <InputField
            label="Seat Width"
            type="number"
            value={currentSeatWidth}
            onChange={(value) => {
              const parsedValue = parseInt(value) || 20;
              onToolSettingsUpdate(currentTool, { seatWidth: parsedValue });
              onUpdateGlobalSettings({ seatWidth: parsedValue });
            }}
            min="5"
            max="100"
          />
          <InputField
            label="Seat Height"
            type="number"
            value={currentSeatHeight}
            onChange={(value) => {
              const parsedValue = parseInt(value) || 20;
              onToolSettingsUpdate(currentTool, { seatHeight: parsedValue });
              onUpdateGlobalSettings({ seatHeight: parsedValue });
            }}
            min="5"
            max="100"
          />
        </div>

        {isMultiRow && (
          <InputField
            label="Row Spacing"
            type="number"
            value={currentRowSpacing}
            onChange={(value) => {
              const parsedValue = parseInt(value) || 30;
              onToolSettingsUpdate(currentTool, {
                rowSpacing: parsedValue,
              });
              onUpdateGlobalSettings({ rowSpacing: parsedValue });
            }}
            min="10"
            max="200"
          />
        )}
      </PropertySection>
    );
  };

  const renderSeatToolProperties = () => {
    const defaultCategoryId =
      categories.length > 0 ? categories[0].id : "default";
    const currentCategoryId =
      settings.categoryId || globalSettings?.categoryId || defaultCategoryId;
    const currentSeatSpacing =
      settings.seatSpacing || globalSettings?.seatSpacing || 7.0;
    const currentRowSpacing =
      settings.rowSpacing || globalSettings?.rowSpacing || 30;
    const currentSeatWidth =
      settings.width || settings.seatWidth || globalSettings?.seatWidth || 20;
    const currentSeatHeight =
      settings.height ||
      settings.seatHeight ||
      globalSettings?.seatHeight ||
      20;

    return (
      <PropertySection title="Seat Tool Properties">
        <SelectField
          label="Category"
          value={currentCategoryId}
          onChange={(value) => {
            onToolSettingsUpdate(currentTool, { categoryId: value });
            onUpdateGlobalSettings({ categoryId: value });
          }}
          options={[
            ...categories.map((category) => ({
              value: category.id,
              label: `${category.name} (${category.color})`,
            })),
          ]}
        />

        <div className="grid grid-cols-2 gap-2">
          <InputField
            label="Seat Width"
            type="number"
            value={currentSeatWidth}
            onChange={(value) => {
              const parsedValue = parseInt(value) || 20;
              onToolSettingsUpdate(currentTool, {
                width: parsedValue,
                seatWidth: parsedValue,
              });
              onUpdateGlobalSettings({ seatWidth: parsedValue });
            }}
            min="5"
            max="100"
          />
          <InputField
            label="Seat Height"
            type="number"
            value={currentSeatHeight}
            onChange={(value) => {
              const parsedValue = parseInt(value) || 20;
              onToolSettingsUpdate(currentTool, {
                height: parsedValue,
                seatHeight: parsedValue,
              });
              onUpdateGlobalSettings({ seatHeight: parsedValue });
            }}
            min="5"
            max="100"
          />
        </div>

        <InputField
          label="Seat Spacing"
          type="number"
          value={currentSeatSpacing}
          onChange={(value) => {
            const parsedValue = parseFloat(value) || 7.0;
            onToolSettingsUpdate(currentTool, {
              seatSpacing: parsedValue,
            });
            onUpdateGlobalSettings({ seatSpacing: parsedValue });
          }}
          min="1"
          max="50"
          step="0.1"
        />

        <InputField
          label="Row Spacing"
          type="number"
          value={currentRowSpacing}
          onChange={(value) => {
            const parsedValue = parseInt(value) || 30;
            onToolSettingsUpdate(currentTool, {
              rowSpacing: parsedValue,
            });
            onUpdateGlobalSettings({ rowSpacing: parsedValue });
          }}
          min="10"
          max="200"
        />
      </PropertySection>
    );
  };

  const renderSelectToolProperties = () => {
    const showSeatingSectionStroke =
      globalSettings?.showSeatingSectionStroke || false;
    return (
      <PropertySection title="Select Tool">
        <p className="text-sm text-gray-600 mb-3">
          Use this tool to select and modify existing seats, rows, and elements.
        </p>
        <p className="text-xs text-gray-500 mb-4">
          • Click to select items
          <br />
          • Drag to select multiple items
          <br />• Hold Shift to add to selection
        </p>
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700">
            Show Seating Section Stroke
          </label>
          <button
            onClick={() => {
              onUpdateGlobalSettings({
                showSeatingSectionStroke: !showSeatingSectionStroke,
              });
            }}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              showSeatingSectionStroke
                ? "bg-[var(--color-primary-blue)]"
                : "bg-gray-300"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                showSeatingSectionStroke ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
        <div className="flex items-center justify-between mt-2">
          <label className="text-sm font-medium text-gray-700">
            Show section boundary in renderer
          </label>
          <button
            onClick={() => {
              onUpdateGlobalSettings({
                showSectionBoundaryInRenderer: !(
                  globalSettings?.showSectionBoundaryInRenderer || false
                ),
              });
            }}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              globalSettings?.showSectionBoundaryInRenderer
                ? "bg-[var(--color-primary-blue)]"
                : "bg-gray-300"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                globalSettings?.showSectionBoundaryInRenderer
                  ? "translate-x-6"
                  : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </PropertySection>
    );
  };

  const renderPanToolProperties = () => {
    const showSeatingSectionStroke =
      globalSettings?.showSeatingSectionStroke || false;
    return (
      <PropertySection title="Pan Tool">
        <p className="text-sm text-gray-600 mb-3">
          Use this tool to pan and zoom the canvas view.
        </p>
        <p className="text-xs text-gray-500 mb-4">
          • Click and drag to pan
          <br />
          • Use mouse wheel to zoom
          <br />• Hold Alt + drag to rotate view
        </p>
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700">
            Show Seating Section Stroke
          </label>
          <button
            onClick={() => {
              onUpdateGlobalSettings({
                showSeatingSectionStroke: !showSeatingSectionStroke,
              });
            }}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              showSeatingSectionStroke
                ? "bg-[var(--color-primary-blue)]"
                : "bg-gray-300"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                showSeatingSectionStroke ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </PropertySection>
    );
  };

  const renderTableToolProperties = () => {
    const defaultCategoryId =
      categories.length > 0 ? categories[0].id : "default";

    const tableRadius = settings.tableRadius || 30;
    const seatRadius = settings.seatRadius || 39;
    const isRadiusLocked = settings.radiusLocked || false;

    // Calculate the ratio when lock is enabled
    const radiusRatio =
      isRadiusLocked && tableRadius > 0 ? seatRadius / tableRadius : null;

    return (
      <PropertySection title="Table Tool Properties">
        <SelectField
          label="Seat Category"
          value={settings.categoryId || defaultCategoryId}
          onChange={(value) => {
            onToolSettingsUpdate(currentTool, { categoryId: value });
          }}
          options={[
            ...categories.map((category) => ({
              value: category.id,
              label: `${category.name} (${category.color})`,
            })),
          ]}
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
              value={tableRadius}
              onClick={(e) => /** @type {HTMLInputElement} */ (e.target).select()}
              onChange={(e) => {
                const newTableRadius = parseInt(e.target.value) || 30;
                const updates: any = { tableRadius: newTableRadius };

                if (isRadiusLocked && radiusRatio) {
                  updates.seatRadius = Math.round(newTableRadius * radiusRatio);
                }

                onToolSettingsUpdate(currentTool, updates);
              }}
              className="border rounded-md placeholder:text-gray-400 selection:bg-[var(--color-primary-blue)] selection:text-white border-gray-300 h-9 w-full min-w-0 bg-white px-3 py-1 text-base shadow-sm transition-all outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus:border-[var(--color-primary-blue)] focus:ring-[var(--color-primary-blue)]/30 focus:ring-[3px] aria-invalid:ring-red-500/20 aria-invalid:border-red-500"
            />
          </div>
          <button
            onClick={() => {
              onToolSettingsUpdate(currentTool, {
                radiusLocked: !isRadiusLocked,
              });
            }}
            className={`p-2 rounded-md transition-colors ${
              isRadiusLocked
                ? "bg-blue-100 text-blue-600 hover:bg-blue-200"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
            title={
              isRadiusLocked
                ? "Unlock radii proportion"
                : "Lock radii proportion"
            }
          >
            {isRadiusLocked ? <Lock size={16} /> : <Unlock size={16} />}
          </button>
        </div>

        <InputField
          label="Seat Radius"
          type="number"
          value={seatRadius}
          onChange={(value) => {
            const newSeatRadius = parseInt(value) || 39;
            const updates: any = { seatRadius: newSeatRadius };

            if (isRadiusLocked && radiusRatio && tableRadius > 0) {
              updates.tableRadius = Math.round(newSeatRadius / radiusRatio);
            }

            onToolSettingsUpdate(currentTool, updates);
          }}
          min="20"
          max="100"
        />

        <InputField
          label="Seat Count"
          type="number"
          value={settings.seatCount || 10}
          onChange={(value) => {
            onToolSettingsUpdate(currentTool, {
              seatCount: parseInt(value) || 10,
            });
          }}
          min="2"
          max="20"
        />

        <div className="grid grid-cols-2 gap-2">
          <ColorPicker
            label="Table Fill Color"
            value={settings.fillColor || "#f0f0f0"}
            onChange={(value) => {
              onToolSettingsUpdate(currentTool, { fillColor: value });
            }}
          />
          <ColorPicker
            label="Table Stroke Color"
            value={settings.strokeColor || "#333333"}
            onChange={(value) => {
              onToolSettingsUpdate(currentTool, { strokeColor: value });
            }}
          />
        </div>

        <InputField
          label="Stroke Width"
          type="number"
          value={settings.strokeWidth || 2}
          onChange={(value) => {
            onToolSettingsUpdate(currentTool, {
              strokeWidth: parseInt(value) || 2,
            });
          }}
          min="1"
          max="10"
        />

        <InputField
          label="Snap Tolerance"
          type="number"
          value={settings.snapTolerance || 25}
          onChange={(value) => {
            onToolSettingsUpdate(currentTool, {
              snapTolerance: parseInt(value) || 25,
            });
          }}
          min="0"
          max="100"
          title="Distance in pixels to snap to nearby tables on X or Y axis (0 to disable)"
        />
      </PropertySection>
    );
  };

  const renderImageUploadToolProperties = () => {
    const handleImageUpload = (imageData) => {
      if (actions && actions.addImage) {
        const { createElement, ELEMENT_TYPES } = require("../../types.ts");

        // Create image element at center of viewport
        const imageElement = createElement(
          ELEMENT_TYPES.IMAGE,
          400, // Default x position
          300, // Default y position
          Math.min(imageData.width, 400), // Limit width to 400px
          Math.min(imageData.height, 300), // Limit height to 300px
          {
            src: imageData.src,
            imageWidth: imageData.width,
            imageHeight: imageData.height,
            opacity: 1,
          },
        );

        actions.addImage(imageElement);
        actions.setSelection([imageElement.id]);
        actions.setTool("select");
      }
    };

    return (
      <PropertySection title="Image Upload">
        <p className="text-sm text-gray-600 mb-3">
          Upload images to add to your seat layout.
        </p>
        <ImageDropZone onImageUpload={handleImageUpload} />
      </PropertySection>
    );
  };

  switch (currentTool) {
    case TOOL_TYPES.SELECT:
      return renderSelectToolProperties();
    case TOOL_TYPES.PAN:
      return renderPanToolProperties();
    case TOOL_TYPES.ELEMENT_TEXT:
      return renderTextToolProperties();
    case TOOL_TYPES.ELEMENT_CIRCLE:
      return renderCircleToolProperties();
    case TOOL_TYPES.ELEMENT_RECTANGLE:
      return renderRectangleToolProperties();
    case TOOL_TYPES.ELEMENT_PATH:
      return renderPathToolProperties();
    case TOOL_TYPES.ROW_LINE:
    case TOOL_TYPES.ROW_ARC:
    case TOOL_TYPES.MULTI_ROW:
      return renderRowToolProperties(currentTool);
    case TOOL_TYPES.SEAT:
      return renderSeatToolProperties();
    case TOOL_TYPES.ELEMENT_TABLE:
      return renderTableToolProperties();
    case TOOL_TYPES.IMAGE_UPLOAD:
      return renderImageUploadToolProperties();
    default:
      return null;
  }
};
