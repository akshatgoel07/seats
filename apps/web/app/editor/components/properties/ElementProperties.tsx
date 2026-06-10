import React, { useState } from "react";
import {
  PropertySection,
  InputField,
  SelectField,
  ColorPicker,
} from "./UIComponents.tsx";
import { Lock, Unlock } from "lucide-react";

export const ElementProperties = ({
  selectedElements,
  multipleSelected,
  onElementUpdate,
  onLockImage,
  onUnlockImage,
  onConvertPathToImage,
  onConvertImageToStandingSection,
  onConvertImageToSeatingSection,
  onConvertRectangleToStandingSection,
  onConvertRectangleToSeatingSection,
  onConvertPathToStandingSection,
  onConvertPathToSeatingSection,
}) => {
  const [aspectRatioLocked, setAspectRatioLocked] = useState(true);
  const [rotationAngles, setRotationAngles] = useState({});
  const [previousRotations, setPreviousRotations] = useState({});

  const getRotationAngle = (elementId, currentRotation) => {
    if (rotationAngles[elementId] !== undefined) {
      return rotationAngles[elementId];
    }
    return Math.round((currentRotation || 0) * (180 / Math.PI));
  };

  const getLabelRotationAngle = (elementId, currentRotation) => {
    const labelKey = `${elementId}_label`;
    if (rotationAngles[labelKey] !== undefined) {
      return rotationAngles[labelKey];
    }
    return Math.round((currentRotation || 0) * (180 / Math.PI));
  };

  const renderSingleElementProperties = (element) => {
    const rotationAngle = getRotationAngle(element.id, element.rotation);
    const previousRotation = previousRotations[element.id] || rotationAngle;
    const labelRotationAngle = getLabelRotationAngle(
      element.id,
      element.labelRotation || 0,
    );

    return (
      <>
        <div className="border-t border-b border-gray-200 py-4 my-4">
          {/* <h3 className="text-sm font-semibold text-gray-700 mb-3">Label</h3> */}
          <InputField
            label="Label"
            value={element.label || ""}
            onChange={(value) => {
              onElementUpdate(element.id, {
                label: value,
              });
            }}
          />
          <div className="grid grid-cols-2 gap-2">
            <InputField
              label="Font Size"
              type="number"
              value={element.labelFontSize || 12}
              onChange={(value) => {
                onElementUpdate(element.id, {
                  labelFontSize: value,
                });
              }}
              min="8"
              max="72"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <InputField
              label="Position X"
              type="number"
              value={Math.round(element.labelX || 0)}
              onChange={(value) => {
                onElementUpdate(element.id, {
                  labelX: parseInt(value) || 0,
                });
              }}
            />
            <InputField
              label="Position Y"
              type="number"
              value={Math.round(element.labelY || 0)}
              onChange={(value) => {
                onElementUpdate(element.id, {
                  labelY: parseInt(value) || 0,
                });
              }}
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-600 mb-1">
              Rotation
            </label>
            <div className="flex gap-2 items-center">
              <input
                type="number"
                value={labelRotationAngle}
                onChange={(e) => {
                  const newValue = parseFloat(e.target.value) || 0;
                  const radians = newValue * (Math.PI / 180);
                  setRotationAngles((prev) => ({
                    ...prev,
                    [`${element.id}_label`]: newValue,
                  }));
                  onElementUpdate(element.id, {
                    labelRotation: radians,
                  });
                }}
                className="w-20 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                min="-180"
                max="180"
                step="1"
              />
              <span className="text-xs text-gray-600">degrees</span>
              <button
                onClick={() => {
                  if (labelRotationAngle !== 0) {
                    setRotationAngles((prev) => ({
                      ...prev,
                      [`${element.id}_label`]: 0,
                    }));
                    onElementUpdate(element.id, {
                      labelRotation: 0,
                    });
                  }
                }}
                className="px-3 py-2 bg-purple text-white rounded-md hover:bg-purple-700 transition-colors text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: "#8d6fbf" }}
                title="Reset rotation to 0"
                disabled={labelRotationAngle === 0}
              >
                Reset
              </button>
            </div>
            <div className="relative">
              <input
                type="range"
                value={labelRotationAngle}
                onChange={(e) => {
                  const newValue = parseFloat(e.target.value);
                  const radians = newValue * (Math.PI / 180);
                  setRotationAngles((prev) => ({
                    ...prev,
                    [`${element.id}_label`]: newValue,
                  }));
                  onElementUpdate(element.id, {
                    labelRotation: radians,
                  });
                }}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                min="-180"
                max="180"
                step="1"
                style={{
                  background: `linear-gradient(to right, #8d6fbf 0%, #8d6fbf ${
                    ((labelRotationAngle + 180) / 360) * 100
                  }%, #e5e7eb ${
                    ((labelRotationAngle + 180) / 360) * 100
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

        <div className="grid grid-cols-2 gap-2">
          <InputField
            label="X Position"
            type="number"
            value={Math.round(element.x)}
            onChange={(value) => {
              onElementUpdate(element.id, {
                x: parseInt(value) || 0,
              });
            }}
          />
          <InputField
            label="Y Position"
            type="number"
            value={Math.round(element.y)}
            onChange={(value) => {
              onElementUpdate(element.id, {
                y: parseInt(value) || 0,
              });
            }}
          />
        </div>

        {element.type !== "path" && element.type !== "text" && (
          <div className="grid grid-cols-2 gap-2">
            <InputField
              label="Width"
              type="number"
              value={Math.round(element.width)}
              onChange={(value) => {
                const updates: any = { width: parseInt(value) || 50 };
                if (element.type === "circle") {
                  updates.radius =
                    Math.min(parseInt(value) || 50, element.height) / 2;
                }
                onElementUpdate(element.id, updates);
              }}
              min="10"
            />
            <InputField
              label="Height"
              type="number"
              value={Math.round(element.height)}
              onChange={(value) => {
                const updates: any = { height: parseInt(value) || 50 };
                if (element.type === "circle") {
                  updates.radius =
                    Math.min(element.width, parseInt(value) || 50) / 2;
                }
                onElementUpdate(element.id, updates);
              }}
              min="10"
            />
          </div>
        )}

        {element.type === "circle" && (
          <InputField
            label="Radius"
            type="number"
            value={Math.round(element.radius || 25)}
            onChange={(value) => {
              const radius = parseInt(value) || 25;
              onElementUpdate(element.id, {
                radius,
                width: radius * 2,
                height: radius * 2,
              });
            }}
            min="5"
          />
        )}

        {element.type !== "text" && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <ColorPicker
                label="Fill Color"
                value={element.fillColor || "#f0f0f0"}
                onChange={(value) => {
                  onElementUpdate(element.id, {
                    fillColor: value,
                  });
                }}
              />
              <ColorPicker
                label="Stroke Color"
                value={element.strokeColor || "#333333"}
                onChange={(value) => {
                  onElementUpdate(element.id, {
                    strokeColor: value,
                  });
                }}
              />
            </div>

            <InputField
              label="Stroke Width"
              type="number"
              value={element.strokeWidth || 2}
              onChange={(value) => {
                onElementUpdate(element.id, {
                  strokeWidth: parseInt(value) || 1,
                });
              }}
              min="1"
              max="10"
            />
          </>
        )}

        {element.type === "path" && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <InputField
                label="Scale"
                type="number"
                value={element.scale || 1.0}
                onChange={(value) => {
                  onElementUpdate(element.id, {
                    scale: Math.max(
                      0.1,
                      Math.min(5.0, parseFloat(value) || 1.0),
                    ),
                  });
                }}
                min="0.1"
                max="5.0"
                step="0.1"
              />
              <div className="space-y-2">
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    value={rotationAngle}
                    onChange={(e) => {
                      const newValue = parseFloat(e.target.value) || 0;
                      const radians = newValue * (Math.PI / 180);
                      setRotationAngles((prev) => ({
                        ...prev,
                        [element.id]: newValue,
                      }));
                      setPreviousRotations((prev) => ({
                        ...prev,
                        [element.id]: newValue,
                      }));
                      onElementUpdate(element.id, {
                        rotation: radians,
                      });
                    }}
                    className="w-20 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    min="-180"
                    max="180"
                    step="1"
                  />
                  <span className="text-xs text-gray-600">degrees</span>
                  <button
                    onClick={() => {
                      if (rotationAngle !== 0) {
                        setRotationAngles((prev) => ({
                          ...prev,
                          [element.id]: 0,
                        }));
                        setPreviousRotations((prev) => ({
                          ...prev,
                          [element.id]: 0,
                        }));
                        onElementUpdate(element.id, {
                          rotation: 0,
                        });
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
                <div className="relative">
                  <input
                    type="range"
                    value={rotationAngle}
                    onChange={(e) => {
                      const newValue = parseFloat(e.target.value);
                      const radians = newValue * (Math.PI / 180);
                      setRotationAngles((prev) => ({
                        ...prev,
                        [element.id]: newValue,
                      }));
                      setPreviousRotations((prev) => ({
                        ...prev,
                        [element.id]: newValue,
                      }));
                      onElementUpdate(element.id, {
                        rotation: radians,
                      });
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

            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-600 mb-2">
                Boundary Presets
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    onElementUpdate(element.id, {
                      strokeColor: "rgba(0, 0, 0, 0.9)",
                      strokeWidth: 2,
                      opacity: 0.8,
                      label: "Section Boundary",
                    });
                  }}
                  className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded border"
                >
                  Section Line
                </button>
                <button
                  onClick={() => {
                    onElementUpdate(element.id, {
                      strokeColor: "rgba(0, 0, 0, 0.9)",
                      strokeWidth: 2,
                      opacity: 1,
                      label: "Main Boundary",
                    });
                  }}
                  className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded border"
                >
                  Main Border
                </button>
                <button
                  onClick={() => {
                    onElementUpdate(element.id, {
                      strokeColor: "#9ca3af",
                      strokeWidth: 1,
                      opacity: 0.6,
                      label: "Guide Line",
                    });
                  }}
                  className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded border"
                >
                  Guide Line
                </button>
                <button
                  onClick={() => {
                    onElementUpdate(element.id, {
                      strokeColor: "#dc2626",
                      strokeWidth: 2,
                      opacity: 0.9,
                      label: "Emergency Path",
                    });
                  }}
                  className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded border"
                >
                  Emergency
                </button>
              </div>
            </div>
          </>
        )}

        {element.type === "rectangle" && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <InputField
                label="Border Radius"
                type="number"
                value={element.borderRadius || 0}
                onChange={(value) => {
                  onElementUpdate(element.id, {
                    borderRadius: Math.max(0, parseInt(value) || 0),
                  });
                }}
                min="0"
                max="50"
              />
            </div>
            <div className="space-y-2">
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  value={rotationAngle}
                  onChange={(e) => {
                    const newValue = parseFloat(e.target.value) || 0;
                    const radians = newValue * (Math.PI / 180);
                    setRotationAngles((prev) => ({
                      ...prev,
                      [element.id]: newValue,
                    }));
                    setPreviousRotations((prev) => ({
                      ...prev,
                      [element.id]: newValue,
                    }));
                    onElementUpdate(element.id, {
                      rotation: radians,
                    });
                  }}
                  className="w-20 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  min="-180"
                  max="180"
                  step="1"
                />
                <span className="text-xs text-gray-600">degrees</span>
                <button
                  onClick={() => {
                    if (rotationAngle !== 0) {
                      setRotationAngles((prev) => ({
                        ...prev,
                        [element.id]: 0,
                      }));
                      setPreviousRotations((prev) => ({
                        ...prev,
                        [element.id]: 0,
                      }));
                      onElementUpdate(element.id, {
                        rotation: 0,
                      });
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
              <div className="relative">
                <input
                  type="range"
                  value={rotationAngle}
                  onChange={(e) => {
                    const newValue = parseFloat(e.target.value);
                    const radians = newValue * (Math.PI / 180);
                    setRotationAngles((prev) => ({
                      ...prev,
                      [element.id]: newValue,
                    }));
                    setPreviousRotations((prev) => ({
                      ...prev,
                      [element.id]: newValue,
                    }));
                    onElementUpdate(element.id, {
                      rotation: radians,
                    });
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
            <div className="mb-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => onConvertRectangleToStandingSection(element.id)}
                className="px-3 py-2 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 transition-colors"
                title="Convert this rectangle to a standing section"
              >
                Convert to Standing Section
              </button>
              {onConvertRectangleToSeatingSection && (
                <button
                  onClick={() => onConvertRectangleToSeatingSection(element.id)}
                  className="px-3 py-2 bg-green-500 text-white text-sm rounded hover:bg-green-600 transition-colors"
                  title="Convert this rectangle to a seating section"
                >
                  Convert to Seating Section
                </button>
              )}
            </div>
          </>
        )}

        {element.type === "text" && (
          <>
            <InputField
              label="Text Content"
              value={element.text || "Text"}
              onChange={(value) => {
                onElementUpdate(element.id, {
                  text: value,
                });
              }}
              placeholder="Enter text content..."
            />

            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-600 mb-2">
                Text Style
              </label>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    const isBold = element.fontWeight === "bold";
                    onElementUpdate(element.id, {
                      fontWeight: isBold ? "normal" : "bold",
                    });
                  }}
                  className={`flex items-center justify-center w-10 h-10 rounded border transition-colors ${
                    element.fontWeight === "bold"
                      ? "bg-gray-200 border-gray-400 text-gray-900"
                      : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                  title="Bold"
                >
                  <span className="font-bold text-base">B</span>
                </button>
                <button
                  onClick={() => {
                    const isItalic = element.fontStyle === "italic";
                    onElementUpdate(element.id, {
                      fontStyle: isItalic ? "normal" : "italic",
                    });
                  }}
                  className={`flex items-center justify-center w-10 h-10 rounded border transition-colors ${
                    element.fontStyle === "italic"
                      ? "bg-gray-200 border-gray-400 text-gray-900"
                      : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                  title="Italic"
                >
                  <span className="italic text-base">I</span>
                </button>
                {/* <button
                onClick={() => {
                  const isUnderline = element.textDecoration === "underline";
                  onElementUpdate(element.id, {
                    textDecoration: isUnderline ? "none" : "underline",
                  });
                }}
                className={`flex items-center justify-center w-10 h-10 rounded border transition-colors ${
                  element.textDecoration === "underline"
                    ? "bg-gray-200 border-gray-400 text-gray-900"
                    : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
                title="Underline"
              >
                <span className="underline text-base">U</span>
              </button> */}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <SelectField
                label=""
                value={element.fontFamily || "Arial"}
                onChange={(value) => {
                  onElementUpdate(element.id, {
                    fontFamily: value,
                  });
                }}
                options={[
                  { value: "Arial", label: "Arial" },
                  { value: "Times New Roman", label: "Times" },
                  { value: "Courier New", label: "Courier" },
                  { value: "Georgia", label: "Georgia" },
                  { value: "Verdana", label: "Verdana" },
                ]}
              />
              <InputField
                label=""
                type="number"
                value={element.fontSize || 16}
                onChange={(value) => {
                  onElementUpdate(element.id, {
                    fontSize: parseInt(value) || 16,
                  });
                }}
                min="8"
                max="72"
              />
            </div>

            {/* <div className="grid grid-cols-2 gap-2">
            <SelectField
              label=""
              value={element.textAlign || "center"}
              onChange={(value) => {
                onElementUpdate(element.id, {
                  textAlign: value,
                });
              }}
              options={[
                { value: "left", label: "Left" },
                { value: "center", label: "Center" },
                { value: "right", label: "Right" },
              ]}
            />
            <SelectField
              label=""
              value={element.fontWeight || "normal"}
              onChange={(value) => {
                onElementUpdate(element.id, {
                  fontWeight: value,
                });
              }}
              options={[
                { value: "normal", label: "Normal" },
                { value: "bold", label: "Bold" },
                { value: "lighter", label: "Light" },
              ]}
            />
          </div> */}

            <ColorPicker
              label="Text Color"
              value={element.fillColor || "#000000"}
              onChange={(value) => {
                onElementUpdate(element.id, {
                  fillColor: value,
                });
              }}
            />

            {/* Text Rotation Control */}
            <div className="space-y-2 mt-3">
              <label className="block text-sm font-medium text-gray-600 mb-2">
                Rotation
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  value={rotationAngle}
                  onChange={(e) => {
                    const newValue = parseFloat(e.target.value) || 0;
                    const radians = newValue * (Math.PI / 180);
                    setRotationAngles((prev) => ({
                      ...prev,
                      [element.id]: newValue,
                    }));
                    setPreviousRotations((prev) => ({
                      ...prev,
                      [element.id]: newValue,
                    }));
                    onElementUpdate(element.id, {
                      rotation: radians,
                    });
                  }}
                  className="w-20 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  min="-180"
                  max="180"
                  step="1"
                />
                <span className="text-xs text-gray-600">degrees</span>
                <button
                  onClick={() => {
                    if (rotationAngle !== 0) {
                      setRotationAngles((prev) => ({
                        ...prev,
                        [element.id]: 0,
                      }));
                      setPreviousRotations((prev) => ({
                        ...prev,
                        [element.id]: 0,
                      }));
                      onElementUpdate(element.id, {
                        rotation: 0,
                      });
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
              <div className="relative">
                <input
                  type="range"
                  value={rotationAngle}
                  onChange={(e) => {
                    const newValue = parseFloat(e.target.value);
                    const radians = newValue * (Math.PI / 180);
                    setRotationAngles((prev) => ({
                      ...prev,
                      [element.id]: newValue,
                    }));
                    setPreviousRotations((prev) => ({
                      ...prev,
                      [element.id]: newValue,
                    }));
                    onElementUpdate(element.id, {
                      rotation: radians,
                    });
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
          </>
        )}

        {element.type === "path" && element.isClosed && (
          <>
            {onConvertPathToStandingSection && (
              <div className="mb-3">
                <button
                  onClick={() => onConvertPathToStandingSection(element.id)}
                  className="w-full px-3 py-2 bg-green-500 text-white text-sm rounded hover:bg-green-600 transition-colors"
                  title="Convert this closed path to a standing section"
                >
                  Convert to Standing Section
                </button>
              </div>
            )}
            {onConvertPathToSeatingSection && (
              <div className="mb-3">
                <button
                  onClick={() => onConvertPathToSeatingSection(element.id)}
                  className="w-full px-3 py-2 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 transition-colors"
                  title="Convert this closed path to a seating section"
                >
                  Convert to Seating Section
                </button>
              </div>
            )}
          </>
        )}

        {element.type === "path" &&
          !element.isClosed &&
          onConvertPathToImage && (
            <div className="mb-3">
              <button
                onClick={() => onConvertPathToImage(element.id)}
                className="w-full px-3 py-2 bg-purple-500 text-white text-sm rounded hover:bg-purple-600 transition-colors"
                title="Convert this path element to an image element"
              >
                Convert to Image
              </button>
            </div>
          )}

        {element.type === "section-boundary" && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <InputField
                label="Scale"
                type="number"
                value={element.scale || 1.0}
                onChange={(value) => {
                  onElementUpdate(element.id, {
                    scale: Math.max(
                      0.1,
                      Math.min(5.0, parseFloat(value) || 1.0),
                    ),
                  });
                }}
                min="0.1"
                max="5.0"
                step="0.1"
              />
              <div className="space-y-2">
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    value={rotationAngle}
                    onChange={(e) => {
                      const newValue = parseFloat(e.target.value) || 0;
                      const radians = newValue * (Math.PI / 180);
                      setRotationAngles((prev) => ({
                        ...prev,
                        [element.id]: newValue,
                      }));
                      setPreviousRotations((prev) => ({
                        ...prev,
                        [element.id]: newValue,
                      }));
                      onElementUpdate(element.id, {
                        rotation: radians,
                      });
                    }}
                    className="w-20 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    min="-180"
                    max="180"
                    step="1"
                  />
                  <span className="text-xs text-gray-600">degrees</span>
                  <button
                    onClick={() => {
                      if (rotationAngle !== 0) {
                        setRotationAngles((prev) => ({
                          ...prev,
                          [element.id]: 0,
                        }));
                        setPreviousRotations((prev) => ({
                          ...prev,
                          [element.id]: 0,
                        }));
                        onElementUpdate(element.id, {
                          rotation: 0,
                        });
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
                <div className="relative">
                  <input
                    type="range"
                    value={rotationAngle}
                    onChange={(e) => {
                      const newValue = parseFloat(e.target.value);
                      const radians = newValue * (Math.PI / 180);
                      setRotationAngles((prev) => ({
                        ...prev,
                        [element.id]: newValue,
                      }));
                      setPreviousRotations((prev) => ({
                        ...prev,
                        [element.id]: newValue,
                      }));
                      onElementUpdate(element.id, {
                        rotation: radians,
                      });
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
          </>
        )}

        {element.type === "standing-section" && (
          <>
            <InputField
              label="Section Label"
              value={element.label || "Standing Section"}
              onChange={(value) => {
                onElementUpdate(element.id, {
                  label: value,
                });
              }}
              placeholder="Enter section label..."
            />

            <div className="grid grid-cols-2 gap-2">
              <InputField
                label="Standing Capacity"
                type="number"
                value={element.standingCapacity || 50}
                onChange={(value) => {
                  onElementUpdate(element.id, {
                    standingCapacity: Math.max(1, parseInt(value) || 50),
                  });
                }}
                min="1"
                max="1000"
              />
              {/* <SelectField
              label="Section Type"
              value={element.sectionType || "general"}
              onChange={(value) => {
                onElementUpdate(element.id, {
                  sectionType: value,
                });
              }}
              options={[
                { value: "general", label: "General" },
                { value: "vip", label: "VIP" },
                { value: "premium", label: "Premium" },
                { value: "accessible", label: "Accessible" },
              ]}
            /> */}
            </div>

            {/* <div className="grid grid-cols-2 gap-2">
            <InputField
              label="Entry Points"
              type="number"
              value={element.entryPoints?.length || 0}
              onChange={(value) => {
                const count = Math.max(0, parseInt(value) || 0);
                const entryPoints = [];
                for (let i = 0; i < count; i++) {
                  entryPoints.push({ x: 0, y: 0, label: `Entry ${i + 1}` });
                }
                onElementUpdate(element.id, {
                  entryPoints,
                });
              }}
              min="0"
              max="10"
              title="Number of entry points for this standing section"
            />
            <InputField
              label="Exit Points"
              type="number"
              value={element.exitPoints?.length || 0}
              onChange={(value) => {
                const count = Math.max(0, parseInt(value) || 0);
                const exitPoints = [];
                for (let i = 0; i < count; i++) {
                  exitPoints.push({ x: 0, y: 0, label: `Exit ${i + 1}` });
                }
                onElementUpdate(element.id, {
                  exitPoints,
                });
              }}
              min="0"
              max="10"
              title="Number of exit points for this standing section"
            />
          </div> */}

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
              <div className="text-sm font-medium text-blue-800 mb-1">
                Standing Section Info
                {element.backgroundImage && (
                  <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                    Converted Image
                  </span>
                )}
              </div>
              <div className="text-xs text-blue-600">
                Capacity: {element.standingCapacity || 50} people
                <br />
                Type: {element.sectionType || "general"}
                <br />
                Entry Points: {element.entryPoints?.length || 0}
                <br />
                Exit Points: {element.exitPoints?.length || 0}
                {element.backgroundImage && (
                  <>
                    <br />
                    Background: Custom Image ({
                      element.backgroundImageWidth
                    } × {element.backgroundImageHeight})
                  </>
                )}
              </div>
            </div>

            {element.backgroundImage && (
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-600 mb-2">
                  Background Image
                </label>
                <div className="border border-gray-300 rounded p-2 bg-gray-50">
                  <img
                    src={element.backgroundImage}
                    alt="Background"
                    className="max-w-full max-h-32 object-contain mx-auto"
                  />
                </div>
                <button
                  onClick={() => {
                    onElementUpdate(element.id, {
                      backgroundImage: null,
                      backgroundImageWidth: null,
                      backgroundImageHeight: null,
                      fillColor: "#e5e7eb", // Reset to default fill color
                    });
                  }}
                  className="w-full mt-2 px-3 py-1 bg-red-100 text-red-700 text-xs rounded hover:bg-red-200 transition-colors"
                  title="Remove background image"
                >
                  Remove Background Image
                </button>
              </div>
            )}
          </>
        )}

        {element.type === "image" && (
          <>
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-600 mb-2">
                Image Preview
              </label>
              {element.src ? (
                <div className="border border-gray-300 rounded p-2 bg-gray-50">
                  <img
                    src={element.src}
                    alt="Image preview"
                    className="max-w-full max-h-32 object-contain mx-auto"
                  />
                </div>
              ) : (
                <div className="border border-gray-300 rounded p-8 bg-gray-50 text-center text-gray-500">
                  No image loaded
                </div>
              )}
            </div>

            {/* Image Dimensions Section - Always Visible for Images */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-600">
                  Image Dimensions
                </label>
                <button
                  onClick={() => setAspectRatioLocked(!aspectRatioLocked)}
                  className={`px-2 py-1 text-xs rounded border flex items-center gap-1 ${
                    aspectRatioLocked
                      ? "bg-blue-100 border-blue-300 text-blue-700"
                      : "bg-gray-100 border-gray-300 text-gray-700"
                  }`}
                  title={
                    aspectRatioLocked
                      ? "Unlock aspect ratio"
                      : "Lock aspect ratio"
                  }
                >
                  {aspectRatioLocked ? (
                    <Lock size={14} />
                  ) : (
                    <Unlock size={14} />
                  )}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <InputField
                  label="Width"
                  type="number"
                  value={Math.round(element.width || 0)}
                  onChange={(value) => {
                    const newWidth = Math.max(10, parseInt(value) || 10);
                    const updates: any = { width: newWidth };

                    if (
                      aspectRatioLocked &&
                      element.imageWidth &&
                      element.imageHeight
                    ) {
                      const aspectRatio =
                        element.imageWidth / element.imageHeight;
                      updates.height = Math.max(
                        10,
                        Math.round(newWidth / aspectRatio),
                      );
                    }

                    onElementUpdate(element.id, updates);
                  }}
                  min="10"
                />
                <InputField
                  label="Height"
                  type="number"
                  value={Math.round(element.height || 0)}
                  onChange={(value) => {
                    const newHeight = Math.max(10, parseInt(value) || 10);
                    const updates: any = { height: newHeight };

                    if (
                      aspectRatioLocked &&
                      element.imageWidth &&
                      element.imageHeight
                    ) {
                      const aspectRatio =
                        element.imageWidth / element.imageHeight;
                      updates.width = Math.max(
                        10,
                        Math.round(newHeight * aspectRatio),
                      );
                    }

                    onElementUpdate(element.id, updates);
                  }}
                  min="10"
                />
              </div>
            </div>

            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-600 mb-2">
                Replace Image
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                      const result = event.target?.result as string;
                      const img = new Image();
                      img.onload = () => {
                        onElementUpdate(element.id, {
                          src: result,
                          imageWidth: img.width,
                          imageHeight: img.height,
                          width: img.width,
                          height: img.height,
                        });
                      };
                      img.src = result;
                    };
                    reader.readAsDataURL(file);
                  }
                }}
                className="bg-white w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>

            {element.imageWidth && element.imageHeight && (
              <div className="mb-3">
                <button
                  onClick={() => {
                    onElementUpdate(element.id, {
                      width: element.imageWidth,
                      height: element.imageHeight,
                    });
                  }}
                  className="w-full px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  Reset to Original Size ({element.imageWidth} ×{" "}
                  {element.imageHeight})
                </button>
              </div>
            )}

            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-600 mb-2">
                Lock Image
              </label>
              <div className="flex items-center">
                <button
                  onClick={() => {
                    if (element.locked) {
                      onUnlockImage(element.id);
                    } else {
                      onLockImage(element.id);
                    }
                  }}
                  className={`flex-1 px-3 py-2 rounded-md border focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent flex items-center justify-center gap-2 ${
                    element.locked
                      ? "bg-red-100 border-red-300 text-red-700 hover:bg-red-200"
                      : "bg-green-100 border-green-300 text-green-700 hover:bg-green-200"
                  }`}
                >
                  {element.locked ? (
                    <>
                      <Lock size={16} />
                      Locked
                    </>
                  ) : (
                    <>
                      <Unlock size={16} />
                      Unlocked
                    </>
                  )}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {element.locked
                  ? "Image is locked and cannot be moved. Seats can be easily manipulated."
                  : "Image can be moved around. Lock to prevent accidental movement."}
              </p>
            </div>

            <div className="mb-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => onConvertImageToStandingSection(element.id)}
                className="px-3 py-2 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 transition-colors"
                title="Convert this image to a standing section"
              >
                Convert to Standing Section
              </button>
              <button
                onClick={() => onConvertImageToSeatingSection(element.id)}
                className="px-3 py-2 bg-green-500 text-white text-sm rounded hover:bg-green-600 transition-colors"
                title="Convert this image to a seating section with individual seats"
              >
                Convert to Seating Section
              </button>
            </div>

            {/* Debug info - remove this later */}
            {/* <div className="mb-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-gray-600">
            <strong>Debug:</strong>
            <br />
            Type: {element.type}
            <br />
            Width: {element.width}, Height: {element.height}
            <br />
            ImageWidth: {element.imageWidth}, ImageHeight: {element.imageHeight}
            <br />
            Src: {element.src ? "Yes" : "No"}
          </div> */}
          </>
        )}

        {element.type === "seating-section" && (
          <>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-600 mb-2">
                Rotation
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  value={rotationAngle}
                  onChange={(e) => {
                    const newValue = parseFloat(e.target.value) || 0;
                    const radians = newValue * (Math.PI / 180);
                    setRotationAngles((prev) => ({
                      ...prev,
                      [element.id]: newValue,
                    }));
                    setPreviousRotations((prev) => ({
                      ...prev,
                      [element.id]: newValue,
                    }));
                    onElementUpdate(element.id, {
                      rotation: radians,
                    });
                  }}
                  className="w-20 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  min="-180"
                  max="180"
                  step="1"
                />
                <span className="text-xs text-gray-600">degrees</span>
                <button
                  onClick={() => {
                    if (rotationAngle !== 0) {
                      setRotationAngles((prev) => ({
                        ...prev,
                        [element.id]: 0,
                      }));
                      setPreviousRotations((prev) => ({
                        ...prev,
                        [element.id]: 0,
                      }));
                      onElementUpdate(element.id, {
                        rotation: 0,
                      });
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
              <div className="relative">
                <input
                  type="range"
                  value={rotationAngle}
                  onChange={(e) => {
                    const newValue = parseFloat(e.target.value);
                    const radians = newValue * (Math.PI / 180);
                    setRotationAngles((prev) => ({
                      ...prev,
                      [element.id]: newValue,
                    }));
                    setPreviousRotations((prev) => ({
                      ...prev,
                      [element.id]: newValue,
                    }));
                    onElementUpdate(element.id, {
                      rotation: radians,
                    });
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
          </>
        )}

        {/* <InputField
        label="Opacity"
        type="number"
        value={element.opacity || 1}
        onChange={(value) => {
          onElementUpdate(element.id, {
            opacity: Math.max(0, Math.min(1, parseFloat(value) || 1)),
          });
        }}
        min="0"
        max="1"
        step="0.1"
      /> */}

        {/* <div className="text-sm text-gray-600 mt-2">Type: {element.type}</div> */}
      </>
    );
  };

  return (
    <PropertySection
      title={`Element Properties ${
        selectedElements.length > 1 ? `(${selectedElements.length})` : ""
      }`}
    >
      {!multipleSelected && selectedElements.length === 1 ? (
        renderSingleElementProperties(selectedElements[0])
      ) : (
        <p className="text-sm text-gray-600">
          Multiple elements selected. Individual properties not available.
        </p>
      )}
    </PropertySection>
  );
};
