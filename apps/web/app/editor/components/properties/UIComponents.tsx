import React, { useState, useRef, useEffect } from "react";
import type { ChangeEvent, FocusEvent, ReactNode } from "react";

export type FieldValue = string | number;

type PropertySectionProps = {
  title?: ReactNode;
  children?: ReactNode;
  isOpen?: boolean;
};

export const PropertySection = ({
  title: _title,
  children,
  isOpen: _isOpen = true,
}: PropertySectionProps) => {
  return (
    <div className="p-4">
      <div className="">{children}</div>
    </div>
  );
};

type InputFieldProps = {
  label?: ReactNode;
  value?: FieldValue | null;
  onChange?: (value: FieldValue) => void;
  onBlur?: (value: FieldValue) => void;
  type?: string;
  min?: number | string;
  max?: number | string;
  step?: number | string;
  placeholder?: string;
  disabled?: boolean;
  title?: string;
  className?: string;
};

export const InputField = ({
  label,
  value,
  onChange,
  onBlur,
  type = "text",
  min,
  max,
  step,
  placeholder,
  disabled = false,
}: InputFieldProps) => {
  const [localValue, setLocalValue] = useState(value);
  const [isFocused, setIsFocused] = useState(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Update local value when prop value changes and input is not focused
  useEffect(() => {
    if (!isFocused) {
      setLocalValue(value);
    }
  }, [value, isFocused]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const handleChange = (newValue: string) => {
    setLocalValue(newValue);

    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (type === "number") {
      // Debounce number updates - live preview while typing
      debounceTimerRef.current = setTimeout(() => {
        const numValue = parseFloat(newValue);
        if (!isNaN(numValue)) {
          onChange?.(numValue);
        }
      }, 300); // 300ms debounce
    } else {
      // For non-number types, update immediately
      onChange?.(newValue);
    }
  };

  const handleBlur = (currentValue: string) => {
    setIsFocused(false);

    // Clear any pending debounced update
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    if (type === "number") {
      // Parse and validate the number
      const numValue = parseFloat(currentValue);
      let finalValue = isNaN(numValue) ? (min !== undefined ? Number(min) : 0) : numValue;

      // Apply min/max constraints
      if (min !== undefined) {
        finalValue = Math.max(Number(min), finalValue);
      }
      if (max !== undefined) {
        finalValue = Math.min(Number(max), finalValue);
      }

      // Update with clamped value
      setLocalValue(finalValue);
      onChange?.(finalValue);

      // Call custom onBlur if provided
      if (onBlur) {
        onBlur(finalValue);
      }
    } else if (onBlur) {
      onBlur(currentValue);
    }
  };

  const handleFocus = (e: FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    e.target.select();
  };

  // Check if current value is out of range (for visual feedback)
  const isOutOfRange = type === "number" && isFocused && (
    (min !== undefined && parseFloat(String(localValue)) < Number(min)) ||
    (max !== undefined && parseFloat(String(localValue)) > Number(max))
  );

  return (
    <div className="mb-3">
      <label className="block text-sm font-medium text-gray-600 mb-1">
        {label}
      </label>
      <input
        type={type}
        value={localValue != null ? localValue : ""}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={(e) => handleBlur(e.target.value)}
        onFocus={handleFocus}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        className={`border rounded-md placeholder:text-gray-400 selection:bg-[var(--color-primary-blue)] selection:text-white ${
          isOutOfRange ? "border-orange-400" : "border-gray-300"
        } h-9 w-full min-w-0 bg-white px-3 py-1 text-base shadow-sm transition-all outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus:border-[var(--color-primary-blue)] focus:ring-[var(--color-primary-blue)]/30 focus:ring-[3px] aria-invalid:ring-red-500/20 aria-invalid:border-red-500`}
        disabled={disabled}
      />
      {isOutOfRange && (
        <p className="text-xs text-orange-600 mt-1">
          Value will be clamped to {min !== undefined && max !== undefined ? `${min}-${max}` : min !== undefined ? `min ${min}` : `max ${max}`}
        </p>
      )}
    </div>
  );
};

type SelectOption = { value: FieldValue; label: string };

type SelectFieldProps = {
  label?: ReactNode;
  value?: FieldValue | null;
  onChange?: (value: FieldValue) => void;
  options?: SelectOption[];
};

export const SelectField = ({
  label,
  value,
  onChange,
  options,
}: SelectFieldProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        event.target instanceof Node &&
        !dropdownRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Extract color and text from label (format: "Text (#HEXCODE)")
  const parseLabel = (labelText: string): { text: string; color: string | null } => {
    const hexMatch = labelText.match(/\(#[0-9A-Fa-f]{6}\)$/);
    if (hexMatch) {
      const hexCode = hexMatch[0].slice(1, -1); // Remove parentheses
      const text = labelText.replace(hexMatch[0], "").trim();
      return { text, color: hexCode };
    }
    return { text: labelText, color: null };
  };

  // Get the selected option's label
  const selectedOption = options?.find((opt) => opt.value === value);
  const displayText = selectedOption?.label || "Select...";
  const { text: selectedText, color: selectedColor } = parseLabel(displayText);

  return (
    <div className="mb-3" ref={dropdownRef}>
      <label className="block text-sm font-medium text-gray-600 mb-1">
        {label}
      </label>
      <div className="relative">
        {/* Dropdown Button */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full px-4 py-2 bg-white border border-gray-300 rounded-md text-left text-sm focus:outline-none focus:border-transparent transition-all flex items-center justify-between gap-2"
        >
          <span className="text-[#737373] truncate flex-1">{selectedText}</span>
          <div className="flex items-center gap-2 flex-shrink-0">
            {selectedColor && (
              <span
                className="w-4 h-4 rounded"
                style={{ backgroundColor: selectedColor }}
              />
            )}
            <svg
              className={`w-5 h-5 text-gray-400 transition-transform ${
                isOpen ? "rotate-180" : ""
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
        </button>

        {/* Dropdown Menu */}
        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
            {/* Category Label */}
            <div className="px-4 py-2 text-sm text-gray-500 font-medium border-b border-gray-100">
              {label}
            </div>

            {/* Options List */}
            <div className="py-1">
              {(options ?? [])
                .filter((option) => option.value !== "") // Filter out placeholder options
                .map((option) => {
                  const { text, color } = parseLabel(option.label);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        onChange?.(option.value);
                        setIsOpen(false);
                      }}
                      className={`w-full px-4 py-2 text-left text-sm text-[#171717] hover:bg-[#F5F5F5] transition-colors flex items-center justify-between gap-2 ${
                        option.value === value ? "bg-gray-100" : ""
                      }`}
                    >
                      <span className="truncate flex-1">{text}</span>
                      {color && (
                        <span
                          className="w-4 h-4 rounded flex-shrink-0"
                          style={{ backgroundColor: color }}
                        />
                      )}
                    </button>
                  );
                })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

type ColorPickerProps = {
  label?: ReactNode;
  value?: string | null;
  onChange?: (value: string) => void;
};

export const ColorPicker = ({ label, value, onChange }: ColorPickerProps) => {
  const rgbToHex = (rgb: string): string => {
    if (!rgb) return "#000000";
    if (rgb.startsWith("#")) return rgb.toUpperCase();

    const rgbMatch = rgb.match(/\d+/g);
    if (rgbMatch && rgbMatch.length >= 3) {
      const r = parseInt(rgbMatch[0]).toString(16).padStart(2, "0");
      const g = parseInt(rgbMatch[1]).toString(16).padStart(2, "0");
      const b = parseInt(rgbMatch[2]).toString(16).padStart(2, "0");
      return `#${r}${g}${b}`.toUpperCase();
    }
    return "#000000";
  };

  const hexValue = rgbToHex(value || "#000000");
  const [hexInput, setHexInput] = useState(hexValue);

  useEffect(() => {
    setHexInput(hexValue);
  }, [hexValue]);

  const handleHexChange = (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    setHexInput(input);

    if (/^#[0-9A-Fa-f]{6}$/.test(input)) {
      onChange?.(input.toUpperCase());
    }
  };

  const handleColorChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange?.(e.target.value.toUpperCase());
  };

  return (
    <div className="mb-3">
      <label className="block text-sm font-medium text-gray-600 mb-1 ">
        {label}
      </label>
      <div
        className="py-1 px-2 border bg-white border-gray-300 rounded-md flex items-center gap-2"
        // className="border rounded-md placeholder:text-gray-400 selection:bg-[var(--color-primary-blue)] selection:text-white border-gray-300 h-9 w-full min-w-0 bg-white px-3 py-1 text-base shadow-sm transition-all outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus:border-[var(--color-primary-blue)] focus:ring-[var(--color-primary-blue)]/30 focus:ring-[3px] aria-invalid:ring-red-500/20 aria-invalid:border-red-500"
      >
        <input
          type="color"
          value={hexValue}
          onChange={handleColorChange}
          className="h-8 w-8 rounded"
        />
        <input
          type="text"
          value={hexInput}
          onChange={handleHexChange}
          placeholder="#000000"
          className="text-sm text-gray-600 bg-transparent border-none outline-none flex-1 min-w-0"
          pattern="^#[0-9A-Fa-f]{6}$"
          onFocus={(e) => {
            e.target.select();
          }}
        />
      </div>
    </div>
  );
};
