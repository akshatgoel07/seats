import { useRef, useCallback, useEffect } from "react";

/**
 * Hook to debounce a callback function and track when to commit to history
 * Useful for property updates that should batch into a single undo action
 */
export function useDebounceCallback<TArgs extends unknown[]>(
  callback: (...args: TArgs) => void,
  delay = 500,
): [(...args: TArgs) => void, () => void] {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef(false);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const debouncedCallback = useCallback(
    (...args: TArgs) => {
      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Mark that we have pending changes
      pendingRef.current = true;

      // Set new timeout
      timeoutRef.current = setTimeout(() => {
        callback(...args);
        pendingRef.current = false;
      }, delay);
    },
    [callback, delay]
  );

  const flush = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (pendingRef.current) {
      // Callback would have been called, mark as not pending
      pendingRef.current = false;
    }
  }, []);

  return [debouncedCallback, flush];
}
