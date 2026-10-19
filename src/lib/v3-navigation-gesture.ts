import { resolveSolarisAppScreen } from "@/lib/app-screen-registry";

export type V3TopLevelSwipePolicy =
  | "enabled"
  | "content-priority"
  | "disabled"
  | "critical-flow";

export type V3SwipeIntent = "undecided" | "horizontal" | "vertical";
export type V3LayoutDirection = "ltr" | "rtl";

export type V3PageSettleMotion = {
  durationMs: number;
  remainingRatio: number;
  releaseSpeed: number;
};

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

export function isV3ScrollableHorizontalOverflow({
  overflowX,
  scrollWidth,
  clientWidth,
}: {
  overflowX: string;
  scrollWidth: number;
  clientWidth: number;
}) {
  const overflow = overflowX.trim().toLowerCase();
  const scrollableOverflow = overflow === "auto" || overflow === "scroll";
  return scrollableOverflow && scrollWidth > clientWidth + 1;
}

export function elementBlocksV3TopLevelSwipe(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  if (target.closest(HORIZONTAL_BLOCK_SELECTOR)) return true;

  // Feature owners should use the explicit selectors above whenever possible,
  // but the global page gesture must still fail closed around a real horizontal
  // scroller that was not annotated. This inspection happens only at pointer
  // start, never in the per-frame move loop.
  if (typeof window !== "undefined") {
    let current: Element | null = target;
    while (current) {
      if (current instanceof HTMLElement) {
        const style = window.getComputedStyle(current);
        if (
          isV3ScrollableHorizontalOverflow({
            overflowX: style.overflowX,
            scrollWidth: current.scrollWidth,
            clientWidth: current.clientWidth,
          })
        ) {
          return true;
        }
      }
      current = current.parentElement;
    }
  }

  const selection = typeof window !== "undefined" ? window.getSelection?.() : null;
  return Boolean(selection && !selection.isCollapsed);
}

/**
 * Converts a physical X-axis value into the logical navigation axis.
 * Positive means toward the previous/leading destination and negative means
 * toward the next/trailing destination regardless of document direction.
 */
export function resolveV3LogicalHorizontalDelta(
  value: number,
  direction: V3LayoutDirection = "ltr",
) {
  return direction === "rtl" ? -value : value;
}

/** Physical sign used when a logical navigation transform is applied to X. */
export function resolveV3PhysicalInlineSign(direction: V3LayoutDirection = "ltr") {
  return direction === "rtl" ? -1 : 1;
}

export function resolveV3PageSwipeOffset({
  rawDelta,
  activeIndex,
  itemCount,
  viewportWidth,
  direction = "ltr",
}: {
  rawDelta: number;
  activeIndex: number;
  itemCount: number;
  viewportWidth: number;
  direction?: V3LayoutDirection;
}) {
  const count = Math.max(1, Math.floor(itemCount));
  const index = Math.min(count - 1, Math.max(0, Math.floor(activeIndex)));
  const width = Math.max(1, viewportWidth);
  const logicalDelta = resolveV3LogicalHorizontalDelta(rawDelta, direction);
  const atLeadingEdge = index === 0 && logicalDelta > 0;
  const atTrailingEdge = index === count - 1 && logicalDelta < 0;

  if (!atLeadingEdge && !atTrailingEdge) {
    return Math.max(-width, Math.min(width, logicalDelta));
  }

  const sign = logicalDelta < 0 ? -1 : 1;
  const resisted = Math.min(56, Math.abs(logicalDelta) * 0.22);
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
  direction = "ltr",
}: {
  deltaX: number;
  velocityX: number;
  viewportWidth: number;
  activeIndex: number;
  itemCount: number;
  displacementRatio?: number;
  velocityThreshold?: number;
  direction?: V3LayoutDirection;
}) {
  const count = Math.max(1, Math.floor(itemCount));
  const index = Math.min(count - 1, Math.max(0, Math.floor(activeIndex)));
  const width = Math.max(1, viewportWidth);
  const logicalDelta = resolveV3LogicalHorizontalDelta(deltaX, direction);
  const logicalVelocity = resolveV3LogicalHorizontalDelta(velocityX, direction);
  const displacementWins = Math.abs(logicalDelta) >= width * displacementRatio;
  const velocityWins = Math.abs(logicalVelocity) >= velocityThreshold;

  if (!displacementWins && !velocityWins) return index;
  const logicalDirection =
    logicalDelta === 0 ? Math.sign(logicalVelocity) : Math.sign(logicalDelta);
  // Logical movement toward trailing content reveals the next tab; movement
  // toward leading content reveals the previous tab. Physical X is normalized
  // above so the rule is identical in LTR and RTL layouts.
  const step = logicalDirection < 0 ? 1 : logicalDirection > 0 ? -1 : 0;
  return Math.min(count - 1, Math.max(0, index + step));
}

/**
 * Converts the same release state used for destination selection into bounded
 * settle timing. A nearly-complete or fast swipe finishes quickly; a slow
 * release with more travel remaining gets a longer spring. Mirrored RTL input
 * resolves identically because both displacement and velocity are normalized
 * onto the logical navigation axis first.
 */
export function resolveV3PageSettleMotion({
  deltaX,
  velocityX,
  viewportWidth,
  activeIndex,
  targetIndex,
  direction = "ltr",
}: {
  deltaX: number;
  velocityX: number;
  viewportWidth: number;
  activeIndex: number;
  targetIndex: number;
  direction?: V3LayoutDirection;
}): V3PageSettleMotion {
  const width = Math.max(1, viewportWidth);
  const logicalDelta = resolveV3LogicalHorizontalDelta(deltaX, direction);
  const logicalVelocity = resolveV3LogicalHorizontalDelta(velocityX, direction);
  const targetLogicalDelta = (activeIndex - targetIndex) * width;
  const remainingRatio = Math.min(
    1.35,
    Math.abs(targetLogicalDelta - logicalDelta) / width,
  );
  const releaseSpeed = Math.min(1.8, Math.abs(logicalVelocity));
  const speedRatio = Math.min(1, releaseSpeed / 1.35);
  const distanceOwnedMs = 145 + remainingRatio * 95;
  const durationMs = Math.round(
    Math.max(120, Math.min(260, distanceOwnedMs - speedRatio * 75)),
  );

  return { durationMs, remainingRatio, releaseSpeed };
}

export { HORIZONTAL_BLOCK_SELECTOR };
