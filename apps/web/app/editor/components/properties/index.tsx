import React, { Suspense } from "react";
import type { ReactNode } from "react";

// Lazy load the components for code splitting
export const SceneProperties = React.lazy(() =>
  import("./wrappers/ScenePropertiesWrapper.ts"),
);
export const RowProperties = React.lazy(() =>
  import("./wrappers/RowPropertiesWrapper.ts"),
);
export const SeatProperties = React.lazy(() =>
  import("./wrappers/SeatPropertiesWrapper.ts"),
);
export const ElementProperties = React.lazy(() =>
  import("./wrappers/ElementPropertiesWrapper.ts"),
);
export const ActionsPanel = React.lazy(() =>
  import("./wrappers/ActionsPanelWrapper.ts"),
);
export const CategoriesPanel = React.lazy(() =>
  import("./wrappers/CategoriesPanelWrapper.ts"),
);
export const SectionsPanel = React.lazy(() =>
  import("./wrappers/SectionsPanelWrapper.ts"),
);
export const SeatSettings = React.lazy(() =>
  import("./wrappers/SeatSettingsWrapper.ts"),
);

// Re-export UI components
export * from "./UIComponents.tsx";

// Loading fallback component
export const PropertiesLoadingFallback = () => (
  <div className="p-4 text-gray-500 text-center">
    <div className="animate-pulse">Loading properties...</div>
  </div>
);

// Wrapper component for lazy loading with suspense
export const LazyPropertySection = ({ children }: { children: ReactNode }) => (
  <Suspense fallback={<PropertiesLoadingFallback />}>{children}</Suspense>
);
