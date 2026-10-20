const STYLE_ID = "terraos-mobile-accessibility-style";

type TerraOsMobileAccessibilityRuntime = {
  owners: number;
  release: () => void;
};

type TerraOsMobileAccessibilityWindow = Window & {
  __terraosMobileAccessibilityRuntime?: TerraOsMobileAccessibilityRuntime;
};

const REDUCED_MOTION_CSS = `
@media (max-width: 560px) {
  html[data-terraos-mobile-composition="v1"][data-terraos-reduced-motion="true"] .story-touch[data-terra-scroll-scene="true"],
  html[data-terraos-mobile-composition="v1"][data-terraos-reduced-motion="true"] .participation-story[data-terra-scroll-scene="true"],
  html[data-terraos-mobile-composition="v1"][data-terraos-reduced-motion="true"] .participation-story[data-terra-scroll-scene="true"] .story-grid,
  html[data-terraos-mobile-composition="v1"][data-terraos-reduced-motion="true"] .results-story[data-terra-scroll-scene="true"] {
    min-height: auto !important;
  }

  html[data-terraos-mobile-composition="v1"][data-terraos-reduced-motion="true"] .story-touch[data-terra-scroll-scene="true"] .story-heading,
  html[data-terraos-mobile-composition="v1"][data-terraos-reduced-motion="true"] .participation-story[data-terra-scroll-scene="true"] .story-heading,
  html[data-terraos-mobile-composition="v1"][data-terraos-reduced-motion="true"] .results-story[data-terra-scroll-scene="true"] .story-heading {
    position: static !important;
    transform: none !important;
    opacity: 1 !important;
    filter: none !important;
  }
}
`;

/**
 * The compact teaser intentionally overrides the normal cinematic scene budget.
 * This guard restores the canonical reduced-motion structure after those mobile
 * overrides so accessibility preferences never leave several viewport-heights
 * of inert scroll space behind. The maintenance page contains more than one
 * full Home preview, so ownership is reference-counted just like the other host
 * presentation bridges.
 */
export function installTerraOsTeaserMobileAccessibility(document: Document) {
  const hostWindow = document.defaultView as TerraOsMobileAccessibilityWindow | null;
  if (!hostWindow) return () => undefined;

  const existingRuntime = hostWindow.__terraosMobileAccessibilityRuntime;
  if (existingRuntime) {
    existingRuntime.owners += 1;
    return () => {
      existingRuntime.owners = Math.max(0, existingRuntime.owners - 1);
      if (existingRuntime.owners === 0) {
        existingRuntime.release();
        delete hostWindow.__terraosMobileAccessibilityRuntime;
      }
    };
  }

  const existingStyle = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  const style = existingStyle ?? document.createElement("style");
  const ownsStyle = existingStyle === null;
  if (ownsStyle) {
    style.id = STYLE_ID;
    style.textContent = REDUCED_MOTION_CSS;
    document.head.appendChild(style);
  }

  let released = false;
  const runtime: TerraOsMobileAccessibilityRuntime = {
    owners: 1,
    release: () => {
      if (released) return;
      released = true;
      if (ownsStyle) style.remove();
    },
  };
  hostWindow.__terraosMobileAccessibilityRuntime = runtime;

  return () => {
    runtime.owners = Math.max(0, runtime.owners - 1);
    if (runtime.owners === 0) {
      runtime.release();
      delete hostWindow.__terraosMobileAccessibilityRuntime;
    }
  };
}
