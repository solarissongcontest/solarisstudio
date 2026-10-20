const STYLE_ID = "terraos-mobile-accessibility-style";

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
 * of inert scroll space behind.
 */
export function installTerraOsTeaserMobileAccessibility(document: Document) {
  const existing = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (existing) return () => undefined;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = REDUCED_MOTION_CSS;
  document.head.appendChild(style);

  return () => style.remove();
}
