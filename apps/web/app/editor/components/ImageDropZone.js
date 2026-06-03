"use client";

import React, { useState, useCallback } from "react";
import { Upload } from "lucide-react";
import { showToast } from "@/app/lib/toast";

export const ImageDropZone = ({ onImageUpload }) => {
  const [isDragActive, setIsDragActive] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));

  const validateFile = (file) => {
    // Check file type
    if (!file.type.startsWith("image/")) {
      showToast("Please upload an image file");
      setError("Please upload an image file");
      return false;
    }

    // Check file size (between 1KB and 10MB)
    const minSize = 1024; // 1KB
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size < minSize || file.size > maxSize) {
      setError("File size must be between 1.00KB and 10.00MB");
      return false;
    }

    setError(null);
    return true;
  };

  const handleFile = useCallback(
    (file) => {
      if (validateFile(file)) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = /** @type {string} */ (
            /** @type {FileReader} */ (e.target).result
          );
          const img = new Image();
          img.onload = () => {
            onImageUpload({
              src: result,
              width: img.width,
              height: img.height,
              name: file.name,
            });
          };
          img.src = result;
        };
        reader.readAsDataURL(file);
      }
    },
    [onImageUpload],
  );

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragActive(false);

      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        handleFile(files[0]);
      }
    },
    [handleFile],
  );

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  }, []);

  const handleClick = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = (e) => {
      const files = /** @type {HTMLInputElement} */ (e.target).files;
      if (files && files.length > 0) {
        handleFile(files[0]);
      }
    };
    input.click();
  }, [handleFile]);

  return (
    <div className="w-full">
      <div
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          relative border-2 border-dashed rounded-lg p-8
          transition-all duration-200 cursor-pointer
          flex flex-col items-center justify-center
          min-h-[200px]
          ${
            isDragActive
              ? "border-blue-500 bg-blue-50"
              : "border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50"
          }
        `}
      >
        <div className="flex flex-col items-center gap-3">
          <div
            className={`
            w-12 h-12 rounded-full flex items-center justify-center
            ${isDragActive ? "bg-blue-100" : "bg-gray-100"}
          `}
          >
            <Upload
              className={`w-6 h-6 ${
                isDragActive ? "text-blue-500" : "text-gray-500"
              }`}
            />
          </div>

          <div className="text-center">
            <h3 className="text-base font-semibold text-gray-800 mb-1">
              Upload files
            </h3>
            <p className="text-sm text-gray-600 mb-1">
              Drag and drop or click to upload
            </p>
            <p className="text-xs text-gray-500">
              Accepts image/* between 1.00KB and 10.00MB.
            </p>
          </div>
        </div>

        {error && (
          <div className="mt-4 text-sm text-red-600 bg-red-50 px-3 py-2 rounded">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};
