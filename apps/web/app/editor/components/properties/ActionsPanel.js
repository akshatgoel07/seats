import React from "react";
import { Save, CircleHelp } from "lucide-react";
import { useTour } from "../../hooks/useTour.js";

export const ActionsPanel = ({
  isSaving,
  scene,
  selectedIds,
  onSaveSeatLayout,
  onDeleteItems,
}) => {
  const { startTour } = useTour();

  return (
    <div className="flex items-center gap-2">
      {/* Tour Button - shadcn outline style */}
      <button
        onClick={startTour}
        className="
          inline-flex items-center justify-center gap-2
          h-9 px-4
          text-sm font-medium
          rounded-lg
          bg-neutral-900 text-neutral-300
          border border-neutral-700
          transition-all duration-200
          hover:bg-neutral-800 hover:text-neutral-100 hover:border-neutral-600
          focus:outline-none focus:ring-2 focus:ring-neutral-600 focus:ring-offset-2 focus:ring-offset-neutral-950
        "
        data-tour-button="true"
        title="Start guided tour"
      >
        <CircleHelp size={16} />
        <span>Tour</span>
      </button>

      {/* Save Button - shadcn primary style with green accent */}
      <button
        onClick={onSaveSeatLayout}
        disabled={isSaving || Object.keys(scene.seats).length === 0}
        className="
          inline-flex items-center justify-center gap-2
          h-9 px-4
          text-sm font-medium
          rounded-lg
          bg-emerald-600 text-white
          border border-emerald-500
          transition-all duration-200
          hover:bg-emerald-500 hover:border-emerald-400
          disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-emerald-600
          focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-neutral-950
        "
        data-save-button="true"
      >
        <Save size={16} />
        <span>
          {isSaving
            ? "Saving..."
            : `Save Layout (${Object.keys(scene.seats).length})`}
        </span>
      </button>
    </div>
  );
};
