const MICRO_MOTION_STYLE_ID = "terraos-release-micro-motion-style";
const MICRO_GLINT_CLASS = "terraos-release-micro-glint";

type TerraOsMicroMotionRuntime = {
  owners: number;
  release: () => void;
};

type TerraOsMicroMotionWindow = Window & {
  __terraosTeaserMicroMotionRuntime?: TerraOsMicroMotionRuntime;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function normalizeTerraOsScrollVelocity(deltaY: number, deltaMs: number) {
  if (!Number.isFinite(deltaY) || !Number.isFinite(deltaMs)) return 0;
  const duration = Math.max(8, Math.abs(deltaMs));
  return clamp(deltaY / duration / 1.8, -1, 1);
}

const MICRO_MOTION_CSS = `
html[data-terraos-micro-motion="true"] .phone.center,
html[data-terraos-micro-motion="true"] [data-terra-first-look="true"] .preview-device,
html[data-terraos-micro-motion="true"] .story-touch .interactive-device,
html[data-terraos-micro-motion="true"] .results-story .results-reveal {
  rotate: var(--terraos-scroll-tilt, 0deg);
  transform-origin: var(--terraos-scroll-origin-x, 50%) var(--terraos-scroll-origin-y, 50%);
}

html[data-terraos-micro-motion="true"] .${MICRO_GLINT_CLASS} {
  position: absolute;
  z-index: 7;
  inset: -18%;
  border-radius: inherit;
  background:
    linear-gradient(
      104deg,
      transparent 37%,
      rgba(255,255,255,.02) 44%,
      rgba(255,255,255,.18) 50%,
      rgba(111,211,255,.07) 55%,
      transparent 64%
    );
  opacity: var(--terraos-scroll-glint-opacity, .02);
  transform: translate3d(
    var(--terraos-scroll-glint-x, 0px),
    var(--terraos-scroll-glint-y, 0px),
    0
  );
  filter: blur(7px);
  pointer-events: none;
  will-change: transform, opacity;
}

html[data-terraos-micro-motion="reduced"] .${MICRO_GLINT_CLASS} {
  display: none;
}
`;

function writeMotionVariables(root: HTMLElement, velocity: number) {
  const bounded = clamp(velocity, -1, 1);
  const speed = Math.abs(bounded);
  root.style.setProperty("--terraos-scroll-velocity", bounded.toFixed(4));
  root.style.setProperty("--terraos-scroll-tilt", `${(bounded * 0.28).toFixed(3)}deg`);
  root.style.setProperty("--terraos-scroll-origin-x", `${(50 + bounded * 0.55).toFixed(3)}%`);
  root.style.setProperty("--terraos-scroll-origin-y", `${(50 - bounded * 0.28).toFixed(3)}%`);
  root.style.setProperty("--terraos-scroll-glint-x", `${(bounded * 10).toFixed(2)}px`);
  root.style.setProperty("--terraos-scroll-glint-y", `${(bounded * -3).toFixed(2)}px`);
  root.style.setProperty(
    "--terraos-scroll-glint-opacity",
    (0.02 + speed * 0.12).toFixed(4),
  );
}

function clearMotionVariables(root: HTMLElement) {
  for (const property of [
    "--terraos-scroll-velocity",
    "--terraos-scroll-tilt",
    "--terraos-scroll-origin-x",
    "--terraos-scroll-origin-y",
    "--terraos-scroll-glint-x",
    "--terraos-scroll-glint-y",
    "--terraos-scroll-glint-opacity",
  ]) {
    root.style.removeProperty(property);
  }
}

function installGlints(document: Document) {
  const targets = Array.from(
    document.querySelectorAll<HTMLElement>(
      ".phone.center, [data-terra-first-look=\"true\"] .preview-device, .story-touch .interactive-device, .results-story .results-reveal",
    ),
  );

  for (const target of targets) {
    if (target.querySelector(`:scope > .${MICRO_GLINT_CLASS}`)) continue;
    const glint = document.createElement("span");
    glint.className = MICRO_GLINT_CLASS;
    glint.setAttribute("aria-hidden", "true");
    target.appendChild(glint);
  }
}

/**
 * Adds one bounded physical response signal to the maintenance teaser.
 *
 * The browser keeps full ownership of scrolling. This enhancer only observes
 * scroll velocity and derives a tiny optical tilt/highlight response from it.
 * No wheel/touch interception, timers, product reads or navigation state are
 * introduced. Reduced Motion collapses the signal to zero immediately.
 */
export function installTerraOsTeaserHostMicroMotion(frame: HTMLElement) {
  const hostDocument = frame.ownerDocument;
  const hostWindow = hostDocument.defaultView as TerraOsMicroMotionWindow | null;
  const maintenanceRoot = hostDocument.querySelector<HTMLElement>(
    '[data-solaris-maintenance="true"]',
  );
  if (!hostWindow || !maintenanceRoot) return () => undefined;

  const existing = hostWindow.__terraosTeaserMicroMotionRuntime;
  if (existing) {
    existing.owners += 1;
    return () => {
      existing.owners = Math.max(0, existing.owners - 1);
      if (existing.owners === 0) {
        existing.release();
        delete hostWindow.__terraosTeaserMicroMotionRuntime;
      }
    };
  }

  const root = hostDocument.documentElement;
  const reducedMotion = hostWindow.matchMedia("(prefers-reduced-motion: reduce)");
  let animationFrame = 0;
  let lastScrollY = hostWindow.scrollY;
  let lastTimestamp = hostWindow.performance.now();
  let targetVelocity = 0;
  let renderedVelocity = 0;
  let released = false;

  let style = hostDocument.getElementById(MICRO_MOTION_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = hostDocument.createElement("style");
    style.id = MICRO_MOTION_STYLE_ID;
    style.textContent = MICRO_MOTION_CSS;
    hostDocument.head.appendChild(style);
  }

  installGlints(hostDocument);

  const reset = () => {
    targetVelocity = 0;
    renderedVelocity = 0;
    writeMotionVariables(root, 0);
  };

  const render = () => {
    animationFrame = 0;
    if (released || reducedMotion.matches) return;

    renderedVelocity += (targetVelocity - renderedVelocity) * 0.22;
    targetVelocity *= 0.82;
    writeMotionVariables(root, renderedVelocity);

    if (Math.abs(renderedVelocity) > 0.003 || Math.abs(targetVelocity) > 0.003) {
      animationFrame = hostWindow.requestAnimationFrame(render);
    } else {
      reset();
    }
  };

  const requestRender = () => {
    if (!animationFrame && !released && !reducedMotion.matches) {
      animationFrame = hostWindow.requestAnimationFrame(render);
    }
  };

  const onScroll = () => {
    const now = hostWindow.performance.now();
    const scrollY = hostWindow.scrollY;
    const deltaY = scrollY - lastScrollY;
    const deltaMs = now - lastTimestamp;
    lastScrollY = scrollY;
    lastTimestamp = now;

    if (reducedMotion.matches) return;
    targetVelocity = normalizeTerraOsScrollVelocity(deltaY, deltaMs);
    requestRender();
  };

  const applyMotionPreference = () => {
    root.dataset.terraosMicroMotion = reducedMotion.matches ? "reduced" : "true";
    if (reducedMotion.matches) {
      if (animationFrame) hostWindow.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      reset();
    }
  };

  applyMotionPreference();
  hostWindow.addEventListener("scroll", onScroll, { passive: true });
  reducedMotion.addEventListener("change", applyMotionPreference);

  const runtime: TerraOsMicroMotionRuntime = {
    owners: 1,
    release: () => {
      if (released) return;
      released = true;
      if (animationFrame) hostWindow.cancelAnimationFrame(animationFrame);
      hostWindow.removeEventListener("scroll", onScroll);
      reducedMotion.removeEventListener("change", applyMotionPreference);
      hostDocument
        .querySelectorAll(`.${MICRO_GLINT_CLASS}`)
        .forEach((glint) => glint.remove());
      style?.remove();
      delete root.dataset.terraosMicroMotion;
      clearMotionVariables(root);
    },
  };

  hostWindow.__terraosTeaserMicroMotionRuntime = runtime;

  return () => {
    runtime.owners = Math.max(0, runtime.owners - 1);
    if (runtime.owners === 0) {
      runtime.release();
      delete hostWindow.__terraosTeaserMicroMotionRuntime;
    }
  };
}
