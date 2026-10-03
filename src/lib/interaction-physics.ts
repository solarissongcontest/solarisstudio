export type SolarisInteractionWeight = "light" | "standard" | "heavy";
export type SolarisGestureOwner = "none" | "horizontal" | "vertical";

export const SOLARIS_INTERACTION_TOKENS = {
  duration: {
    instant: 70,
    micro: 140,
    fast: 190,
    standard: 240,
    deliberate: 340,
  },
  spring: {
    tight: { stiffness: 520, damping: 38 },
    standard: { stiffness: 390, damping: 32 },
    elastic: { stiffness: 300, damping: 24 },
    heavy: { stiffness: 430, damping: 42 },
  },
  distance: {
    micro: 2,
    small: 7,
    navigation: 18,
  },
  stretch: {
    low: 0.025,
    standard: 0.055,
    max: 0.08,
  },
} as const;

export type ScrollResponsiveBarState = {
  collapsed: boolean;
  downTravel: number;
  upTravel: number;
};

export type ScrollResponsiveBarInput = ScrollResponsiveBarState & {
  currentY: number;
  lastY: number;
};

export type ScrollResponsiveBarConfig = {
  forceExpandedBefore: number;
  collapseAfterY: number;
  collapseTravel: number;
  expandTravel: number;
};

export const DEFAULT_SCROLL_RESPONSIVE_BAR_CONFIG: ScrollResponsiveBarConfig = {
  forceExpandedBefore: 80,
  collapseAfterY: 140,
  collapseTravel: 56,
  expandTravel: 18,
};

/**
 * Pure hysteresis function used by scroll-responsive navigation.
 * Small direction noise resets the opposite accumulator rather than toggling
 * the bar, so the UI responds to intent instead of individual wheel/touch deltas.
 */
export function resolveScrollResponsiveBar(
  input: ScrollResponsiveBarInput,
  config: ScrollResponsiveBarConfig = DEFAULT_SCROLL_RESPONSIVE_BAR_CONFIG,
): ScrollResponsiveBarState {
  const currentY = Math.max(0, input.currentY);
  const delta = currentY - input.lastY;

  if (currentY < config.forceExpandedBefore) {
    return { collapsed: false, downTravel: 0, upTravel: 0 };
  }

  if (delta > 0) {
    const downTravel = input.downTravel + delta;
    if (currentY > config.collapseAfterY && downTravel >= config.collapseTravel) {
      return { collapsed: true, downTravel: 0, upTravel: 0 };
    }
    return { collapsed: input.collapsed, downTravel, upTravel: 0 };
  }

  if (delta < 0) {
    const upTravel = input.upTravel + -delta;
    if (upTravel >= config.expandTravel) {
      return { collapsed: false, downTravel: 0, upTravel: 0 };
    }
    return { collapsed: input.collapsed, downTravel: 0, upTravel };
  }

  return {
    collapsed: input.collapsed,
    downTravel: input.downTravel,
    upTravel: input.upTravel,
  };
}

export type ElasticDragResponse = {
  delta: number;
  distance: number;
  progress: number;
  scaleX: number;
  growWidth: number;
  growHeight: number;
  growRadius: number;
  moved: boolean;
  direction: "left" | "center" | "right";
};

export function resolveElasticDrag({
  rawDelta,
  minDelta,
  maxDelta,
  slotWidth,
  movementThreshold = 7,
}: {
  rawDelta: number;
  minDelta: number;
  maxDelta: number;
  slotWidth: number;
  movementThreshold?: number;
}): ElasticDragResponse {
  const delta = Math.min(maxDelta, Math.max(minDelta, rawDelta));
  const distance = Math.abs(delta);
  const safeSlotWidth = Math.max(1, slotWidth);
  const progress = Math.min(1, distance / Math.max(1, safeSlotWidth * 1.15));

  return {
    delta,
    distance,
    progress,
    scaleX: 1 + progress * SOLARIS_INTERACTION_TOKENS.stretch.standard,
    growWidth: progress * 10,
    growHeight: progress * 9,
    growRadius: progress * 4,
    moved: distance >= movementThreshold,
    direction: delta > 2 ? "right" : delta < -2 ? "left" : "center",
  };
}

export function resolveGestureOwner(
  deltaX: number,
  deltaY: number,
  threshold = SOLARIS_INTERACTION_TOKENS.distance.small,
): SolarisGestureOwner {
  const x = Math.abs(deltaX);
  const y = Math.abs(deltaY);
  if (Math.max(x, y) < threshold) return "none";
  if (x === y) return "none";
  return x > y ? "horizontal" : "vertical";
}

export function interactionDuration(
  weight: SolarisInteractionWeight,
  reducedMotion: boolean,
) {
  if (reducedMotion) return SOLARIS_INTERACTION_TOKENS.duration.instant;
  if (weight === "light") return SOLARIS_INTERACTION_TOKENS.duration.micro;
  if (weight === "heavy") return SOLARIS_INTERACTION_TOKENS.duration.deliberate;
  return SOLARIS_INTERACTION_TOKENS.duration.standard;
}

export function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}
