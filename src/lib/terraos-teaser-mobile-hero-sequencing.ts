type TerraOsMobileHeroRuntime = {
  owners: number;
  release: () => void;
};

type TerraOsMobileHeroWindow = Window & {
  __terraosMobileHeroRuntime?: TerraOsMobileHeroRuntime;
};

const STYLE_ID = "terraos-mobile-hero-sequencing-style";
const ROOT_DATASET_VALUE = "v1";
const MOBILE_MAX_WIDTH = 560;

const HERO_PROPERTIES = [
  "--terraos-mobile-title-y",
  "--terraos-mobile-title-scale",
  "--terraos-mobile-title-opacity",
  "--terraos-mobile-tagline-y",
  "--terraos-mobile-tagline-opacity",
  "--terraos-mobile-date-y",
  "--terraos-mobile-date-opacity",
  "--terraos-mobile-countdown-y",
  "--terraos-mobile-countdown-scale",
  "--terraos-mobile-countdown-opacity",
  "--terraos-mobile-stage-y",
  "--terraos-mobile-stage-scale",
  "--terraos-mobile-center-opacity",
  "--terraos-mobile-center-lift",
  "--terraos-mobile-center-scale",
  "--terraos-mobile-side-opacity",
  "--terraos-mobile-side-spread",
] as const;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function range(progress: number, start: number, end: number) {
  if (end <= start) return progress >= end ? 1 : 0;
  return clamp01((progress - start) / (end - start));
}

function smoothstep(value: number) {
  const progress = clamp01(value);
  return progress * progress * (3 - 2 * progress);
}

export type TerraOsMobileHeroState = {
  titleY: number;
  titleScale: number;
  titleOpacity: number;
  taglineY: number;
  taglineOpacity: number;
  dateY: number;
  dateOpacity: number;
  countdownY: number;
  countdownScale: number;
  countdownOpacity: number;
  stageY: number;
  stageScale: number;
  centerOpacity: number;
  centerLift: number;
  centerScale: number;
  sideOpacity: number;
  sideSpread: number;
};

/**
 * One focal object at a time:
 * title -> launch information -> countdown -> centre phone -> brief side phones.
 *
 * Every value is a pure function of scroll progress, so reverse scrolling is
 * exact and stopping scroll freezes the composition at that exact state.
 */
export function resolveTerraOsMobileHeroState(rawProgress: number): TerraOsMobileHeroState {
  const progress = clamp01(rawProgress);
  const titleRecede = smoothstep(range(progress, 0.06, 0.4));
  const taglineFade = smoothstep(range(progress, 0.1, 0.28));
  const dateFade = smoothstep(range(progress, 0.18, 0.38));
  const countdownFade = smoothstep(range(progress, 0.42, 0.6));
  const centerReveal = smoothstep(range(progress, 0.56, 0.72));
  const sideReveal = smoothstep(range(progress, 0.69, 0.82));
  const sideExit = smoothstep(range(progress, 0.84, 0.98));

  return {
    titleY: -36 * titleRecede,
    titleScale: 1 - 0.085 * titleRecede,
    titleOpacity: 1 - 0.76 * titleRecede,
    taglineY: -12 * taglineFade,
    taglineOpacity: 1 - taglineFade,
    dateY: -10 * dateFade,
    dateOpacity: 1 - dateFade,
    countdownY: -34 * countdownFade,
    countdownScale: 1 + 0.025 * (1 - Math.abs(progress - 0.31) / 0.31) * (1 - countdownFade),
    countdownOpacity: 1 - countdownFade,
    stageY: 96 * (1 - centerReveal) - 48 * centerReveal,
    stageScale: 0.97 + 0.09 * centerReveal,
    centerOpacity: centerReveal,
    centerLift: 26 * (1 - centerReveal) - 22 * centerReveal,
    centerScale: 0.94 + 0.14 * centerReveal,
    sideOpacity: 0.46 * sideReveal * (1 - sideExit),
    sideSpread: 10 * sideReveal + 66 * sideExit,
  };
}

export function resolveTerraOsMobileHeroProgress(
  heroTop: number,
  heroHeight: number,
  viewportHeight: number,
) {
  const viewport = Math.max(1, viewportHeight);
  const travel = Math.max(viewport * 0.92, heroHeight - viewport * 0.54);
  return clamp01(-heroTop / Math.max(1, travel));
}

const MOBILE_HERO_CSS = `
@media (max-width: ${MOBILE_MAX_WIDTH}px) {
  html[data-terraos-mobile-hero="${ROOT_DATASET_VALUE}"] .hero {
    min-height: max(1120px, 160svh) !important;
  }

  html[data-terraos-mobile-hero="${ROOT_DATASET_VALUE}"] .hero-copy {
    position: sticky !important;
    top: max(5.4rem, 8svh) !important;
    z-index: 6 !important;
    transform: none !important;
    opacity: 1 !important;
    filter: none !important;
  }

  html[data-terraos-mobile-hero="${ROOT_DATASET_VALUE}"] .hero-copy-inner,
  html[data-terraos-mobile-hero="${ROOT_DATASET_VALUE}"] .phone.center {
    animation: none !important;
  }

  html[data-terraos-mobile-hero="${ROOT_DATASET_VALUE}"] .hero h1 {
    transform: translate3d(0, var(--terraos-mobile-title-y, 0px), 0)
      scale(var(--terraos-mobile-title-scale, 1)) !important;
    transform-origin: 50% 30% !important;
    opacity: var(--terraos-mobile-title-opacity, 1) !important;
    will-change: transform, opacity;
  }

  html[data-terraos-mobile-hero="${ROOT_DATASET_VALUE}"] .hero .tagline {
    transform: translate3d(0, var(--terraos-mobile-tagline-y, 0px), 0) !important;
    opacity: var(--terraos-mobile-tagline-opacity, 1) !important;
    will-change: transform, opacity;
  }

  html[data-terraos-mobile-hero="${ROOT_DATASET_VALUE}"] .hero .launch-label,
  html[data-terraos-mobile-hero="${ROOT_DATASET_VALUE}"] .hero .launch-date {
    transform: translate3d(0, var(--terraos-mobile-date-y, 0px), 0) !important;
    opacity: var(--terraos-mobile-date-opacity, 1) !important;
    will-change: transform, opacity;
  }

  html[data-terraos-mobile-hero="${ROOT_DATASET_VALUE}"] .hero .launch {
    min-height: 10.75rem;
  }

  html[data-terraos-mobile-hero="${ROOT_DATASET_VALUE}"] .hero .countdown {
    min-height: 5.2rem;
    transform: translate3d(0, var(--terraos-mobile-countdown-y, 0px), 0)
      scale(var(--terraos-mobile-countdown-scale, 1)) !important;
    transform-origin: 50% 35% !important;
    opacity: var(--terraos-mobile-countdown-opacity, 1) !important;
    will-change: transform, opacity;
  }

  html[data-terraos-mobile-hero="${ROOT_DATASET_VALUE}"] .hero-stage {
    position: sticky !important;
    top: 52svh !important;
    z-index: 5 !important;
    width: 132vw !important;
    height: 340px !important;
    margin-top: clamp(5rem, 13svh, 8rem) !important;
    transform: translate3d(0, var(--terraos-mobile-stage-y, 96px), 0)
      scale(var(--terraos-mobile-stage-scale, .97)) !important;
    transform-origin: 50% 24% !important;
    opacity: 1 !important;
    will-change: transform;
  }

  html[data-terraos-mobile-hero="${ROOT_DATASET_VALUE}"] .hero-stage .phone {
    width: min(76vw, 36svh, 300px) !important;
    height: auto !important;
    aspect-ratio: 390 / 844;
    border-radius: clamp(28px, 8.4vw, 42px) !important;
  }

  html[data-terraos-mobile-hero="${ROOT_DATASET_VALUE}"] .hero-stage .phone-preview {
    width: 100% !important;
    height: 100% !important;
    transform: none !important;
  }

  html[data-terraos-mobile-hero="${ROOT_DATASET_VALUE}"] .hero-stage .phone.center {
    opacity: var(--terraos-mobile-center-opacity, 0) !important;
    transform: translate(-50%, calc(-46% + var(--terraos-mobile-center-lift, 26px)))
      scale(var(--terraos-mobile-center-scale, .94)) !important;
    filter: none !important;
    will-change: transform, opacity;
  }

  html[data-terraos-mobile-hero="${ROOT_DATASET_VALUE}"] .hero-stage .phone.left {
    opacity: var(--terraos-mobile-side-opacity, 0) !important;
    transform: translate(calc(-125% - var(--terraos-mobile-side-spread, 0px)), -35%)
      rotateY(5deg) rotateZ(-1.4deg) scale(.82) !important;
    filter: brightness(.78) !important;
    will-change: transform, opacity;
  }

  html[data-terraos-mobile-hero="${ROOT_DATASET_VALUE}"] .hero-stage .phone.right {
    opacity: var(--terraos-mobile-side-opacity, 0) !important;
    transform: translate(calc(25% + var(--terraos-mobile-side-spread, 0px)), -35%)
      rotateY(-5deg) rotateZ(1.4deg) scale(.82) !important;
    filter: brightness(.78) !important;
    will-change: transform, opacity;
  }
}

@media (max-width: ${MOBILE_MAX_WIDTH}px) and (prefers-reduced-motion: reduce) {
  html[data-terraos-mobile-hero="${ROOT_DATASET_VALUE}"] .hero {
    min-height: auto !important;
  }

  html[data-terraos-mobile-hero="${ROOT_DATASET_VALUE}"] .hero-copy,
  html[data-terraos-mobile-hero="${ROOT_DATASET_VALUE}"] .hero-stage {
    position: static !important;
  }

  html[data-terraos-mobile-hero="${ROOT_DATASET_VALUE}"] .hero h1,
  html[data-terraos-mobile-hero="${ROOT_DATASET_VALUE}"] .hero .tagline,
  html[data-terraos-mobile-hero="${ROOT_DATASET_VALUE}"] .hero .launch-label,
  html[data-terraos-mobile-hero="${ROOT_DATASET_VALUE}"] .hero .launch-date,
  html[data-terraos-mobile-hero="${ROOT_DATASET_VALUE}"] .hero .countdown,
  html[data-terraos-mobile-hero="${ROOT_DATASET_VALUE}"] .hero-stage,
  html[data-terraos-mobile-hero="${ROOT_DATASET_VALUE}"] .hero-stage .phone {
    transform: none !important;
    opacity: 1 !important;
    filter: none !important;
  }

  html[data-terraos-mobile-hero="${ROOT_DATASET_VALUE}"] .hero-stage .phone.left,
  html[data-terraos-mobile-hero="${ROOT_DATASET_VALUE}"] .hero-stage .phone.right {
    display: none !important;
  }
}
`;

function setHeroVariable(hero: HTMLElement, name: string, value: number, unit = "") {
  hero.style.setProperty(name, `${value.toFixed(4)}${unit}`);
}

function clearHeroVariables(hero: HTMLElement | null) {
  if (!hero) return;
  for (const property of HERO_PROPERTIES) hero.style.removeProperty(property);
}

/**
 * Refines only the mobile opening scene. The existing host choreography remains
 * authoritative for desktop and for the later Five Places / Participation /
 * Results scenes. This layer deliberately runs after it, replacing only the
 * mobile hero's optical composition with a stricter one-focus-at-a-time reveal.
 */
export function installTerraOsTeaserMobileHeroSequencing(frame: HTMLElement) {
  const hostDocument = frame.ownerDocument;
  const hostWindow = hostDocument.defaultView as TerraOsMobileHeroWindow | null;
  const maintenanceRoot = hostDocument.querySelector<HTMLElement>(
    '[data-solaris-maintenance="true"]',
  );
  if (!hostWindow || !maintenanceRoot) return () => undefined;

  const existing = hostWindow.__terraosMobileHeroRuntime;
  if (existing) {
    existing.owners += 1;
    return () => {
      existing.owners = Math.max(0, existing.owners - 1);
      if (existing.owners === 0) {
        existing.release();
        delete hostWindow.__terraosMobileHeroRuntime;
      }
    };
  }

  const root = hostDocument.documentElement;
  const reducedMotion = hostWindow.matchMedia("(prefers-reduced-motion: reduce)");
  let hero = hostDocument.querySelector<HTMLElement>(".hero");
  let style = hostDocument.getElementById(STYLE_ID) as HTMLStyleElement | null;
  let animationFrame = 0;
  let released = false;

  if (!style) {
    style = hostDocument.createElement("style");
    style.id = STYLE_ID;
    style.textContent = MOBILE_HERO_CSS;
    hostDocument.head.appendChild(style);
  }
  root.dataset.terraosMobileHero = ROOT_DATASET_VALUE;

  const render = () => {
    animationFrame = 0;
    if (released) return;
    hero = hostDocument.querySelector<HTMLElement>(".hero");
    if (!hero) return;

    if (hostWindow.innerWidth > MOBILE_MAX_WIDTH || reducedMotion.matches) {
      clearHeroVariables(hero);
      return;
    }

    const rect = hero.getBoundingClientRect();
    const progress = resolveTerraOsMobileHeroProgress(
      rect.top,
      hero.offsetHeight,
      hostWindow.innerHeight,
    );
    const state = resolveTerraOsMobileHeroState(progress);

    setHeroVariable(hero, "--terraos-mobile-title-y", state.titleY, "px");
    setHeroVariable(hero, "--terraos-mobile-title-scale", state.titleScale);
    setHeroVariable(hero, "--terraos-mobile-title-opacity", state.titleOpacity);
    setHeroVariable(hero, "--terraos-mobile-tagline-y", state.taglineY, "px");
    setHeroVariable(hero, "--terraos-mobile-tagline-opacity", state.taglineOpacity);
    setHeroVariable(hero, "--terraos-mobile-date-y", state.dateY, "px");
    setHeroVariable(hero, "--terraos-mobile-date-opacity", state.dateOpacity);
    setHeroVariable(hero, "--terraos-mobile-countdown-y", state.countdownY, "px");
    setHeroVariable(hero, "--terraos-mobile-countdown-scale", state.countdownScale);
    setHeroVariable(hero, "--terraos-mobile-countdown-opacity", state.countdownOpacity);
    setHeroVariable(hero, "--terraos-mobile-stage-y", state.stageY, "px");
    setHeroVariable(hero, "--terraos-mobile-stage-scale", state.stageScale);
    setHeroVariable(hero, "--terraos-mobile-center-opacity", state.centerOpacity);
    setHeroVariable(hero, "--terraos-mobile-center-lift", state.centerLift, "px");
    setHeroVariable(hero, "--terraos-mobile-center-scale", state.centerScale);
    setHeroVariable(hero, "--terraos-mobile-side-opacity", state.sideOpacity);
    setHeroVariable(hero, "--terraos-mobile-side-spread", state.sideSpread, "px");
  };

  const requestRender = () => {
    if (!animationFrame && !released) {
      animationFrame = hostWindow.requestAnimationFrame(render);
    }
  };

  const onPreferenceChanged = () => requestRender();

  render();
  hostWindow.addEventListener("scroll", requestRender, { passive: true });
  hostWindow.addEventListener("resize", requestRender, { passive: true });
  reducedMotion.addEventListener("change", onPreferenceChanged);

  const runtime: TerraOsMobileHeroRuntime = {
    owners: 1,
    release: () => {
      if (released) return;
      released = true;
      if (animationFrame) hostWindow.cancelAnimationFrame(animationFrame);
      hostWindow.removeEventListener("scroll", requestRender);
      hostWindow.removeEventListener("resize", requestRender);
      reducedMotion.removeEventListener("change", onPreferenceChanged);
      clearHeroVariables(hero);
      style?.remove();
      delete root.dataset.terraosMobileHero;
    },
  };

  hostWindow.__terraosMobileHeroRuntime = runtime;

  return () => {
    runtime.owners = Math.max(0, runtime.owners - 1);
    if (runtime.owners === 0) {
      runtime.release();
      delete hostWindow.__terraosMobileHeroRuntime;
    }
  };
}
