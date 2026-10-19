import { resolveTerraOsMobileHeroProgress } from "./terraos-teaser-mobile-hero-sequencing";

type TerraOsMobileHeroPeekRuntime = {
  owners: number;
  release: () => void;
};

type TerraOsMobileHeroPeekWindow = Window & {
  __terraosMobileHeroPeekRuntime?: TerraOsMobileHeroPeekRuntime;
};

const MOBILE_MAX_WIDTH = 560;
const PHONE_PEEK_HEIGHT = 26;

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

export function resolveTerraOsMobileHeroPeekState(rawProgress: number) {
  const progress = clamp01(rawProgress);
  const release = smoothstep(range(progress, 0.58, 0.72));
  return {
    active: progress < 0.72,
    shiftFactor: 1 - release,
    opacity: 0.62 + 0.38 * release,
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
 * Keeps one restrained hint of the real Home device at the bottom of the first
 * mobile viewport while the countdown remains the focal object.
 *
 * The main mobile sequencing layer still owns the hero transform and reveal
 * timing. This refinement only offsets that same centre phone far enough down
 * to expose roughly its top 26 px, then releases the offset as the countdown
 * finishes. Side phones remain entirely owned by the main sequence.
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

    // Measure the phone without our previous offset so the calculation cannot
    // feed back into itself on repeated scroll/resize frames.
    phone.style.removeProperty("translate");
    const naturalRect = phone.getBoundingClientRect();
    const targetTop = hostWindow.innerHeight - PHONE_PEEK_HEIGHT;
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
  reducedMotion.addEventListener("change", onMotionPreferenceChanged);

  const runtime: TerraOsMobileHeroPeekRuntime = {
    owners: 1,
    release: () => {
      if (released) return;
      released = true;
      if (animationFrame) hostWindow.cancelAnimationFrame(animationFrame);
      hostWindow.removeEventListener("scroll", requestRender);
      hostWindow.removeEventListener("resize", requestRender);
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
