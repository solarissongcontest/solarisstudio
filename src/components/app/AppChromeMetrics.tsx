import { useEffect } from "react";

import "@/styles/app-safe-zone.css";

type IOSStandaloneNavigator = Navigator & {
  standalone?: boolean;
};

function isIOSStandalonePwa() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const nav = navigator as IOSStandaloneNavigator;
  const iosDevice =
    /iPad|iPhone|iPod/i.test(nav.userAgent) ||
    (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
  const standalone =
    nav.standalone === true ||
    window.matchMedia?.("(display-mode: standalone)").matches === true;
  return iosDevice && standalone;
}

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
    root.style.setProperty("--solaris-safe-top", "env(safe-area-inset-top, 0px)");
    root.style.setProperty("--solaris-safe-right", "env(safe-area-inset-right, 0px)");
    root.style.setProperty("--solaris-safe-bottom", "env(safe-area-inset-bottom, 0px)");
    root.style.setProperty("--solaris-safe-left", "env(safe-area-inset-left, 0px)");
    root.toggleAttribute("data-solaris-ios-standalone", isIOSStandalonePwa());

    return () => {
      root.style.removeProperty("--solaris-safe-top");
      root.style.removeProperty("--solaris-safe-right");
      root.style.removeProperty("--solaris-safe-bottom");
      root.style.removeProperty("--solaris-safe-left");
      root.removeAttribute("data-solaris-ios-standalone");
    };
  }, []);

  return null;
}
