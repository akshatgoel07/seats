"use client";

import { useEffect, useRef } from "react";

export const useTour = () => {
  const driverRef = useRef(/** @type {any} */ (null));
  const styleInjectedRef = useRef(false);

  // Destroy any created driver on unmount.
  useEffect(() => {
    return () => {
      if (driverRef.current) {
        driverRef.current.destroy();
        driverRef.current = null;
      }
    };
  }, []);

  // R13: lazy-load tourConfig (which pulls in driver.js, ~84KB + CSS) only when
  // the user actually starts the tour, so it stays out of the editor's initial
  // bundle instead of being eagerly imported on mount.
  const startTour = async () => {
    const { createTourDriver, tourStyles } = await import("../tourConfig");

    if (!styleInjectedRef.current) {
      const styleElement = document.createElement("style");
      styleElement.innerHTML = tourStyles;
      document.head.appendChild(styleElement);
      styleInjectedRef.current = true;
    }

    if (!driverRef.current) {
      driverRef.current = createTourDriver();
    }

    driverRef.current.drive();
  };

  return { startTour };
};
