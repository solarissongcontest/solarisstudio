export type AppViewportSnapshot = {
  viewportWidth: number;
  viewportHeight: number;
  viewportOffsetLeft: number;
  viewportOffsetTop: number;
  viewportScale: number;
  keyboardInset: number;
  keyboardOpen: boolean;
};

const KEYBOARD_THRESHOLD_PX = 120;

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
  const keyboardInset = Math.max(
    0,
    window.innerHeight - (viewportHeight + viewportOffsetTop),
  );

  return {
    viewportWidth,
    viewportHeight,
    viewportOffsetLeft,
    viewportOffsetTop,
    viewportScale,
    keyboardInset,
    keyboardOpen: keyboardInset >= KEYBOARD_THRESHOLD_PX,
  };
}

function applyViewportCss(snapshot: AppViewportSnapshot) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--solaris-visual-viewport-width", `${snapshot.viewportWidth}px`);
  root.style.setProperty("--solaris-visual-viewport-height", `${snapshot.viewportHeight}px`);
  root.style.setProperty("--solaris-visual-viewport-offset-left", `${snapshot.viewportOffsetLeft}px`);
  root.style.setProperty("--solaris-visual-viewport-offset-top", `${snapshot.viewportOffsetTop}px`);
  root.style.setProperty("--solaris-visual-viewport-scale", String(snapshot.viewportScale));
  root.style.setProperty("--solaris-keyboard-inset", `${snapshot.keyboardInset}px`);
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
