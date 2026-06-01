import React from "react";
import { PropertySection } from "./UIComponents.js";

export const SectionsPanel = ({
  scene,
  onCreateSection,
  standingSections = [],
  onCreateStandingSection,
}) => {
  return (
    <PropertySection title="Sections & Standing Areas">
      <div className="mb-3">
        <button
          onClick={onCreateSection}
          className="w-full px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors text-sm"
        >
          + Add Section
        </button>
      </div>

      {/* Regular Sections */}
      <div className="mb-4">
        <div className="text-xs font-medium text-gray-500 mb-2">
          SEATING SECTIONS
        </div>
        {Object.values(scene.sections).map((section) => (
          <div
            key={section.id}
            className="flex items-center gap-3 mb-3 p-2 bg-gray-50 rounded"
          >
            <div className="flex-1">
              <div className="font-medium text-sm">{section.name}</div>
              <div className="text-xs text-gray-500">
                {section.rows?.length || 0} rows
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Standing Sections from API */}
      {standingSections.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-medium text-gray-500 mb-2">
            STANDING AREAS
          </div>
          {standingSections.map((standingSection) => (
            <div
              key={standingSection.sst_id}
              className="flex items-center gap-3 mb-3 p-2 bg-blue-50 rounded border border-blue-200"
            >
              <div className="flex-1">
                <div className="font-medium text-sm text-blue-800">
                  {standingSection.sst_seat_type}
                </div>
                <div className="text-xs text-blue-600">
                  Capacity: {standingSection.sst_no_of_seats} people
                </div>
                <div className="text-xs text-gray-500">
                  Type: Open Seating Area
                </div>
              </div>
              <button
                onClick={() => onCreateStandingSection(standingSection)}
                className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                title="Add to canvas"
              >
                Add
              </button>
            </div>
          ))}
        </div>
      )}
    </PropertySection>
  );
};
