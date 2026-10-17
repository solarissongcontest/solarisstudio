import {
  resolveV3LogicalHorizontalDelta,
  type V3LayoutDirection,
} from "@/lib/v3-navigation-gesture";

export type V3NavigationVisualProgressInput = {
  originIndex: number;
  physicalDelta: number;
  slotWidth: number;
  itemCount: number;
  direction: V3LayoutDirection;
};

export type V3TabIconVisualState = {
  weight: number;
  opacity: number;
  scale: number;
  strokeWidth: number;
};

/**
 * Converts the visible physical lens displacement into the shared logical
 * navigation progress used by Public and Organizer direct manipulation.
 */
export function resolveV3NavigationVisualProgress({
  originIndex,
  physicalDelta,
  slotWidth,
  itemCount,
  direction,
}: V3NavigationVisualProgressInput) {
  const count = Math.max(1, Math.floor(itemCount));
  const origin = Math.min(count - 1, Math.max(0, originIndex));
  const logicalDelta = resolveV3LogicalHorizontalDelta(physicalDelta, direction);
  const progress = origin + logicalDelta / Math.max(1, slotWidth);
  return Math.min(count - 1, Math.max(0, progress));
}

/**
 * Integer progress reproduces the resting Public icon optics exactly. Fractional
 * progress linearly hands emphasis between adjacent icons without route-state or
 * React-state churn in the pointer hot loop.
 */
export function resolveV3TabIconVisualState(
  index: number,
  visualProgress: number,
): V3TabIconVisualState {
  const weight = Math.max(0, Math.min(1, 1 - Math.abs(index - visualProgress)));
  return {
    weight,
    opacity: 0.78 + weight * 0.22,
    scale: 0.97 + weight * 0.05,
    strokeWidth: 1.9 + weight * 0.35,
  };
}
