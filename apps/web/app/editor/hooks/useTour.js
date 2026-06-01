"use client";

import { useEffect, useRef } from 'react';
import { createTourDriver, tourStyles } from '../tourConfig';

export const useTour = () => {
  const driverRef = useRef(/** @type {ReturnType<typeof createTourDriver> | null} */ (null));
  const styleInjectedRef = useRef(false);

  useEffect(() => {
    // Inject custom styles only once
    if (!styleInjectedRef.current) {
      const styleElement = document.createElement('style');
      styleElement.innerHTML = tourStyles;
      document.head.appendChild(styleElement);
      styleInjectedRef.current = true;
    }

    // Initialize driver
    driverRef.current = createTourDriver();

    // Cleanup
    return () => {
      if (driverRef.current) {
        driverRef.current.destroy();
      }
    };
  }, []);

  const startTour = () => {
    if (driverRef.current) {
      driverRef.current.drive();
    }
  };

  return { startTour };
};
