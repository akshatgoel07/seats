import React, { useState } from "react";
import { Kbd as KbdImport, KbdGroup as KbdGroupImport } from "./Kbd.tsx";

const Kbd = KbdImport;
const KbdGroup = KbdGroupImport;

type Platform = "mac" | "win";

type Shortcut = {
  key?: string;
  mac?: string;
  win?: string;
  description: string;
};

type ShortcutCategory = {
  category: string;
  items: Shortcut[];
};

type ShortcutsModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

const ShortcutsModal = ({ isOpen, onClose }: ShortcutsModalProps) => {
  const [platform, setPlatform] = useState<Platform>("mac");

  const shortcuts: ShortcutCategory[] = [
    {
      category: "Tools",
      items: [
        { key: "V", description: "Select tool" },
        { key: "Space", description: "Pan tool (hold)" },
        { key: "R", description: "Row line tool" },
        { key: "A", description: "Row arc tool" },
        { key: "E", description: "Seat tool" },
        { key: "C", description: "Circle element tool" },
        { key: "T", description: "Rectangle element tool" },
        { key: "P", description: "Path element tool" },
        { key: "X", description: "Text element tool" },
        { key: "D", description: "Measure distance tool" },
      ],
    },
    {
      category: "Actions",
      items: [
        { mac: "⌘ + Z", win: "Ctrl + Z", description: "Undo" },
        { mac: "⌘ + Y", win: "Ctrl + Y", description: "Redo" },
        { key: "G", description: "Toggle grid" },
        { mac: "⌘ + .", win: "Ctrl + .", description: "Group selected elements" },
        { key: "[", description: "Rotate counter-clockwise" },
        { key: "]", description: "Rotate clockwise" },
        { key: "Del", description: "Delete selected items" },
        { mac: "⌘ + A", win: "Ctrl + A", description: "Select all" },
        { mac: "⌘ + /", win: "Ctrl + /", description: "Show/hide this shortcuts modal" },
        { key: "Esc", description: "Cancel current action / Close this modal" },
      ],
    },
    {
      category: "Mouse",
      items: [
        { key: "Click", description: "Select/deselect items" },
        { key: "Shift + Click", description: "Add/remove from selection" },
        { key: "Alt + Click", description: "Select entire row (on seats)" },
        { key: "Drag", description: "Move selected items" },
        { key: "Right Click", description: "Complete path drawing" },
        { key: "Mouse Wheel", description: "Zoom in/out" },
      ],
    },
  ];

  const parseKeys = (shortcut: Shortcut): string[] => {
    const keyString = platform === "mac" && shortcut.mac ? shortcut.mac : (shortcut.win || shortcut.key || "");
    if (!keyString) return [];

    if (keyString.includes(" + ")) {
      const parts = keyString.split(" + ").map((part: string) => part.trim());
      return parts;
    }
    return [keyString];
  };

  const renderKey = (key: string) => {
    const specialKeys = {
      "⌘": "⌘",
      "Ctrl": "Ctrl",
      "Shift": "Shift",
      "Alt": "Alt",
      "Space": "Space",
      "Esc": "Esc",
      "Del": "Del",
    };

    if (key in specialKeys) {
      const specialKey = key as keyof typeof specialKeys;
      return <Kbd key={key}>{specialKeys[specialKey]}</Kbd>;
    }
    return <Kbd key={key}>{key}</Kbd>;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/10 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">
            Keyboard Shortcuts
          </h2>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setPlatform("mac")}
                className={`px-3 py-1 text-sm font-medium rounded transition-colors ${
                  platform === "mac"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Mac
              </button>
              <button
                onClick={() => setPlatform("win")}
                className={`px-3 py-1 text-sm font-medium rounded transition-colors ${
                  platform === "win"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Windows
              </button>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {shortcuts.map((category, index) => (
            <div
              key={category.category}
              className={`${index > 0 ? "mt-6" : ""}`}
            >
              <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wider">
                {category.category}
              </h3>
              <div className="space-y-2">
                {category.items.map((shortcut, itemIndex) => {
                  const keys = parseKeys(shortcut);
                  return (
                    <div
                      key={itemIndex}
                      className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-md"
                    >
                      <span className="text-sm text-gray-700">
                        {shortcut.description}
                      </span>
                      <KbdGroup>
                        {keys.map((key, keyIndex) => (
                          <React.Fragment key={keyIndex}>
                            {renderKey(key)}
                            {keyIndex < keys.length - 1 && (
                              <span className="text-gray-400 mx-0.5">+</span>
                            )}
                          </React.Fragment>
                        ))}
                      </KbdGroup>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-4">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-700 transition-colors text-sm font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShortcutsModal;
