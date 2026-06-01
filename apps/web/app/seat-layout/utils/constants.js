/**
 * Constants for seat layout configuration
 */

// Zoom threshold constants - adjust these values to control when seating section images are hidden
// When viewBox.width is less than SEATING_SECTION_HIDE_IMAGE_THRESHOLD, images are hidden (zoomed in)
// When viewBox.width is greater than SEATING_SECTION_SHOW_LABEL_THRESHOLD, labels are shown (zoomed out)
export const SEATING_SECTION_HIDE_IMAGE_THRESHOLD = 1500; // Hide seating section images when viewBox.width < this value
export const SEATING_SECTION_SHOW_LABEL_THRESHOLD = 1500; // Show seating section labels when viewBox.width > this value
export const TEXT_HIDE_THRESHOLD = 1500; // Hide text elements when viewBox.width < this value (zoomed in)

// Performance optimization: Add buffer to start rendering slightly before threshold to avoid jarring transitions
// Sections start rendering when viewBox.width approaches this value (prevents performance issues from hidden rendering)
export const SEATING_SECTION_RENDER_PREVIEW_THRESHOLD =
  SEATING_SECTION_HIDE_IMAGE_THRESHOLD + 200; // Start rendering 200px before hide threshold

// Zoom control constants
export const ZOOM_IN_SCALE = 0.85; // Scale factor for zooming in (reduces viewBox size) - smaller = faster
export const ZOOM_OUT_SCALE = 1.15; // Scale factor for zooming out (increases viewBox size) - larger = faster
export const ZOOM_WHEEL_SCALE_IN = 1.1; // Scale factor for mouse wheel zoom in - larger = faster
export const ZOOM_WHEEL_SCALE_OUT = 0.9; // Scale factor for mouse wheel zoom out - smaller = faster
export const MIN_VIEWBOX_WIDTH = 200; // Minimum viewBox width (maximum zoom in)
export const MAX_VIEWBOX_WIDTH = 5000; // Maximum viewBox width (maximum zoom out) - increased to match editor scale flexibility
export const SEAT_ZOOM_THRESHOLD = 1500; // Threshold to trigger zoom to seat on click
export const SEAT_ZOOM_WIDTH = 1200; // ViewBox width when zoomed to seat
export const SEAT_ZOOM_HEIGHT = 720; // ViewBox height when zoomed to seat
export const SEAT_HIDE_THRESHOLD = 1500; // Hide seats when viewBox.width > this value (zoomed out)

// Viewport culling - render padding for smooth scrolling
// Mobile devices need more padding to prevent seats from being hidden at screen edges
export const VIEWPORT_PADDING_DESKTOP = 500; // Desktop padding - render elements slightly outside viewport
export const VIEWPORT_PADDING_MOBILE = 1500; // Mobile padding - increased to prevent seats being hidden at far ends in portrait mode

// Content bounds padding
export const CONTENT_BOUNDS_PADDING = 0.2; // 20% padding on each side of content

// Reserve type IDs for blocked seats
export const RESERVE_TYPE_BLOCKED = 8;
export const RESERVE_TYPE_BLOCKED_12 = 12;
export const RESERVE_TYPE_BLOCKED_13 = 13;
export const BLOCKED_RESERVE_TYPES = [
  RESERVE_TYPE_BLOCKED,
  RESERVE_TYPE_BLOCKED_12,
  RESERVE_TYPE_BLOCKED_13,
];

// Seat status constants
export const SEAT_STATUS_AVAILABLE = "0";
export const OPEN_SEATING_AREA_FLAG = "Y";

// Seat color constants
export const COLOR_SELECTED = "#51cf66"; // Green for selected seats
export const COLOR_UNAVAILABLE = "#ff6b6b"; // Red for unavailable seats
export const COLOR_BLOCKED = "#939597"; // Gray for blocked seats
export const COLOR_DEFAULT = "#74b9ff"; // Default blue for available seats

// Standing section constants
export const MAX_STANDING_QUANTITY = 10; // Maximum tickets per standing section purchase

// Default viewBox configuration
export const DEFAULT_VIEWBOX = {
  x: -900,
  y: -300,
  width: 2000,
  height: 1200,
};

// Animation and timing constants
export const SOLD_OUT_MESSAGE_DURATION = 3000; // Auto-hide sold out message after 3 seconds

// Element type constants
export const ELEMENT_TYPE_PATH = "path";
export const ELEMENT_TYPE_CIRCLE = "circle";
export const ELEMENT_TYPE_RECTANGLE = "rectangle";
export const ELEMENT_TYPE_TEXT = "text";
export const ELEMENT_TYPE_IMAGE = "image";
export const ELEMENT_TYPE_STANDING_SECTION = "standing-section";
export const ELEMENT_TYPE_SEATING_SECTION = "seating-section";
export const ELEMENT_TYPE_GROUP = "group";

// Label constants
export const BOUNDARY_LABEL = "Boundary";

// Performance monitoring constants
export const SHOW_FPS_STATS = false; // Toggle FPS monitor display (set to false for production)

// Performance testing flags - Toggle rendering of specific element types to identify bottlenecks
export const RENDER_PATHS = true; // Render boundary paths (bezier curves)
export const RENDER_IMAGES = true; // Render standalone image elements
export const RENDER_SEATING_SECTION_IMAGES = true; // Render seating section background images
export const RENDER_SEATS = true; // Render individual seats
export const RENDER_CANVAS_ELEMENTS = true; // Render all canvas elements (circles, rectangles, text, standing sections)

// Preview visibility control - Controls whether to show SeatPreview component for seat-layout/:id?ssId=:id&mdId=:id routes
export const SHOW_SEAT_PREVIEW = false; // Set to false to hide preview, true to show preview
// Tooltip configuration
export const SHOW_TOOLTIP = true; // Set to false to disable seat tooltips
