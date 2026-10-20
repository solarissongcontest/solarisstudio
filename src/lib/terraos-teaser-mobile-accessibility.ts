const STYLE_ID = "terraos-mobile-accessibility-style";

type TerraOsMobileAccessibilityRuntime = {
  owners: number;
  release: () => void;
};

type TerraOsMobileAccessibilityWindow = Window & {
  __terraosMobileAccessibilityRuntime?: TerraOsMobileAccessibilityRuntime;
};

const MOBILE_ACCESSIBILITY_CSS = `
@media (max-width: 560px) {
  html[data-terraos-mobile-composition="v1"] [data-terra-first-look="true"] .first-look {
    padding-top: max(5.5rem, calc(env(safe-area-inset-top) + 3.75rem)) !important;
  }

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
 * Mobile teaser polish must preserve the maintenance page's safe-area contract
 * and its canonical reduced-motion fallback. The maintenance page contains more
 * than one full Home preview, so ownership is reference-counted just like the
 * other host presentation bridges.
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
    style.textContent = MOBILE_ACCESSIBILITY_CSS;
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
