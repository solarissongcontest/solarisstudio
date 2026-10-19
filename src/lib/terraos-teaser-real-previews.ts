export const TERRAOS_REAL_PREVIEW_SCREENS = [
  "home",
  "explore",
  "participate",
  "results",
  "me",
] as const;

export type TerraOsRealPreviewScreen = (typeof TERRAOS_REAL_PREVIEW_SCREENS)[number];

const REAL_PREVIEW_STYLE_ID = "terraos-real-v3-preview-style";
const REAL_PREVIEW_CLASS = "terraos-v3-nav-preview";
const RESULTS_REVEAL_PREVIEW_CLASS = "terraos-v3-results-reveal-preview";

const SCREEN_LABELS: Record<TerraOsRealPreviewScreen, string> = {
  home: "Home",
  explore: "Explore",
  participate: "Participate",
  results: "Results",
  me: "Me",
};

const REAL_PREVIEW_STYLE = `
/* Keep the full first-look phone inside short desktop viewports. The base
 * maintenance page already uses this cap; the choreography's larger visual
 * treatment must not make the complete device taller than the viewport-safe
 * contract exercised by Browser Audit. */
html[data-terraos-release-choreography="v2"] [data-terra-first-look="true"] .preview-device {
  width: min(390px, 76vw, 36.05svh) !important;
}
.story-touch .nav-pane[data-terraos-real-preview] {
  position: absolute;
  inset: 3.45rem clamp(.7rem, 2vw, 1.2rem) 5.55rem;
  margin: 0 !important;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,.07);
  border-radius: 1.2rem;
  background: #030914;
}
.story-touch .nav-pane[data-terraos-real-preview] > :not(.terraos-v3-nav-preview) {
  display: none !important;
}
.story-touch .terraos-v3-nav-preview {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
  background: #02050a;
  pointer-events: none;
}
.results-story .results-ui[data-terraos-real-results-preview="true"] {
  isolation: isolate;
}
.results-story .results-ui[data-terraos-real-results-preview="true"] > :not(.terraos-v3-results-reveal-preview):not(.results-mask) {
  opacity: 0 !important;
  pointer-events: none;
}
.results-story .terraos-v3-results-reveal-preview {
  position: absolute;
  inset: 0;
  z-index: 2;
  width: 100%;
  height: 100%;
  border: 0;
  background: #02050a;
  opacity: 0;
  pointer-events: none;
}
.results-story .results-ui[data-terraos-real-results-preview="true"] .terraos-v3-results-reveal-preview {
  opacity: 1;
}
.results-story .results-ui[data-terraos-real-results-preview="true"] .results-mask {
  z-index: 3;
}
@media (max-width:560px) {
  .story-touch .nav-pane[data-terraos-real-preview] {
    inset: 3.2rem .65rem 5.15rem;
    border-radius: 1rem;
  }
}
`;

function readOwnerCount(root: HTMLElement) {
  const value = Number.parseInt(root.dataset.terraosRealPreviewOwners ?? "0", 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function createFixturePreview(
  hostDocument: Document,
  screen: TerraOsRealPreviewScreen,
  className: string,
  title: string,
  loading: "eager" | "lazy",
) {
  const preview = hostDocument.createElement("iframe");
  preview.className = className;
  preview.src = `/terraos-teaser-preview?screen=${screen}&chrome=content`;
  preview.title = title;
  preview.tabIndex = -1;
  preview.loading = loading;
  preview.setAttribute("scrolling", "no");
  preview.setAttribute("sandbox", "allow-scripts allow-same-origin");
  preview.setAttribute("aria-hidden", "true");
  return preview;
}

/**
 * Replaces the maintenance page's static Five Places pane artwork with
 * same-origin, fixture-only renders of the actual production V3 screens.
 *
 * The existing host markup remains in the document as a no-JS fallback. This
 * enhancer performs no product reads or mutations and leaves the host-owned
 * liquid navigation in place, so the NAV lane keeps sole ownership of the
 * production app shell/tab implementation.
 *
 * When the Results reveal phase exists, the same fixture-only Results renderer
 * also fills the staged result card. The host scroll controller still owns the
 * reveal timing; this enhancer only swaps the card's visual payload from the
 * static fallback rows to the production V3 Results surface after that frame
 * has loaded. The fallback stays semantically available for assistive tech and
 * stays visible if the nested preview ever fails to load.
 */
export function installTerraOsTeaserRealHostPreviews(frame: HTMLElement) {
  const hostDocument = frame.ownerDocument;
  const root = hostDocument.querySelector<HTMLElement>('[data-solaris-maintenance="true"]');
  if (!root) return () => undefined;

  const panes = Array.from(
    root.querySelectorAll<HTMLElement>(".story-touch .nav-pane[data-pane]"),
  );
  if (panes.length < TERRAOS_REAL_PREVIEW_SCREENS.length) return () => undefined;

  root.dataset.terraosRealPreviewOwners = String(readOwnerCount(root) + 1);

  if (root.dataset.terraosRealPreviews !== "true") {
    root.dataset.terraosRealPreviews = "true";

    if (!hostDocument.getElementById(REAL_PREVIEW_STYLE_ID)) {
      const style = hostDocument.createElement("style");
      style.id = REAL_PREVIEW_STYLE_ID;
      style.textContent = REAL_PREVIEW_STYLE;
      hostDocument.head.appendChild(style);
    }

    for (const [index, screen] of TERRAOS_REAL_PREVIEW_SCREENS.entries()) {
      const pane = panes[index];
      if (!pane) continue;

      pane.dataset.terraosRealPreview = screen;
      pane.appendChild(
        createFixturePreview(
          hostDocument,
          screen,
          REAL_PREVIEW_CLASS,
          `TerraOS ${SCREEN_LABELS[screen]} page preview`,
          index === 0 ? "eager" : "lazy",
        ),
      );
    }

    const resultsUi = root.querySelector<HTMLElement>(".results-story .results-ui");
    if (resultsUi) {
      const resultsPreview = createFixturePreview(
        hostDocument,
        "results",
        RESULTS_REVEAL_PREVIEW_CLASS,
        "TerraOS Results reveal preview",
        "lazy",
      );
      resultsPreview.addEventListener(
        "load",
        () => {
          if (resultsPreview.isConnected) {
            resultsUi.dataset.terraosRealResultsPreview = "true";
          }
        },
        { once: true },
      );
      resultsUi.appendChild(resultsPreview);
    }
  }

  return () => {
    const remainingOwners = Math.max(0, readOwnerCount(root) - 1);
    if (remainingOwners > 0) {
      root.dataset.terraosRealPreviewOwners = String(remainingOwners);
      return;
    }

    delete root.dataset.terraosRealPreviewOwners;
    delete root.dataset.terraosRealPreviews;

    for (const pane of panes) {
      pane.querySelectorAll(`.${REAL_PREVIEW_CLASS}`).forEach((preview) => preview.remove());
      delete pane.dataset.terraosRealPreview;
    }

    root
      .querySelectorAll(`.${RESULTS_REVEAL_PREVIEW_CLASS}`)
      .forEach((preview) => preview.remove());
    root
      .querySelectorAll<HTMLElement>('[data-terraos-real-results-preview="true"]')
      .forEach((resultsUi) => delete resultsUi.dataset.terraosRealResultsPreview);

    hostDocument.getElementById(REAL_PREVIEW_STYLE_ID)?.remove();
  };
}
