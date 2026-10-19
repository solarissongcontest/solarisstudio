type TerraOsHeroHandoffRuntime = {
  owners: number;
  release: () => void;
};

type TerraOsHeroHandoffWindow = Window & {
  __terraosTeaserHeroHandoffRuntime?: TerraOsHeroHandoffRuntime;
};

type HandoffElements = {
  heroPhone: HTMLElement;
  firstLook: HTMLElement;
  firstLookStory: HTMLElement;
  destinationPhone: HTMLElement;
  destinationFrame: HTMLIFrameElement | null;
};

const HANDOFF_PLACEHOLDER_ATTRIBUTE = "data-terraos-handoff-placeholder";
const DEVICE_STYLE_PROPERTIES = [
  "position",
  "inset",
  "left",
  "top",
  "width",
  "height",
  "max-width",
  "margin",
  "z-index",
  "justify-self",
  "transform",
  "transform-origin",
  "opacity",
  "filter",
  "pointer-events",
  "box-sizing",
] as const;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(value: number) {
  const progress = clamp01(value);
  return progress * progress * (3 - 2 * progress);
}

function mix(start: number, end: number, progress: number) {
  return start + (end - start) * progress;
}

export function resolveTerraOsHeroHandoffProgress(
  storyTop: number,
  viewportHeight: number,
) {
  const viewport = Math.max(1, viewportHeight);
  const start = viewport * 0.92;
  const end = viewport * 0.14;
  return clamp01((start - storyTop) / Math.max(1, start - end));
}

function collectHandoffElements(document: Document): HandoffElements | null {
  const heroPhone = document.querySelector<HTMLElement>(".hero .phone.center");
  const firstLook = document.querySelector<HTMLElement>(".first-look");
  const firstLookStory = firstLook?.closest<HTMLElement>(".story") ?? null;
  const destinationPhone = firstLook?.querySelector<HTMLElement>(".preview-device") ?? null;
  if (!heroPhone || !firstLook || !firstLookStory || !destinationPhone) return null;
  return {
    heroPhone,
    firstLook,
    firstLookStory,
    destinationPhone,
    destinationFrame: destinationPhone.querySelector<HTMLIFrameElement>("iframe.preview-page"),
  };
}

function clearDeviceHandoffStyles(device: HTMLElement) {
  for (const property of DEVICE_STYLE_PROPERTIES) {
    device.style.removeProperty(property);
  }
}

function createPlaceholder(document: Document, device: HTMLElement) {
  const placeholder = document.createElement("div");
  placeholder.setAttribute(HANDOFF_PLACEHOLDER_ATTRIBUTE, "true");
  placeholder.setAttribute("aria-hidden", "true");
  placeholder.style.width = `${device.offsetWidth}px`;
  placeholder.style.height = `${device.offsetHeight}px`;
  placeholder.style.maxWidth = "100%";
  placeholder.style.justifySelf = "center";
  placeholder.style.visibility = "hidden";
  placeholder.style.pointerEvents = "none";
  device.parentElement?.insertBefore(placeholder, device);
  return placeholder;
}

/**
 * Makes the real first-look Home device visually continue from the hero Home
 * phone for the short boundary between those scenes.
 *
 * This does not clone the product UI or create another iframe. The destination
 * device itself temporarily becomes viewport-fixed while an invisible in-flow
 * placeholder preserves its final grid slot. Native scrolling remains fully in
 * charge; this layer only derives geometry from the current scroll position.
 */
export function installTerraOsTeaserHeroHandoff(frame: HTMLElement) {
  const hostDocument = frame.ownerDocument;
  const hostWindow = hostDocument.defaultView as TerraOsHeroHandoffWindow | null;
  const maintenanceRoot = hostDocument.querySelector<HTMLElement>(
    '[data-solaris-maintenance="true"]',
  );
  if (!hostWindow || !maintenanceRoot) return () => undefined;

  const existing = hostWindow.__terraosTeaserHeroHandoffRuntime;
  if (existing) {
    existing.owners += 1;
    return () => {
      existing.owners = Math.max(0, existing.owners - 1);
      if (existing.owners === 0) {
        existing.release();
        delete hostWindow.__terraosTeaserHeroHandoffRuntime;
      }
    };
  }

  const root = hostDocument.documentElement;
  const reducedMotion = hostWindow.matchMedia("(prefers-reduced-motion: reduce)");
  let elements = collectHandoffElements(hostDocument);
  let placeholder: HTMLElement | null = null;
  let animationFrame = 0;
  let released = false;

  const removePlaceholder = () => {
    placeholder?.remove();
    placeholder = null;
  };

  const restoreNaturalDevice = (keepHeroHidden = false) => {
    if (!elements) return;
    clearDeviceHandoffStyles(elements.destinationPhone);
    elements.firstLook.style.removeProperty("overflow");
    removePlaceholder();
    if (keepHeroHidden) elements.heroPhone.style.visibility = "hidden";
    else elements.heroPhone.style.removeProperty("visibility");
  };

  const ensurePlaceholder = () => {
    if (!elements) return null;
    if (!placeholder?.isConnected) {
      placeholder = createPlaceholder(hostDocument, elements.destinationPhone);
    }
    return placeholder;
  };

  const render = () => {
    animationFrame = 0;
    if (released || reducedMotion.matches) return;
    elements = collectHandoffElements(hostDocument);
    if (!elements) return;

    const storyTop = elements.firstLookStory.getBoundingClientRect().top;
    if (storyTop <= hostWindow.innerHeight * 1.18 && elements.destinationFrame?.loading === "lazy") {
      // Preserve the initial lazy-load budget, then prewarm the existing Home
      // preview shortly before the handoff can begin. No duplicate iframe is
      // created and the fixture-only route remains the same.
      elements.destinationFrame.loading = "eager";
    }

    const progress = resolveTerraOsHeroHandoffProgress(storyTop, hostWindow.innerHeight);

    if (progress <= 0.001) {
      root.dataset.terraosHeroHandoff = "idle";
      restoreNaturalDevice(false);
      return;
    }

    if (progress >= 0.999) {
      root.dataset.terraosHeroHandoff = "settled";
      restoreNaturalDevice(true);
      return;
    }

    const slot = ensurePlaceholder();
    if (!slot) return;

    const source = elements.heroPhone.getBoundingClientRect();
    const destination = slot.getBoundingClientRect();
    const eased = smoothstep(progress);
    const left = mix(source.left, destination.left, eased);
    const top = mix(source.top, destination.top, eased);
    const width = mix(source.width, destination.width, eased);
    const height = mix(source.height, destination.height, eased);

    root.dataset.terraosHeroHandoff = "active";
    elements.heroPhone.style.visibility = "hidden";
    elements.firstLook.style.setProperty("overflow", "visible", "important");

    const device = elements.destinationPhone;
    device.style.setProperty("position", "fixed");
    device.style.setProperty("inset", "auto");
    device.style.setProperty("left", `${left.toFixed(2)}px`);
    device.style.setProperty("top", `${top.toFixed(2)}px`);
    device.style.setProperty("width", `${width.toFixed(2)}px`);
    device.style.setProperty("height", `${height.toFixed(2)}px`);
    device.style.setProperty("max-width", "none");
    device.style.setProperty("margin", "0");
    device.style.setProperty("z-index", "28");
    device.style.setProperty("justify-self", "auto");
    device.style.setProperty("transform", "none");
    device.style.setProperty("transform-origin", "50% 50%");
    device.style.setProperty("opacity", "1");
    device.style.setProperty("filter", "none");
    device.style.setProperty("pointer-events", "none");
    device.style.setProperty("box-sizing", "border-box");
  };

  const requestRender = () => {
    if (!animationFrame && !released && !reducedMotion.matches) {
      animationFrame = hostWindow.requestAnimationFrame(render);
    }
  };

  const onResize = () => {
    restoreNaturalDevice(false);
    requestRender();
  };

  const applyMotionPreference = () => {
    if (reducedMotion.matches) {
      if (animationFrame) hostWindow.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      root.dataset.terraosHeroHandoff = "reduced";
      restoreNaturalDevice(false);
      return;
    }
    requestRender();
  };

  render();
  hostWindow.addEventListener("scroll", requestRender, { passive: true });
  hostWindow.addEventListener("resize", onResize, { passive: true });
  reducedMotion.addEventListener("change", applyMotionPreference);

  const runtime: TerraOsHeroHandoffRuntime = {
    owners: 1,
    release: () => {
      if (released) return;
      released = true;
      if (animationFrame) hostWindow.cancelAnimationFrame(animationFrame);
      hostWindow.removeEventListener("scroll", requestRender);
      hostWindow.removeEventListener("resize", onResize);
      reducedMotion.removeEventListener("change", applyMotionPreference);
      restoreNaturalDevice(false);
      delete root.dataset.terraosHeroHandoff;
    },
  };

  hostWindow.__terraosTeaserHeroHandoffRuntime = runtime;

  return () => {
    runtime.owners = Math.max(0, runtime.owners - 1);
    if (runtime.owners === 0) {
      runtime.release();
      delete hostWindow.__terraosTeaserHeroHandoffRuntime;
    }
  };
}
