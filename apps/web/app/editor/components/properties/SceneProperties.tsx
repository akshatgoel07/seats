import React from "react";
import { PropertySection, InputField } from "./UIComponents.tsx";
import type { EditorScene } from "../../types.ts";

export const SceneProperties = ({
  scene,
  onUpdateView,
}: {
  scene: EditorScene;
  onUpdateView: (updates: Partial<EditorScene["view"]>) => void;
}) => {
  return (
    <PropertySection title="Scene">
      <InputField
        label="Venue Name"
        value={scene.venue.name}
        onChange={(value) => {
          // TODO: Implement venue name update
        }}
      />

      <div className="grid grid-cols-3 gap-2">
        <InputField
          label="Scale"
          type="number"
          value={scene.view.scale.toFixed(2)}
          onChange={(value) =>
            onUpdateView({ scale: parseFloat(String(value)) || 1 })
          }
          min="0.1"
          max="5"
          step="0.1"
        />
        <InputField
          label="X"
          type="number"
          value={Math.round(scene.view.tx)}
          onChange={(value) =>
            onUpdateView({ tx: parseInt(String(value)) || 0 })
          }
        />
        <InputField
          label="Y"
          type="number"
          value={Math.round(scene.view.ty)}
          onChange={(value) =>
            onUpdateView({ ty: parseInt(String(value)) || 0 })
          }
        />
      </div>
    </PropertySection>
  );
};
