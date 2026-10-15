import { resolveSolarisAppScreen } from "@/lib/app-screen-registry";

export type V3TopLevelSwipePolicy =
  | "enabled"
  | "content-priority"
  | "disabled"
  | "critical-flow";

export type V3SwipeIntent = "undecided" | "horizontal" | "vertical";

const HORIZONTAL_BLOCK_SELECTOR = [
  '[data-v3-swipe-owner="content"]',
  '[data-v3-horizontal-gesture="true"]',
  '[data-carousel]',
  '[data-solaris-sheet]',
  '[data-solaris-drawer]',
  '[role="slider"]',
  '[role="scrollbar"]',
  'input',
  'textarea',
  'select',
  'button',
  '[contenteditable="true"]',
  '.overflow-x-auto',
  '.overflow-x-scroll',
].join(",");

export function resolveV3TopLevelSwipePolicy(
  pathname: string,
  searchStr = "",
): V3TopLevelSwipePolicy {
  const screen = resolveSolarisAppScreen(pathname, searchStr);

  if (screen.behavior.criticalTask) return "critical-flow";
  if (screen.behavior.immersive || screen.chrome.tabbar !== "full") return "disabled";
  if (screen.presentation === "root") return "enabled";
  return "content-priority";
}

export function classifyV3SwipeIntent({
  deltaX,
  deltaY,
  threshold = 7,
  directionRatio = 1.25,
}: {
  deltaX: number;
  deltaY: number;
  threshold?: number;
  directionRatio?: number;
}): V3SwipeIntent {
  const x = Math.abs(deltaX);
  const y = Math.abs(deltaY);
  if (Math.max(x, y) < threshold) return "undecided";
  if (x > y * directionRatio) return "horizontal";
  if (y > x * directionRatio) return "vertical";
  return "undecided";
}

export function isV3BrowserEdgeGestureStart({
  clientX,
  viewportWidth,
  exclusion = 28,
}: {
  clientX: number;
  viewportWidth: number;
  exclusion?: number;
}) {
  const width = Math.max(0, viewportWidth);
  const edge = Math.max(0, exclusion);
  return clientX <= edge || clientX >= width - edge;
}

export function elementBlocksV3TopLevelSwipe(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  if (target.closest(HORIZONTAL_BLOCK_SELECTOR)) return true;
  const selection = typeof window !== "undefined" ? window.getSelection?.() : null;
  return Boolean(selection && !selection.isCollapsed);
}

export function resolveV3PageSwipeOffset({
  rawDelta,
  activeIndex,
  itemCount,
  viewportWidth,
}: {
  rawDelta: number;
  activeIndex: number;
  itemCount: number;
  viewportWidth: number;
}) {
  const count = Math.max(1, Math.floor(itemCount));
  const index = Math.min(count - 1, Math.max(0, Math.floor(activeIndex)));
  const width = Math.max(1, viewportWidth);
  const atLeadingEdge = index === 0 && rawDelta > 0;
  const atTrailingEdge = index === count - 1 && rawDelta < 0;

  if (!atLeadingEdge && !atTrailingEdge) {
    return Math.max(-width, Math.min(width, rawDelta));
  }

  const sign = rawDelta < 0 ? -1 : 1;
  const resisted = Math.min(56, Math.abs(rawDelta) * 0.22);
  return sign * resisted;
}

export function resolveV3PageSwipeTarget({
  deltaX,
  velocityX,
  viewportWidth,
  activeIndex,
  itemCount,
  displacementRatio = 0.24,
  velocityThreshold = 0.55,
}: {
  deltaX: number;
  velocityX: number;
  viewportWidth: number;
  activeIndex: number;
  itemCount: number;
  displacementRatio?: number;
  velocityThreshold?: number;
}) {
  const count = Math.max(1, Math.floor(itemCount));
  const index = Math.min(count - 1, Math.max(0, Math.floor(activeIndex)));
  const width = Math.max(1, viewportWidth);
  const displacementWins = Math.abs(deltaX) >= width * displacementRatio;
  const velocityWins = Math.abs(velocityX) >= velocityThreshold;

  if (!displacementWins && !velocityWins) return index;
  const direction = deltaX === 0 ? Math.sign(velocityX) : Math.sign(deltaX);
  // Finger moving left reveals the next tab; finger moving right reveals the previous.
  const step = direction < 0 ? 1 : direction > 0 ? -1 : 0;
  return Math.min(count - 1, Math.max(0, index + step));
}

export { HORIZONTAL_BLOCK_SELECTOR };
