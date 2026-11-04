/**
 * Page swipe owns one primary pointer at a time.
 *
 * A second touch on the page must abort, not replace the gesture in progress.
 * Mouse/pen events must not steal an existing pointer's ownership either.
 */
export type V3SwipePointerDecision = "start" | "ignore" | "cancel";

export function resolveV3SwipePointerStart({
  activePointerId,
  incomingPointerId,
  isPrimary,
  pointerType,
}: {
  activePointerId: number | null;
  incomingPointerId: number;
  isPrimary: boolean;
  pointerType: string;
}): V3SwipePointerDecision {
  if (activePointerId != null) {
    if (incomingPointerId === activePointerId) return "ignore";
    return pointerType === "touch" ? "cancel" : "ignore";
  }
  return isPrimary ? "start" : "ignore";
}

/**
 * Pointer cancellation can arrive after the secondary touch has moved away.
 * While the primary pointer owns a page swipe, the browser's TouchEvent must
 * describe exactly one live touch or the gesture is no longer safe to commit.
 */
export function v3SwipeTouchStillSingle(touchCount: number) {
  return touchCount === 1;
}
