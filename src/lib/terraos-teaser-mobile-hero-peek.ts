import { resolveTerraOsMobileHeroProgress } from "./terraos-teaser-mobile-hero-sequencing";

type TerraOsMobileHeroPeekRuntime = {
  owners: number;
  release: () => void;
};

type TerraOsMobileHeroPeekWindow = Window & {
  __terraosMobileHeroPeekRuntime?: TerraOsMobileHeroPeekRuntime;
};

const MOBILE_MAX_WIDTH = 560;
const PHONE_PEEK_MIN_HEIGHT = 112;
const PHONE_PEEK_MAX_HEIGHT = 148;
const PHONE_PEEK_VIEWPORT_FRACTION = 0.105;

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

export function resolveTerraOsMobilePhonePeekHeight(viewportHeight: number) {
  const viewport = Math.max(1, viewportHeight);
  return Math.min(
    PHONE_PEEK_MAX_HEIGHT,
    Math.max(PHONE_PEEK_MIN_HEIGHT, viewport * PHONE_PEEK_VIEWPORT_FRACTION),
  );
}

export function resolveTerraOsMobileHeroPeekState(rawProgress: number) {
  const progress = clamp01(rawProgress);

  // The phone should already start moving while the countdown is still the
  // dominant focal object. By the time the title/date have cleared and the
  // countdown is travelling upward, the Home device must be visibly rising
  // through the lower half of the viewport instead of remaining parked at the
  // browser edge.
  const release = smoothstep(range(progress, 0.32, 0.58));

  return {
    active: progress < 0.72,
    shiftFactor: 1 - release,
    opacity: 0.82 + 0.18 * release,
  };
}

function clearPeek(phone: HTMLElement | null) {
  if (!phone) return;
  phone.style.removeProperty("translate");
  phone.style.removeProperty("opacity");
  phone.style.removeProperty("visibility");
  phone.style.removeProperty("will-change");
}

/**
 * Keeps a deliberate, unmistakable preview of the real Home device at the
 * bottom of the opening mobile viewport while the countdown remains dominant.
 *
 * The main mobile sequencing layer still owns the phone transform and final
 * reveal timing. This refinement only moves that same centre phone downward so
 * roughly 112-148 px remain visible initially, then releases the offset during
 * the countdown fade. Side phones remain entirely owned by the main sequence.
 */
export function installTerraOsTeaserMobileHeroPeek(frame: HTMLElement) {
  const hostDocument = frame.ownerDocument;
  const hostWindow = hostDocument.defaultView as TerraOsMobileHeroPeekWindow | null;
  const maintenanceRoot = hostDocument.querySelector<HTMLElement>(
    '[data-solaris-maintenance="true"]',
  );
  if (!hostWindow || !maintenanceRoot) return () => undefined;

  const existing = hostWindow.__terraosMobileHeroPeekRuntime;
  if (existing) {
    existing.owners += 1;
    return () => {
      existing.owners = Math.max(0, existing.owners - 1);
      if (existing.owners === 0) {
        existing.release();
        delete hostWindow.__terraosMobileHeroPeekRuntime;
      }
    };
  }

  const reducedMotion = hostWindow.matchMedia("(prefers-reduced-motion: reduce)");
  const visualViewport = hostWindow.visualViewport;
  let hero = hostDocument.querySelector<HTMLElement>(".hero");
  let phone = hostDocument.querySelector<HTMLElement>(".hero .phone.center");
  let animationFrame = 0;
  let released = false;

  const render = () => {
    animationFrame = 0;
    if (released) return;

    hero = hostDocument.querySelector<HTMLElement>(".hero");
    phone = hostDocument.querySelector<HTMLElement>(".hero .phone.center");
    if (!hero || !phone) return;

    if (hostWindow.innerWidth > MOBILE_MAX_WIDTH || reducedMotion.matches) {
      clearPeek(phone);
      return;
    }

    const heroRect = hero.getBoundingClientRect();
    const progress = resolveTerraOsMobileHeroProgress(
      heroRect.top,
      hero.offsetHeight,
      hostWindow.innerHeight,
    );
    const state = resolveTerraOsMobileHeroPeekState(progress);

    if (!state.active) {
      clearPeek(phone);
      return;
    }

    // Measure without our previous offset so repeated frames cannot compound it.
    phone.style.removeProperty("translate");
    const naturalRect = phone.getBoundingClientRect();

    // visualViewport tracks the actually visible iOS Safari area as browser
    // chrome expands/collapses. Falling back to innerHeight keeps desktop/mobile
    // browsers without VisualViewport deterministic.
    const visibleHeight = visualViewport?.height ?? hostWindow.innerHeight;
    const visibleBottom = visualViewport
      ? visualViewport.offsetTop + visualViewport.height
      : hostWindow.innerHeight;
    const peekHeight = resolveTerraOsMobilePhonePeekHeight(visibleHeight);
    const targetTop = visibleBottom - peekHeight;
    const fullShift = Math.max(0, targetTop - naturalRect.top);
    const shift = fullShift * state.shiftFactor;

    phone.style.setProperty("translate", `0 ${shift.toFixed(2)}px`);
    phone.style.setProperty("opacity", state.opacity.toFixed(4), "important");
    phone.style.setProperty("visibility", "visible", "important");
    phone.style.setProperty("will-change", "translate, opacity");
  };

  const requestRender = () => {
    if (!animationFrame && !released) {
      animationFrame = hostWindow.requestAnimationFrame(render);
    }
  };

  const onMotionPreferenceChanged = () => requestRender();

  render();
  hostWindow.addEventListener("scroll", requestRender, { passive: true });
  hostWindow.addEventListener("resize", requestRender, { passive: true });
  visualViewport?.addEventListener("resize", requestRender, { passive: true });
  reducedMotion.addEventListener("change", onMotionPreferenceChanged);

  const runtime: TerraOsMobileHeroPeekRuntime = {
    owners: 1,
    release: () => {
      if (released) return;
      released = true;
      if (animationFrame) hostWindow.cancelAnimationFrame(animationFrame);
      hostWindow.removeEventListener("scroll", requestRender);
      hostWindow.removeEventListener("resize", requestRender);
      visualViewport?.removeEventListener("resize", requestRender);
      reducedMotion.removeEventListener("change", onMotionPreferenceChanged);
      clearPeek(phone);
    },
  };

  hostWindow.__terraosMobileHeroPeekRuntime = runtime;

  return () => {
    runtime.owners = Math.max(0, runtime.owners - 1);
    if (runtime.owners === 0) {
      runtime.release();
      delete hostWindow.__terraosMobileHeroPeekRuntime;
    }
  };
}
