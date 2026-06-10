/**
 * Device detection utilities
 */

/**
 * Detect if the current device is a mobile device
 * Uses multiple detection methods for better accuracy
 * @returns {boolean} True if mobile device, false otherwise
 */
export function isMobileDevice() {
  // Check if window is available (for SSR compatibility)
  if (typeof window === 'undefined') {
    return false;
  }

  // Method 1: Check user agent for mobile devices
  const userAgent =
    navigator.userAgent ||
    navigator.vendor ||
    /** @type {any} */ (window).opera;
  const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;

  // Method 2: Check for touch support
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  // Method 3: Check screen width (typical mobile breakpoint)
  const isNarrowScreen = window.innerWidth <= 768;

  // Device is considered mobile if:
  // - User agent matches mobile pattern, OR
  // - Has touch support AND narrow screen (to exclude tablets in landscape)
  return mobileRegex.test(userAgent) || (hasTouch && isNarrowScreen);
}

/**
 * Get the appropriate viewport padding based on device type
 * @param {number} desktopPadding - Padding value for desktop devices
 * @param {number} mobilePadding - Padding value for mobile devices
 * @returns {number} Appropriate padding value for current device
 */
export function getViewportPadding(desktopPadding, mobilePadding) {
  return isMobileDevice() ? mobilePadding : desktopPadding;
}
