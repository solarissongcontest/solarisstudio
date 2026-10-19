const HOST_CHOREOGRAPHY_VERSION = "v2";
const HOST_STYLE_ID = "terraos-release-choreography-style";
const HOST_LOCAL_NAV_ID = "terraos-release-local-nav";

export function clampTerraOsProgress(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function resolveTerraOsSectionProgress(
  rectTop: number,
  sectionHeight: number,
  viewportHeight: number,
) {
  const travel = Math.max(1, sectionHeight - viewportHeight);
  return clampTerraOsProgress(-rectTop / travel);
}

export function resolveTerraOsRevealProgress(
  progress: number,
  start: number,
  end: number,
) {
  if (end <= start) return progress >= end ? 1 : 0;
  return clampTerraOsProgress((progress - start) / (end - start));
}

function easedOut(progress: number) {
  const value = clampTerraOsProgress(progress);
  return 1 - Math.pow(1 - value, 3);
}

function setOpacity(element: HTMLElement | null, value: number) {
  if (element) element.style.opacity = clampTerraOsProgress(value).toFixed(4);
}

function setTransform(element: HTMLElement | null, value: string) {
  if (element) element.style.transform = value;
}

function resetInlineMotion(element: HTMLElement | null) {
  if (!element) return;
  element.style.removeProperty("opacity");
  element.style.removeProperty("transform");
  element.style.removeProperty("filter");
  element.style.removeProperty("visibility");
}

const HOST_CSS = `
html[data-terraos-release-choreography="v2"] body {
  --terraos-local-nav-opacity: 0;
}

html[data-terraos-release-choreography="v2"] .hero {
  min-height: 148svh;
}

html[data-terraos-release-choreography="v2"] .hero-copy {
  position: sticky;
  top: max(6.4rem, 10svh);
  z-index: 4;
}

html[data-terraos-release-choreography="v2"] .hero-stage {
  position: sticky;
  top: min(40svh, 24rem);
  z-index: 3;
}

html[data-terraos-release-choreography="v2"] .phone.center {
  transform: translate(-50%, calc(-46% + var(--terraos-center-lift, 0px))) scale(var(--terraos-center-scale, 1));
  filter: brightness(var(--terraos-center-brightness, 1));
}

html[data-terraos-release-choreography="v2"] .phone.left,
html[data-terraos-release-choreography="v2"] .phone.right,
html[data-terraos-release-choreography="v2"] .phone.center,
html[data-terraos-release-choreography="v2"] .hero-copy,
html[data-terraos-release-choreography="v2"] .hero-stage {
  will-change: transform, opacity, filter;
}

html[data-terraos-release-choreography="v2"] [data-terra-first-look="true"] .first-look {
  min-height: 92svh;
  border-color: transparent;
  background: transparent;
  box-shadow: none;
}

html[data-terraos-release-choreography="v2"] [data-terra-first-look="true"] .preview-device {
  width: min(390px, 76vw, 40svh);
  box-shadow: 0 50px 140px rgba(0,0,0,.72);
  will-change: transform, opacity, filter;
}

html[data-terraos-release-choreography="v2"] [data-terra-first-look="true"] .first-look-copy {
  will-change: transform, opacity, filter;
}

html[data-terraos-release-choreography="v2"] .story-touch[data-terra-scroll-scene="true"] {
  min-height: 440svh;
  text-align: center;
}

html[data-terraos-release-choreography="v2"] .story-touch[data-terra-scroll-scene="true"] .interactive-device {
  position: sticky;
  top: max(4.5rem, 9svh);
  margin-top: clamp(2rem, 5vw, 4rem);
  will-change: transform, opacity;
}

html[data-terraos-release-choreography="v2"] .story-touch[data-terra-scroll-scene="true"] .nav-pane {
  position: absolute;
  top: clamp(5.3rem, 12vw, 7.5rem);
  left: clamp(1rem, 3vw, 2rem);
  right: clamp(1rem, 3vw, 2rem);
  margin-top: 0;
  will-change: transform, opacity, filter;
}

html[data-terraos-release-choreography="v2"] .participation-story[data-terra-scroll-scene="true"] {
  min-height: 350svh;
}

html[data-terraos-release-choreography="v2"] .participation-story[data-terra-scroll-scene="true"] .story-grid {
  min-height: 320svh;
}

html[data-terraos-release-choreography="v2"] .participation-story[data-terra-scroll-scene="true"] .participation-device {
  position: sticky;
  top: max(4.8rem, 10svh);
  align-self: start;
}

html[data-terraos-release-choreography="v2"] .participation-story[data-terra-scroll-scene="true"] .state-card {
  transform-origin: 50% 50%;
  will-change: transform, opacity, filter;
}

html[data-terraos-release-choreography="v2"] .results-story[data-terra-scroll-scene="true"] {
  min-height: 430svh;
}

html[data-terraos-release-choreography="v2"] .results-story[data-terra-scroll-scene="true"] .story-heading {
  position: sticky;
  top: max(4.5rem, 9svh);
  z-index: 4;
  pointer-events: none;
}

html[data-terraos-release-choreography="v2"] .results-story[data-terra-scroll-scene="true"] .results-reveal {
  position: sticky;
  top: max(8.5rem, 17svh);
  will-change: transform, opacity;
}

html[data-terraos-release-choreography="v2"] .results-story[data-terra-scroll-scene="true"] .results-spotlight span,
html[data-terraos-release-choreography="v2"] .results-story[data-terra-scroll-scene="true"] .results-ui,
html[data-terraos-release-choreography="v2"] .results-story[data-terra-scroll-scene="true"] .ranking-row {
  will-change: transform, opacity, filter;
}

#${HOST_LOCAL_NAV_ID} {
  position: fixed;
  z-index: 30;
  top: max(10px, env(safe-area-inset-top));
  left: 50%;
  width: min(calc(100% - 1.25rem), 42rem);
  min-height: 42px;
  transform: translate3d(-50%, calc((1 - var(--terraos-local-nav-opacity)) * -12px), 0);
  opacity: var(--terraos-local-nav-opacity);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: .55rem .72rem;
  border: 1px solid rgba(255,255,255,.11);
  border-radius: 999px;
  background: rgba(14,14,17,.66);
  color: rgba(245,245,247,.88);
  box-shadow: 0 12px 42px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.06);
  -webkit-backdrop-filter: blur(22px) saturate(125%);
  backdrop-filter: blur(22px) saturate(125%);
  pointer-events: none;
  transition: opacity .22s ease, transform .28s cubic-bezier(.2,.8,.2,1);
}

#${HOST_LOCAL_NAV_ID} strong {
  font-size: .78rem;
  font-weight: 700;
  letter-spacing: -.015em;
}

#${HOST_LOCAL_NAV_ID} span {
  color: rgba(245,245,247,.48);
  font-size: .66rem;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
}

@media (max-width: 560px) {
  html[data-terraos-release-choreography="v2"] .hero { min-height: 132svh; }
  html[data-terraos-release-choreography="v2"] .hero-copy { top: max(5.6rem, 9svh); }
  html[data-terraos-release-choreography="v2"] .hero-stage { top: 39svh; }
  html[data-terraos-release-choreography="v2"] .story-touch[data-terra-scroll-scene="true"] { min-height: 360svh; }
  html[data-terraos-release-choreography="v2"] .participation-story[data-terra-scroll-scene="true"] { min-height: 300svh; }
  html[data-terraos-release-choreography="v2"] .participation-story[data-terra-scroll-scene="true"] .story-grid { min-height: 270svh; }
  html[data-terraos-release-choreography="v2"] .results-story[data-terra-scroll-scene="true"] { min-height: 360svh; }
  html[data-terraos-release-choreography="v2"] .results-story[data-terra-scroll-scene="true"] .results-reveal { top: max(6.5rem, 12svh); }
}

html[data-terraos-release-choreography="v2"][data-terraos-reduced-motion="true"] .hero,
html[data-terraos-release-choreography="v2"][data-terraos-reduced-motion="true"] .story-touch[data-terra-scroll-scene="true"],
html[data-terraos-release-choreography="v2"][data-terraos-reduced-motion="true"] .participation-story[data-terra-scroll-scene="true"],
html[data-terraos-release-choreography="v2"][data-terraos-reduced-motion="true"] .participation-story[data-terra-scroll-scene="true"] .story-grid,
html[data-terraos-release-choreography="v2"][data-terraos-reduced-motion="true"] .results-story[data-terra-scroll-scene="true"] {
  min-height: auto;
}

html[data-terraos-release-choreography="v2"][data-terraos-reduced-motion="true"] .hero-copy,
html[data-terraos-release-choreography="v2"][data-terraos-reduced-motion="true"] .hero-stage,
html[data-terraos-release-choreography="v2"][data-terraos-reduced-motion="true"] .interactive-device,
html[data-terraos-release-choreography="v2"][data-terraos-reduced-motion="true"] .participation-device,
html[data-terraos-release-choreography="v2"][data-terraos-reduced-motion="true"] .results-story .story-heading,
html[data-terraos-release-choreography="v2"][data-terraos-reduced-motion="true"] .results-reveal {
  position: static;
}
`;

type HostElements = {
  hero: HTMLElement | null;
  heroCopy: HTMLElement | null;
  heroStage: HTMLElement | null;
  heroCenter: HTMLElement | null;
  heroLeft: HTMLElement | null;
  heroRight: HTMLElement | null;
  firstLookStory: HTMLElement | null;
  firstLook: HTMLElement | null;
  firstLookCopy: HTMLElement | null;
  firstLookDevice: HTMLElement | null;
  navigationStory: HTMLElement | null;
  interactiveDevice: HTMLElement | null;
  liquidDemo: HTMLElement | null;
  navPanes: HTMLElement[];
  navTabs: HTMLElement[];
  participationStory: HTMLElement | null;
  participationCards: HTMLElement[];
  resultsStory: HTMLElement | null;
  resultsHeading: HTMLElement | null;
  resultsReveal: HTMLElement | null;
  resultsSpotlights: HTMLElement[];
  resultsUi: HTMLElement | null;
  resultRows: HTMLElement[];
};

function collectHostElements(document: Document): HostElements {
  const firstLook = document.querySelector<HTMLElement>(".first-look");
  const navigationStory = document.querySelector<HTMLElement>(".story-touch");
  const participationStory = document.querySelector<HTMLElement>(".participation-story");
  const resultsStory = document.querySelector<HTMLElement>(".results-story");

  firstLook?.closest<HTMLElement>(".story")?.setAttribute("data-terra-first-look", "true");
  navigationStory?.setAttribute("data-terra-scroll-scene", "true");
  participationStory?.setAttribute("data-terra-scroll-scene", "true");
  resultsStory?.setAttribute("data-terra-scroll-scene", "true");

  return {
    hero: document.querySelector<HTMLElement>(".hero"),
    heroCopy: document.querySelector<HTMLElement>(".hero-copy"),
    heroStage: document.querySelector<HTMLElement>(".hero-stage"),
    heroCenter: document.querySelector<HTMLElement>(".phone.center"),
    heroLeft: document.querySelector<HTMLElement>(".phone.left"),
    heroRight: document.querySelector<HTMLElement>(".phone.right"),
    firstLookStory: firstLook?.closest<HTMLElement>(".story") ?? null,
    firstLook,
    firstLookCopy: firstLook?.querySelector<HTMLElement>(".first-look-copy") ?? null,
    firstLookDevice: firstLook?.querySelector<HTMLElement>(".preview-device") ?? null,
    navigationStory,
    interactiveDevice: navigationStory?.querySelector<HTMLElement>(".interactive-device") ?? null,
    liquidDemo: navigationStory?.querySelector<HTMLElement>("#liquid-demo") ?? null,
    navPanes: Array.from(navigationStory?.querySelectorAll<HTMLElement>("[data-pane]") ?? []),
    navTabs: Array.from(navigationStory?.querySelectorAll<HTMLElement>(".liquid-tab") ?? []),
    participationStory,
    participationCards: Array.from(
      participationStory?.querySelectorAll<HTMLElement>(".state-card") ?? [],
    ),
    resultsStory,
    resultsHeading: resultsStory?.querySelector<HTMLElement>(".story-heading") ?? null,
    resultsReveal: resultsStory?.querySelector<HTMLElement>(".results-reveal") ?? null,
    resultsSpotlights: Array.from(
      resultsStory?.querySelectorAll<HTMLElement>(".results-spotlight span") ?? [],
    ),
    resultsUi: resultsStory?.querySelector<HTMLElement>(".results-ui") ?? null,
    resultRows: Array.from(resultsStory?.querySelectorAll<HTMLElement>(".ranking-row.large") ?? []),
  };
}

function installLocalNavigation(document: Document) {
  const existing = document.getElementById(HOST_LOCAL_NAV_ID);
  if (existing) return existing as HTMLElement;
  const navigation = document.createElement("div");
  navigation.id = HOST_LOCAL_NAV_ID;
  navigation.setAttribute("aria-hidden", "true");
  navigation.innerHTML = "<strong>TerraOS 3</strong><span>Preview</span>";
  document.body.appendChild(navigation);
  return navigation;
}

/**
 * Enhances the same-origin maintenance host from the eager Home preview iframe.
 *
 * This deliberately leaves maintenance-page.ts and the installed V3 navigation
 * runtime alone. The host remains a static, fixture-only teaser while this bridge
 * adds scroll-linked presentation choreography around the existing real V3
 * preview frames. No product data is fetched and no maintenance access boundary
 * is changed.
 */
export function installTerraOsTeaserHostChoreography(frame: HTMLElement) {
  const hostDocument = frame.ownerDocument;
  const hostWindow = hostDocument.defaultView;
  const root = hostDocument.documentElement;
  if (!hostWindow || !hostDocument.querySelector('[data-solaris-maintenance="true"]')) {
    return () => undefined;
  }
  if (root.dataset.terraosReleaseChoreography === HOST_CHOREOGRAPHY_VERSION) {
    return () => undefined;
  }

  root.dataset.terraosReleaseChoreography = HOST_CHOREOGRAPHY_VERSION;

  const style = hostDocument.createElement("style");
  style.id = HOST_STYLE_ID;
  style.textContent = HOST_CSS;
  hostDocument.head.appendChild(style);

  const localNavigation = installLocalNavigation(hostDocument);
  const reducedMotion = hostWindow.matchMedia("(prefers-reduced-motion: reduce)");
  let elements = collectHostElements(hostDocument);
  let raf = 0;
  let disposed = false;

  const resetAllMotion = () => {
    root.style.removeProperty("--terraos-local-nav-opacity");
    for (const element of [
      elements.heroCopy,
      elements.heroStage,
      elements.heroCenter,
      elements.heroLeft,
      elements.heroRight,
      elements.firstLookCopy,
      elements.firstLookDevice,
      elements.interactiveDevice,
      elements.resultsHeading,
      elements.resultsReveal,
      elements.resultsUi,
      ...elements.navPanes,
      ...elements.participationCards,
      ...elements.resultsSpotlights,
      ...elements.resultRows,
    ]) {
      resetInlineMotion(element);
    }
    elements.hero?.style.removeProperty("--hero-copy-y");
    elements.hero?.style.removeProperty("--hero-copy-scale");
    elements.hero?.style.removeProperty("--hero-copy-opacity");
    elements.hero?.style.removeProperty("--hero-stage-y");
    elements.hero?.style.removeProperty("--hero-stage-scale");
    elements.hero?.style.removeProperty("--hero-stage-opacity");
    elements.hero?.style.removeProperty("--hero-side-spread");
    elements.hero?.style.removeProperty("--hero-glow-opacity");
    elements.hero?.style.removeProperty("--terraos-center-lift");
    elements.hero?.style.removeProperty("--terraos-center-scale");
    elements.hero?.style.removeProperty("--terraos-center-brightness");
  };

  const applyReducedMotionState = () => {
    root.dataset.terraosReducedMotion = reducedMotion.matches ? "true" : "false";
    if (reducedMotion.matches) {
      resetAllMotion();
      for (const pane of elements.navPanes) {
        pane.hidden = pane.dataset.pane !== "0";
        pane.removeAttribute("aria-hidden");
      }
    }
  };

  const updateHero = () => {
    const hero = elements.hero;
    if (!hero) return;
    const progress = clampTerraOsProgress(
      hostWindow.scrollY / Math.max(1, hostWindow.innerHeight * 1.04),
    );
    const eased = easedOut(progress);
    const sideFade = 1 - resolveTerraOsRevealProgress(progress, 0.24, 0.82);

    hero.style.setProperty("--hero-copy-y", `${(-74 * eased).toFixed(2)}px`);
    hero.style.setProperty("--hero-copy-scale", (1 - 0.085 * eased).toFixed(4));
    hero.style.setProperty("--hero-copy-opacity", (1 - 0.94 * eased).toFixed(4));
    hero.style.setProperty("--hero-stage-y", (18 - 118 * eased).toFixed(2) + "px");
    hero.style.setProperty("--hero-stage-scale", (0.96 + 0.18 * eased).toFixed(4));
    hero.style.setProperty("--hero-stage-opacity", (0.82 + 0.18 * eased).toFixed(4));
    hero.style.setProperty("--hero-side-spread", (132 * eased).toFixed(2) + "px");
    hero.style.setProperty("--hero-glow-opacity", (0.72 + 0.2 * (1 - progress)).toFixed(4));
    hero.style.setProperty("--terraos-center-lift", `${(-18 * eased).toFixed(2)}px`);
    hero.style.setProperty("--terraos-center-scale", (1 + 0.1 * eased).toFixed(4));
    hero.style.setProperty("--terraos-center-brightness", (1 + 0.08 * eased).toFixed(4));

    if (elements.heroCopy) {
      elements.heroCopy.style.filter = `blur(${(4.5 * progress).toFixed(2)}px)`;
    }
    setOpacity(elements.heroLeft, 0.72 * sideFade);
    setOpacity(elements.heroRight, 0.72 * sideFade);
    root.style.setProperty(
      "--terraos-local-nav-opacity",
      resolveTerraOsRevealProgress(progress, 0.38, 0.62).toFixed(4),
    );
  };

  const updateFirstLook = () => {
    const story = elements.firstLookStory;
    if (!story) return;
    const rect = story.getBoundingClientRect();
    const enter = clampTerraOsProgress(1 - rect.top / Math.max(1, hostWindow.innerHeight * 0.92));
    const eased = easedOut(enter);
    setOpacity(elements.firstLookCopy, resolveTerraOsRevealProgress(enter, 0.18, 0.62));
    setTransform(
      elements.firstLookCopy,
      `translate3d(0, ${(26 * (1 - eased)).toFixed(2)}px, 0)`,
    );
    if (elements.firstLookCopy) {
      elements.firstLookCopy.style.filter = `blur(${(3 * (1 - eased)).toFixed(2)}px)`;
    }
    setOpacity(elements.firstLookDevice, resolveTerraOsRevealProgress(enter, 0.02, 0.5));
    setTransform(
      elements.firstLookDevice,
      `translate3d(0, ${(58 * (1 - eased)).toFixed(2)}px, 0) scale(${(
        0.91 + 0.09 * eased
      ).toFixed(4)})`,
    );
  };

  const updateNavigationStory = () => {
    const section = elements.navigationStory;
    const demo = elements.liquidDemo;
    if (!section || !demo || elements.navPanes.length === 0) return;
    const rect = section.getBoundingClientRect();
    const progress = resolveTerraOsSectionProgress(
      rect.top,
      section.offsetHeight,
      hostWindow.innerHeight,
    );
    const navProgress = progress * Math.max(0, elements.navPanes.length - 1);
    const active = Math.round(navProgress);

    demo.style.setProperty("--p", navProgress.toFixed(4));
    demo.style.setProperty("--stretch", "0");
    demo.setAttribute("data-direction", "0");
    elements.navTabs.forEach((tab, index) => {
      tab.setAttribute("aria-selected", index === active ? "true" : "false");
    });

    elements.navPanes.forEach((pane, index) => {
      pane.hidden = false;
      const distance = Math.abs(index - navProgress);
      const visibility = clampTerraOsProgress(1 - distance * 1.35);
      pane.setAttribute("aria-hidden", index === active ? "false" : "true");
      setOpacity(pane, visibility);
      pane.style.filter = `blur(${(Math.min(1, distance) * 3.5).toFixed(2)}px)`;
      setTransform(
        pane,
        `translate3d(${((index - navProgress) * 38).toFixed(2)}px, 0, 0) scale(${(
          0.985 + 0.015 * visibility
        ).toFixed(4)})`,
      );
    });

    setTransform(
      elements.interactiveDevice,
      `perspective(1200px) rotateX(${((0.5 - progress) * 1.3).toFixed(3)}deg) scale(${(
        0.985 + 0.015 * Math.sin(progress * Math.PI)
      ).toFixed(4)})`,
    );
  };

  const updateParticipationStory = () => {
    const section = elements.participationStory;
    const cards = elements.participationCards;
    if (!section || cards.length === 0) return;
    const rect = section.getBoundingClientRect();
    const progress = resolveTerraOsSectionProgress(
      rect.top,
      section.offsetHeight,
      hostWindow.innerHeight,
    );
    const visibleCards = Math.min(4, cards.length);

    cards.forEach((card, index) => {
      if (index >= visibleCards) {
        card.style.display = "none";
        return;
      }
      const threshold = visibleCards <= 1 ? 0 : index / (visibleCards - 1);
      const distance = Math.abs(progress - threshold);
      const focus = clampTerraOsProgress(1 - distance * 2.7);
      setOpacity(card, 0.34 + focus * 0.66);
      card.style.filter = `blur(${((1 - focus) * 1.8).toFixed(2)}px)`;
      setTransform(
        card,
        `translate3d(0, ${((threshold - progress) * 18).toFixed(2)}px, 0) scale(${(
          0.965 + 0.035 * focus
        ).toFixed(4)})`,
      );
    });

    const jury = cards[2]?.querySelector<HTMLElement>(":scope > strong");
    if (jury) jury.textContent = progress > 0.7 ? "15 / 15 · Ready" : "8 / 15 ranked";
    const televote = cards[3]?.querySelector<HTMLElement>(":scope > strong");
    if (televote) televote.textContent = progress > 0.88 ? "Voting is open" : "Opens tonight";
  };

  const updateResultsStory = () => {
    const section = elements.resultsStory;
    if (!section) return;
    const rect = section.getBoundingClientRect();
    const progress = resolveTerraOsSectionProgress(
      rect.top,
      section.offsetHeight,
      hostWindow.innerHeight,
    );

    const headingProgress = resolveTerraOsRevealProgress(progress, 0.02, 0.16);
    setOpacity(elements.resultsHeading, 1 - resolveTerraOsRevealProgress(progress, 0.26, 0.42));
    if (elements.resultsHeading) {
      elements.resultsHeading.style.filter = `blur(${(
        4 * resolveTerraOsRevealProgress(progress, 0.3, 0.46)
      ).toFixed(2)}px)`;
      setTransform(
        elements.resultsHeading,
        `translate3d(0, ${(-24 * resolveTerraOsRevealProgress(progress, 0.22, 0.44)).toFixed(
          2,
        )}px, 0) scale(${(0.96 + 0.04 * headingProgress).toFixed(4)})`,
      );
    }

    const thresholds = [0.13, 0.25, 0.36];
    elements.resultsSpotlights.forEach((spotlight, index) => {
      const reveal = resolveTerraOsRevealProgress(
        progress,
        thresholds[index] ?? 0.2,
        (thresholds[index] ?? 0.2) + 0.1,
      );
      setOpacity(spotlight, reveal * (index === 0 ? 0.95 : index === 1 ? 0.5 : 0.22));
      setTransform(
        spotlight,
        `translate3d(0, ${(36 * (1 - reveal)).toFixed(2)}px, 0) scale(${(
          1.28 - 0.28 * reveal
        ).toFixed(4)})`,
      );
    });

    const uiReveal = resolveTerraOsRevealProgress(progress, 0.42, 0.62);
    setOpacity(elements.resultsUi, uiReveal);
    setTransform(
      elements.resultsUi,
      `translate3d(0, ${(52 * (1 - uiReveal)).toFixed(2)}px, 0) scale(${(
        0.93 + 0.07 * uiReveal
      ).toFixed(4)})`,
    );

    elements.resultRows.forEach((row, index) => {
      const start = 0.5 + index * 0.065;
      const reveal = resolveTerraOsRevealProgress(progress, start, start + 0.1);
      setOpacity(row, reveal);
      setTransform(row, `translate3d(0, ${(24 * (1 - reveal)).toFixed(2)}px, 0)`);
    });

    const revealScale = 0.985 + 0.015 * resolveTerraOsRevealProgress(progress, 0.4, 0.78);
    setTransform(elements.resultsReveal, `scale(${revealScale.toFixed(4)})`);
  };

  const render = () => {
    raf = 0;
    if (disposed || reducedMotion.matches) return;
    elements = collectHostElements(hostDocument);
    updateHero();
    updateFirstLook();
    updateNavigationStory();
    updateParticipationStory();
    updateResultsStory();
  };

  const requestRender = () => {
    if (!raf && !disposed) raf = hostWindow.requestAnimationFrame(render);
  };

  const onMotionPreferenceChanged = () => {
    applyReducedMotionState();
    requestRender();
  };

  applyReducedMotionState();
  render();
  hostWindow.addEventListener("scroll", requestRender, { passive: true });
  hostWindow.addEventListener("resize", requestRender, { passive: true });
  reducedMotion.addEventListener("change", onMotionPreferenceChanged);

  return () => {
    if (disposed) return;
    disposed = true;
    if (raf) hostWindow.cancelAnimationFrame(raf);
    hostWindow.removeEventListener("scroll", requestRender);
    hostWindow.removeEventListener("resize", requestRender);
    reducedMotion.removeEventListener("change", onMotionPreferenceChanged);
    resetAllMotion();
    localNavigation.remove();
    style.remove();
    delete root.dataset.terraosReleaseChoreography;
    delete root.dataset.terraosReducedMotion;
  };
}
