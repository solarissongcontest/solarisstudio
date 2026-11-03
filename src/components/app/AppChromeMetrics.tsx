import { useEffect } from "react";

/**
 * Shared safe-area aliases for persistent Solaris chrome.
 *
 * AppRuntime -> createAppViewportController is the single authoritative owner
 * of VisualViewport measurements, keyboard inset and keyboard-open state.
 * Keeping this component limited to safe-area aliases prevents two independent
 * listeners from racing to write the same root chrome state.
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
