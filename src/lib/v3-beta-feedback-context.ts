export type V3BetaFeedbackViewportClass = "compact" | "medium" | "wide";
export type V3BetaFeedbackInstallation = "browser" | "installed_app";

export type V3BetaFeedbackContext = {
  viewportClass: V3BetaFeedbackViewportClass;
  installation: V3BetaFeedbackInstallation;
  reducedMotion: boolean;
};

export function classifyV3BetaFeedbackViewport(width: number): V3BetaFeedbackViewportClass {
  if (!Number.isFinite(width) || width <= 0) return "medium";
  if (width < 600) return "compact";
  if (width < 1024) return "medium";
  return "wide";
}

/**
 * Capture only coarse UI-reproduction context. Do not add exact viewport sizes,
 * user-agent strings, IP-derived location, device identifiers or other
 * fingerprinting material here.
 */
export function readV3BetaFeedbackContext(): V3BetaFeedbackContext {
  if (typeof window === "undefined") {
    return {
      viewportClass: "medium",
      installation: "browser",
      reducedMotion: false,
    };
  }

  return {
    viewportClass: classifyV3BetaFeedbackViewport(window.innerWidth),
    installation:
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: window-controls-overlay)").matches
        ? "installed_app"
        : "browser",
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  };
}
