type TerraOsMobileReferenceHeroRuntime = {
  owners: number;
  release: () => void;
};

type TerraOsMobileReferenceHeroWindow = Window & {
  __terraosMobileReferenceHeroRuntime?: TerraOsMobileReferenceHeroRuntime;
};

const STYLE_ID = "terraos-mobile-reference-hero-style";
const ROOT_DATASET_VALUE = "true";

const REFERENCE_HERO_CSS = `
@media (max-width: 560px) {
  html[data-terraos-mobile-reference-hero="${ROOT_DATASET_VALUE}"]:not([data-terraos-reduced-motion="true"])
    .hero-copy {
    position: absolute !important;
    inset-inline: 0 !important;
    top: max(8.75rem, 18svh) !important;
    width: min(100%, 900px) !important;
    margin-inline: auto !important;
    z-index: 4 !important;
  }

  html[data-terraos-mobile-reference-hero="${ROOT_DATASET_VALUE}"]:not([data-terraos-reduced-motion="true"])
    .hero-stage {
    position: sticky !important;
    top: 52svh !important;
    margin-top: 0 !important;
    z-index: 3 !important;
  }
}
`;

/**
 * Locks only the opening mobile geometry to the approved three-phone reference:
 * launch copy in the upper portion of the viewport, then Home/Participate/Explore
 * together immediately below the countdown. Existing scroll-driven transforms,
 * side-phone fading, micro-motion and the later Home handoff remain authoritative.
 */
export function installTerraOsTeaserMobileReferenceHero(frame: HTMLElement) {
  const hostDocument = frame.ownerDocument;
  const hostWindow = hostDocument.defaultView as TerraOsMobileReferenceHeroWindow | null;
  const maintenanceRoot = hostDocument.querySelector<HTMLElement>(
    '[data-solaris-maintenance="true"]',
  );
  if (!hostWindow || !maintenanceRoot) return () => undefined;

  const existing = hostWindow.__terraosMobileReferenceHeroRuntime;
  if (existing) {
    existing.owners += 1;
    return () => {
      existing.owners = Math.max(0, existing.owners - 1);
      if (existing.owners === 0) {
        existing.release();
        delete hostWindow.__terraosMobileReferenceHeroRuntime;
      }
    };
  }

  const root = hostDocument.documentElement;
  let style = hostDocument.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = hostDocument.createElement("style");
    style.id = STYLE_ID;
    style.textContent = REFERENCE_HERO_CSS;
    hostDocument.head.appendChild(style);
  }
  root.dataset.terraosMobileReferenceHero = ROOT_DATASET_VALUE;

  let released = false;
  const runtime: TerraOsMobileReferenceHeroRuntime = {
    owners: 1,
    release: () => {
      if (released) return;
      released = true;
      style?.remove();
      delete root.dataset.terraosMobileReferenceHero;
    },
  };

  hostWindow.__terraosMobileReferenceHeroRuntime = runtime;

  return () => {
    runtime.owners = Math.max(0, runtime.owners - 1);
    if (runtime.owners === 0) {
      runtime.release();
      delete hostWindow.__terraosMobileReferenceHeroRuntime;
    }
  };
}
