const HOST_STYLE_ID = "terraos-mobile-composition-style";
const PREVIEW_STYLE_ID = "terraos-preview-composition-style";
const HOST_POLISH_VERSION = "v1";

export const TERRAOS_COMPACT_PREVIEW_MEDIA = "(max-width: 560px)";

export function isTerraOsCompactPreviewWidth(width: number) {
  return Number.isFinite(width) && width <= 560;
}

type TerraOsMobileCompositionRuntime = {
  owners: number;
  release: () => void;
};

type TerraOsMobileCompositionWindow = Window & {
  __terraosMobileCompositionRuntime?: TerraOsMobileCompositionRuntime;
};

/*
 * The maintenance teaser is deliberately cinematic, but mobile must not inherit
 * the desktop scene lengths. The original 300–360svh mobile overrides created
 * entire blank viewports between meaningful states and let sticky headings and
 * the hero handoff collide with later sections. These overrides keep the same
 * scenes and scroll-driven choreography while giving each scene a bounded mobile
 * budget and a stable reading order.
 */
const HOST_MOBILE_POLISH_CSS = `
@media (max-width: 560px) {
  html[data-terraos-mobile-composition="${HOST_POLISH_VERSION}"] body {
    background: radial-gradient(circle at 50% -8%, rgba(59,133,192,.13), transparent 27rem), #000;
  }

  html[data-terraos-mobile-composition="${HOST_POLISH_VERSION}"] #terraos-release-local-nav {
    width: calc(100% - 1.25rem);
    min-height: 46px;
    padding: .5rem .72rem;
    border-color: rgba(255,255,255,.09);
    background: rgba(8,10,14,.79);
    box-shadow: 0 10px 34px rgba(0,0,0,.26), inset 0 1px 0 rgba(255,255,255,.055);
    -webkit-backdrop-filter: blur(15px) saturate(118%);
    backdrop-filter: blur(15px) saturate(118%);
  }

  html[data-terraos-mobile-composition="${HOST_POLISH_VERSION}"] #terraos-release-local-nav strong {
    font-size: .76rem;
  }

  html[data-terraos-mobile-composition="${HOST_POLISH_VERSION}"] #terraos-release-local-nav span {
    font-size: .61rem;
  }

  html[data-terraos-mobile-composition="${HOST_POLISH_VERSION}"] .product-story {
    overflow: clip;
  }

  html[data-terraos-mobile-composition="${HOST_POLISH_VERSION}"] .story {
    width: calc(100% - 1.5rem);
    padding: clamp(4.35rem, 13vw, 5.75rem) 0;
  }

  html[data-terraos-mobile-composition="${HOST_POLISH_VERSION}"] .story h2 {
    max-width: 8.7ch;
    font-size: clamp(2.7rem, 12.6vw, 3.85rem);
    line-height: .94;
    letter-spacing: -.058em;
    text-wrap: balance;
  }

  html[data-terraos-mobile-composition="${HOST_POLISH_VERSION}"] .eyebrow {
    margin-bottom: .7rem;
    font-size: .67rem;
  }

  html[data-terraos-mobile-composition="${HOST_POLISH_VERSION}"] [data-terra-first-look="true"] .first-look {
    min-height: auto !important;
    margin-top: 2rem;
    gap: 1.55rem;
    padding: 0 !important;
    padding-top: 0 !important;
    overflow: visible;
  }

  html[data-terraos-mobile-composition="${HOST_POLISH_VERSION}"] [data-terra-first-look="true"] .first-look-copy {
    max-width: 22rem;
  }

  html[data-terraos-mobile-composition="${HOST_POLISH_VERSION}"] [data-terra-first-look="true"] .first-look-copy h3 {
    font-size: clamp(2rem, 10vw, 2.65rem);
    line-height: .98;
  }

  html[data-terraos-mobile-composition="${HOST_POLISH_VERSION}"] [data-terra-first-look="true"] .first-look-copy p {
    margin-top: .72rem;
    max-width: 24rem;
    font-size: .88rem;
  }

  html[data-terraos-mobile-composition="${HOST_POLISH_VERSION}"] [data-terra-first-look="true"] .preview-device {
    width: min(328px, 84vw, 35svh) !important;
    max-width: 100%;
    margin: .4rem auto 0;
    border-radius: 2.45rem;
    box-shadow: 0 28px 78px rgba(0,0,0,.56);
  }

  html[data-terraos-mobile-composition="${HOST_POLISH_VERSION}"] .story-touch[data-terra-scroll-scene="true"] {
    min-height: 210svh !important;
  }

  html[data-terraos-mobile-composition="${HOST_POLISH_VERSION}"] .story-touch[data-terra-scroll-scene="true"] .story-heading,
  html[data-terraos-mobile-composition="${HOST_POLISH_VERSION}"] .participation-story[data-terra-scroll-scene="true"] .story-heading,
  html[data-terraos-mobile-composition="${HOST_POLISH_VERSION}"] .results-story[data-terra-scroll-scene="true"] .story-heading {
    position: relative !important;
    top: auto !important;
    transform: none;
  }

  html[data-terraos-mobile-composition="${HOST_POLISH_VERSION}"] .story-touch[data-terra-scroll-scene="true"] .interactive-device {
    top: max(4.8rem, 9svh) !important;
    width: min(100%, 25rem);
    margin-top: 2rem;
    padding: .48rem;
    border-radius: 1.65rem;
  }

  html[data-terraos-mobile-composition="${HOST_POLISH_VERSION}"] .story-touch[data-terra-scroll-scene="true"] .interactive-screen {
    min-height: min(520px, 69svh);
    padding: 1.35rem .82rem 5.35rem;
    border-radius: 1.28rem;
  }

  html[data-terraos-mobile-composition="${HOST_POLISH_VERSION}"] .story-touch[data-terra-scroll-scene="true"] .nav-pane {
    top: 4.45rem;
    left: .82rem;
    right: .82rem;
  }

  html[data-terraos-mobile-composition="${HOST_POLISH_VERSION}"] .story-touch .liquid-nav {
    left: .5rem;
    right: .5rem;
    bottom: .5rem;
    height: 3.85rem;
    border-radius: 1.35rem;
    background: rgba(16,24,38,.76);
    -webkit-backdrop-filter: blur(18px) saturate(138%);
    backdrop-filter: blur(18px) saturate(138%);
  }

  html[data-terraos-mobile-composition="${HOST_POLISH_VERSION}"] .story-touch .liquid-lens {
    top: .3rem;
    bottom: .3rem;
    left: .3rem;
    width: calc((100% - .6rem)/5);
    border-radius: 1.05rem;
  }

  html[data-terraos-mobile-composition="${HOST_POLISH_VERSION}"] .participation-story[data-terra-scroll-scene="true"] {
    min-height: 178svh !important;
  }

  html[data-terraos-mobile-composition="${HOST_POLISH_VERSION}"] .participation-story[data-terra-scroll-scene="true"] .story-grid {
    min-height: 150svh !important;
    gap: 2rem;
  }

  html[data-terraos-mobile-composition="${HOST_POLISH_VERSION}"] .participation-story[data-terra-scroll-scene="true"] .participation-device {
    top: max(4.8rem, 9svh) !important;
    width: min(100%, 25rem);
    justify-self: center;
    padding: .9rem;
    border-radius: 1.45rem;
  }

  html[data-terraos-mobile-composition="${HOST_POLISH_VERSION}"] .participation-header strong {
    margin-top: .35rem;
    font-size: clamp(2rem, 10vw, 2.7rem);
    line-height: .98;
  }

  html[data-terraos-mobile-composition="${HOST_POLISH_VERSION}"] .state-sequence {
    margin-top: 1rem;
    gap: .55rem;
  }

  html[data-terraos-mobile-composition="${HOST_POLISH_VERSION}"] .state-card {
    min-height: 4rem;
    gap: .68rem;
    padding: .72rem .76rem;
    border-radius: .95rem;
  }

  html[data-terraos-mobile-composition="${HOST_POLISH_VERSION}"] .state-number {
    width: 2.1rem;
    height: 2.1rem;
    border-radius: .67rem;
  }

  html[data-terraos-mobile-composition="${HOST_POLISH_VERSION}"] .state-card:nth-child(n+5) {
    display: none !important;
  }

  html[data-terraos-mobile-composition="${HOST_POLISH_VERSION}"] .results-story[data-terra-scroll-scene="true"] {
    min-height: 188svh !important;
  }

  html[data-terraos-mobile-composition="${HOST_POLISH_VERSION}"] .results-story[data-terra-scroll-scene="true"] .results-reveal {
    top: max(5rem, 9svh) !important;
    width: min(100%, 25rem);
    min-height: min(530px, 70svh);
    margin-top: 2rem;
    border-radius: 1.65rem;
  }

  html[data-terraos-mobile-composition="${HOST_POLISH_VERSION}"] .results-spotlight span {
    font-size: clamp(4.4rem, 24vw, 7rem);
  }

  html[data-terraos-mobile-composition="${HOST_POLISH_VERSION}"] .results-ui {
    margin: 0 .72rem .72rem;
    padding: .95rem;
    border-radius: 1.25rem;
  }

  html[data-terraos-mobile-composition="${HOST_POLISH_VERSION}"] .results-title-row b {
    font-size: 1.2rem;
  }

  html[data-terraos-mobile-composition="${HOST_POLISH_VERSION}"] .interface-details {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: .5rem;
    margin-top: .65rem;
  }

  html[data-terraos-mobile-composition="${HOST_POLISH_VERSION}"] .detail-crop {
    min-height: 128px;
    padding: .7rem;
    border-radius: 1rem;
  }

  html[data-terraos-mobile-composition="${HOST_POLISH_VERSION}"] .detail-crop > span {
    font-size: .48rem;
    letter-spacing: .09em;
  }

  html[data-terraos-mobile-composition="${HOST_POLISH_VERSION}"] .detail-pill {
    left: 8%;
    right: 8%;
    bottom: 18%;
    height: 2.45rem;
    border-radius: 1rem;
  }

  html[data-terraos-mobile-composition="${HOST_POLISH_VERSION}"] .detail-status {
    left: 7%;
    right: 7%;
    top: 43%;
    gap: .4rem;
    padding: .48rem;
    border-radius: .72rem;
  }

  html[data-terraos-mobile-composition="${HOST_POLISH_VERSION}"] .detail-status i {
    width: .46rem;
    height: .46rem;
    flex: 0 0 auto;
  }

  html[data-terraos-mobile-composition="${HOST_POLISH_VERSION}"] .detail-status b {
    min-width: 0;
    font-size: .55rem;
    line-height: 1.15;
  }

  html[data-terraos-mobile-composition="${HOST_POLISH_VERSION}"] .detail-score {
    font-size: 3.35rem;
  }

  html[data-terraos-mobile-composition="${HOST_POLISH_VERSION}"] .final-countdown {
    padding-top: 5rem;
    padding-bottom: 5.5rem;
  }
}
`;

/*
 * The teaser intentionally reuses the real V3 screen components. This styling
 * is scoped to the fixture route only: it makes the static preview navigation
 * visually icon-first, keeps its accessible names in the tree, and gives the
 * fake-device content predictable top/bottom breathing room. Installed V3 NAV
 * remains entirely owned by the Navigation lane.
 */
const PREVIEW_POLISH_CSS = `
[data-terraos-teaser-preview] .v3-top-context {
  min-height: 4.2rem;
  padding-top: 1.15rem;
}

[data-terraos-teaser-preview] .v3-screen {
  padding-top: .85rem;
  padding-bottom: 6.35rem;
}

[data-terraos-teaser-preview] .v3-display {
  max-width: 12ch;
  font-size: clamp(2rem, 9vw, 2.75rem);
}

[data-terraos-teaser-preview] .v3-bottom-nav {
  left: 50%;
  right: auto;
  bottom: max(.72rem, env(safe-area-inset-bottom));
  width: min(calc(100% - 1.35rem), 23rem);
  min-height: 4.2rem;
  transform: translateX(-50%);
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: .18rem;
  padding: .34rem;
  border: 1px solid rgba(194,224,255,.17);
  border-radius: 1.5rem;
  background: rgba(16,27,47,.78);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.085), 0 14px 38px rgba(0,0,0,.3);
  -webkit-backdrop-filter: blur(20px) saturate(145%);
  backdrop-filter: blur(20px) saturate(145%);
}

[data-terraos-teaser-preview] .v3-bottom-nav__item {
  min-width: 0;
  min-height: 3.45rem;
  border: 1px solid transparent;
  border-radius: 1.12rem;
  color: rgba(220,231,246,.53);
}

[data-terraos-teaser-preview] .v3-bottom-nav__item[data-active="true"] {
  border-color: rgba(226,241,255,.18);
  color: #f7fbff;
  background: linear-gradient(145deg, rgba(255,255,255,.16), rgba(100,182,235,.075)) !important;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.15), 0 5px 16px rgba(0,0,0,.2) !important;
}

[data-terraos-teaser-preview] .v3-bottom-nav__label {
  position: absolute !important;
  width: 1px !important;
  height: 1px !important;
  padding: 0 !important;
  margin: -1px !important;
  overflow: hidden !important;
  clip: rect(0, 0, 0, 0) !important;
  white-space: nowrap !important;
  border: 0 !important;
}

@media (max-width: 420px) {
  [data-terraos-teaser-preview] .v3-bottom-nav {
    width: calc(100% - 1rem);
    min-height: 4rem;
    border-radius: 1.4rem;
  }

  [data-terraos-teaser-preview] .v3-bottom-nav__item {
    min-height: 3.3rem;
  }
}

@media (prefers-reduced-transparency: reduce) {
  [data-terraos-teaser-preview] .v3-bottom-nav {
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
    background: rgba(14,24,41,.96);
  }
}
`;

function installStyle(document: Document, id: string, css: string) {
  const existing = document.getElementById(id) as HTMLStyleElement | null;
  if (existing) return { style: existing, owned: false };
  const style = document.createElement("style");
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
  return { style, owned: true };
}

export function installTerraOsTeaserPreviewPolish(document: Document) {
  const { style, owned } = installStyle(document, PREVIEW_STYLE_ID, PREVIEW_POLISH_CSS);
  return () => {
    if (owned) style.remove();
  };
}

function refineParticipationCopy(document: Document) {
  const heading = document.querySelector<HTMLElement>(
    ".participation-story .participation-header strong",
  );
  if (!heading) return;
  if (!heading.dataset.terraosOriginalText) {
    heading.dataset.terraosOriginalText = heading.textContent ?? "";
  }
  heading.textContent = "Your responsibilities";
}

function restoreParticipationCopy(document: Document) {
  const heading = document.querySelector<HTMLElement>(
    ".participation-story .participation-header strong",
  );
  if (!heading?.dataset.terraosOriginalText) return;
  heading.textContent = heading.dataset.terraosOriginalText;
  delete heading.dataset.terraosOriginalText;
}

export function installTerraOsTeaserHostMobilePolish(frame: HTMLElement) {
  const hostDocument = frame.ownerDocument;
  const hostWindow = hostDocument.defaultView as TerraOsMobileCompositionWindow | null;
  const maintenanceRoot = hostDocument.querySelector<HTMLElement>(
    '[data-solaris-maintenance="true"]',
  );
  if (!hostWindow || !maintenanceRoot) return () => undefined;

  const existing = hostWindow.__terraosMobileCompositionRuntime;
  if (existing) {
    existing.owners += 1;
    return () => {
      existing.owners = Math.max(0, existing.owners - 1);
      if (existing.owners === 0) {
        existing.release();
        delete hostWindow.__terraosMobileCompositionRuntime;
      }
    };
  }

  const root = hostDocument.documentElement;
  const { style, owned } = installStyle(hostDocument, HOST_STYLE_ID, HOST_MOBILE_POLISH_CSS);
  root.dataset.terraosMobileComposition = HOST_POLISH_VERSION;
  refineParticipationCopy(hostDocument);

  let released = false;
  const runtime: TerraOsMobileCompositionRuntime = {
    owners: 1,
    release: () => {
      if (released) return;
      released = true;
      if (owned) style.remove();
      restoreParticipationCopy(hostDocument);
      delete root.dataset.terraosMobileComposition;
    },
  };

  hostWindow.__terraosMobileCompositionRuntime = runtime;

  return () => {
    runtime.owners = Math.max(0, runtime.owners - 1);
    if (runtime.owners === 0) {
      runtime.release();
      delete hostWindow.__terraosMobileCompositionRuntime;
    }
  };
}
