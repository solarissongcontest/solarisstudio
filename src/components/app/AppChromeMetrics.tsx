import { useEffect } from "react";

/**
 * Shared safe-area aliases for Public, Participant and Organizer chrome.
 *
 * AppRuntime's createAppViewportController is the sole owner of live
 * visualViewport measurements, keyboard inset and keyboard-open state.
 * A second observer here previously overwrote its pinch-zoom/focus-aware
 * keyboard decision, causing the floating dock to hide spuriously.
 */
export function AppChromeMetrics() {
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--solaris-safe-top", "env(safe-area-inset-top)");
    root.style.setProperty("--solaris-safe-right", "env(safe-area-inset-right)");
    root.style.setProperty("--solaris-safe-bottom", "env(safe-area-inset-bottom)");
    root.style.setProperty("--solaris-safe-left", "env(safe-area-inset-left)");

    return () => {
      root.style.removeProperty("--solaris-safe-top");
      root.style.removeProperty("--solaris-safe-right");
      root.style.removeProperty("--solaris-safe-bottom");
      root.style.removeProperty("--solaris-safe-left");
    };
  }, []);

  return null;
}
