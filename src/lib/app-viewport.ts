export type AppViewportSnapshot = {
  viewportWidth: number;
  viewportHeight: number;
  viewportOffsetLeft: number;
  viewportOffsetTop: number;
  viewportScale: number;
  keyboardInset: number;
  keyboardOpen: boolean;
};

export type AppKeyboardViewportInput = {
  layoutHeight: number;
  viewportHeight: number;
  viewportOffsetTop: number;
  viewportScale: number;
  editableFocus: boolean;
};

const KEYBOARD_THRESHOLD_PX = 120;
const PINCH_ZOOM_SCALE_EPSILON = 0.05;

function activeElementMayOwnKeyboard() {
  if (typeof document === "undefined") return false;
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return false;

  if (active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement) {
    return !active.hasAttribute("disabled");
  }

  if (active instanceof HTMLInputElement) {
    if (active.disabled || active.readOnly) return false;
    return ![
      "button",
      "checkbox",
      "color",
      "file",
      "hidden",
      "image",
      "radio",
      "range",
      "reset",
      "submit",
    ].includes(active.type);
  }

  return active.isContentEditable;
}

export function resolveAppKeyboardViewport({
  layoutHeight,
  viewportHeight,
  viewportOffsetTop,
  viewportScale,
  editableFocus,
}: AppKeyboardViewportInput) {
  const safeScale =
    Number.isFinite(viewportScale) && viewportScale > 0 ? viewportScale : 1;
  const rawInset = Math.max(
    0,
    layoutHeight - (viewportHeight + viewportOffsetTop),
  );
  const pinchZoomed =
    Math.abs(safeScale - 1) > PINCH_ZOOM_SCALE_EPSILON;

  // VisualViewport height shrinks for both pinch zoom and the software keyboard.
  // At ~1x retain the established offset-aware bottom-occlusion calculation.
  // While pinch-zoomed, first normalize the visible height back to the 1x screen
  // scale; viewportOffsetTop is page pan in layout CSS pixels, not keyboard height,
  // so it must not be mixed into that normalized estimate. Editable focus remains
  // a fail-closed prerequisite because zoom alone is not evidence of an IME.
  const zoomNormalizedInset = Math.max(
    0,
    layoutHeight - viewportHeight * safeScale,
  );
  const keyboardInset = pinchZoomed
    ? editableFocus && zoomNormalizedInset >= KEYBOARD_THRESHOLD_PX
      ? zoomNormalizedInset
      : 0
    : rawInset;

  return {
    keyboardInset,
    keyboardOpen: keyboardInset >= KEYBOARD_THRESHOLD_PX,
  };
}

function readViewport(): AppViewportSnapshot {
  if (typeof window === "undefined") {
    return {
      viewportWidth: 0,
      viewportHeight: 0,
      viewportOffsetLeft: 0,
      viewportOffsetTop: 0,
      viewportScale: 1,
      keyboardInset: 0,
      keyboardOpen: false,
    };
  }

  const visual = window.visualViewport;
  const viewportWidth = visual?.width ?? window.innerWidth;
  const viewportHeight = visual?.height ?? window.innerHeight;
  const viewportOffsetLeft = visual?.offsetLeft ?? 0;
  const viewportOffsetTop = visual?.offsetTop ?? 0;
  const viewportScale = visual?.scale ?? 1;
  const keyboard = resolveAppKeyboardViewport({
    layoutHeight: window.innerHeight,
    viewportHeight,
    viewportOffsetTop,
    viewportScale,
    editableFocus: activeElementMayOwnKeyboard(),
  });

  return {
    viewportWidth,
    viewportHeight,
    viewportOffsetLeft,
    viewportOffsetTop,
    viewportScale,
    keyboardInset: keyboard.keyboardInset,
    keyboardOpen: keyboard.keyboardOpen,
  };
}

function applyViewportCss(snapshot: AppViewportSnapshot) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty(
    "--solaris-visual-viewport-width",
    `${snapshot.viewportWidth}px`,
  );
  root.style.setProperty(
    "--solaris-visual-viewport-height",
    `${snapshot.viewportHeight}px`,
  );
  root.style.setProperty(
    "--solaris-visual-viewport-offset-left",
    `${snapshot.viewportOffsetLeft}px`,
  );
  root.style.setProperty(
    "--solaris-visual-viewport-offset-top",
    `${snapshot.viewportOffsetTop}px`,
  );
  root.style.setProperty(
    "--solaris-visual-viewport-scale",
    String(snapshot.viewportScale),
  );
  root.style.setProperty(
    "--solaris-keyboard-inset",
    `${snapshot.keyboardInset}px`,
  );
  root.toggleAttribute("data-solaris-keyboard-open", snapshot.keyboardOpen);
}

export function initialAppViewportSnapshot() {
  return readViewport();
}

export function createAppViewportController(
  onChange: (snapshot: AppViewportSnapshot) => void,
) {
  if (typeof window === "undefined") return () => undefined;

  const visual = window.visualViewport;
  let frame: number | null = null;

  const refresh = () => {
    frame = null;
    const snapshot = readViewport();
    applyViewportCss(snapshot);
    onChange(snapshot);
  };

  const schedule = () => {
    if (frame != null) return;
    frame = window.requestAnimationFrame(refresh);
  };

  window.addEventListener("resize", schedule);
  window.addEventListener("orientationchange", schedule);
  visual?.addEventListener("resize", schedule);
  visual?.addEventListener("scroll", schedule);

  refresh();

  return () => {
    if (frame != null) window.cancelAnimationFrame(frame);
    window.removeEventListener("resize", schedule);
    window.removeEventListener("orientationchange", schedule);
    visual?.removeEventListener("resize", schedule);
    visual?.removeEventListener("scroll", schedule);
    if (typeof document !== "undefined") {
      const root = document.documentElement;
      root.style.removeProperty("--solaris-visual-viewport-width");
      root.style.removeProperty("--solaris-visual-viewport-height");
      root.style.removeProperty("--solaris-visual-viewport-offset-left");
      root.style.removeProperty("--solaris-visual-viewport-offset-top");
      root.style.removeProperty("--solaris-visual-viewport-scale");
      root.style.removeProperty("--solaris-keyboard-inset");
      root.removeAttribute("data-solaris-keyboard-open");
    }
  };
}
