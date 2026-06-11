import React from "react";
import { PropertySection } from "./UIComponents.tsx";
import type { EditorCategory } from "../../types.ts";

export const CategoriesPanel = ({ categories }: { categories: EditorCategory[] }) => {
  return (
    <PropertySection title="Categories">
      {categories.map((category) => (
        <div
          key={category.id}
          className="flex items-center gap-3 mb-3 p-2 bg-gray-50 rounded"
        >
          <div
            className="w-6 h-6 rounded border-2 border-gray-300"
            style={{ backgroundColor: category.color }}
          />
          <div className="flex-1">
            <div className="font-medium text-sm">{category.name}</div>
            <div className="text-xs text-gray-500">
              ${category.price}
            </div>
          </div>
        </div>
      ))}
    </PropertySection>
  );
};
