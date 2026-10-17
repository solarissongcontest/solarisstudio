export const V3_SCROLL_RESTORED_EVENT = "solaris:v3-scroll-restored";

/**
 * Restores a remembered scroll position after the new route has painted, then
 * tells scroll-responsive chrome to rebase at that position. The returned
 * cleanup prevents an older route's queued restoration from firing after a
 * faster redirect/tab change has already won.
 */
export function scheduleV3ScrollRestoration(scrollY: number) {
  if (typeof window === "undefined") return () => undefined;

  const targetY = Math.max(0, Number.isFinite(scrollY) ? scrollY : 0);
  let firstFrame: number | null = null;
  let secondFrame: number | null = null;
  let cancelled = false;

  firstFrame = window.requestAnimationFrame(() => {
    firstFrame = null;
    secondFrame = window.requestAnimationFrame(() => {
      secondFrame = null;
      if (cancelled) return;
      window.scrollTo({ top: targetY, behavior: "auto" });
      window.dispatchEvent(new Event(V3_SCROLL_RESTORED_EVENT));
    });
  });

  return () => {
    cancelled = true;
    if (firstFrame != null) window.cancelAnimationFrame(firstFrame);
    if (secondFrame != null) window.cancelAnimationFrame(secondFrame);
    firstFrame = null;
    secondFrame = null;
  };
}
