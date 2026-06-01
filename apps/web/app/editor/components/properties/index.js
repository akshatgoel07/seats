import React, { Suspense } from "react";

// Lazy load the components for code splitting
export const SceneProperties = React.lazy(() =>
  import("./wrappers/ScenePropertiesWrapper.js"),
);
export const RowProperties = React.lazy(() =>
  import("./wrappers/RowPropertiesWrapper.js"),
);
export const SeatProperties = React.lazy(() =>
  import("./wrappers/SeatPropertiesWrapper.js"),
);
export const ElementProperties = React.lazy(() =>
  import("./wrappers/ElementPropertiesWrapper.js"),
);
export const ActionsPanel = React.lazy(() =>
  import("./wrappers/ActionsPanelWrapper.js"),
);
export const CategoriesPanel = React.lazy(() =>
  import("./wrappers/CategoriesPanelWrapper.js"),
);
export const SectionsPanel = React.lazy(() =>
  import("./wrappers/SectionsPanelWrapper.js"),
);
export const SeatSettings = React.lazy(() =>
  import("./wrappers/SeatSettingsWrapper.js"),
);

// Re-export UI components
export * from "./UIComponents.js";

// Loading fallback component
export const PropertiesLoadingFallback = () => (
  <div className="p-4 text-gray-500 text-center">
    <div className="animate-pulse">Loading properties...</div>
  </div>
);

// Wrapper component for lazy loading with suspense
export const LazyPropertySection = ({ children }) => (
  <Suspense fallback={<PropertiesLoadingFallback />}>{children}</Suspense>
);
