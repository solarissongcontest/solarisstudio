export type V3MotionProfile = "full" | "reduced";
export type V3Haptic = "none" | "selection" | "confirmation" | "success" | "warning";
export type V3InteractionKind =
  | "tap"
  | "tab_select"
  | "sheet_open"
  | "sheet_dismiss"
  | "card_expand"
  | "journey_complete"
  | "submission_success"
  | "validation_error"
  | "result_reveal"
  | "live_transition"
  | "search_focus";

export type V3InteractionPolicy = {
  kind: V3InteractionKind;
  durationMs: number;
  spring: "none" | "tight" | "standard" | "soft";
  haptic: V3Haptic;
  transform: "none" | "press" | "translate" | "scale" | "staged";
  interruptible: boolean;
  reducedMotionFallback: "instant" | "fade" | "color";
};

const FULL: Readonly<Record<V3InteractionKind, V3InteractionPolicy>> = Object.freeze({
  tap: {
    kind: "tap",
    durationMs: 100,
    spring: "tight",
    haptic: "none",
    transform: "press",
    interruptible: true,
    reducedMotionFallback: "color",
  },
  tab_select: {
    kind: "tab_select",
    durationMs: 200,
    spring: "standard",
    haptic: "selection",
    transform: "translate",
    interruptible: true,
    reducedMotionFallback: "fade",
  },
  sheet_open: {
    kind: "sheet_open",
    durationMs: 260,
    spring: "standard",
    haptic: "none",
    transform: "translate",
    interruptible: true,
    reducedMotionFallback: "fade",
  },
  sheet_dismiss: {
    kind: "sheet_dismiss",
    durationMs: 180,
    spring: "standard",
    haptic: "none",
    transform: "translate",
    interruptible: true,
    reducedMotionFallback: "fade",
  },
  card_expand: {
    kind: "card_expand",
    durationMs: 240,
    spring: "standard",
    haptic: "none",
    transform: "scale",
    interruptible: true,
    reducedMotionFallback: "fade",
  },
  journey_complete: {
    kind: "journey_complete",
    durationMs: 380,
    spring: "standard",
    haptic: "success",
    transform: "staged",
    interruptible: false,
    reducedMotionFallback: "fade",
  },
  submission_success: {
    kind: "submission_success",
    durationMs: 320,
    spring: "standard",
    haptic: "success",
    transform: "staged",
    interruptible: false,
    reducedMotionFallback: "fade",
  },
  validation_error: {
    kind: "validation_error",
    durationMs: 160,
    spring: "tight",
    haptic: "warning",
    transform: "translate",
    interruptible: true,
    reducedMotionFallback: "color",
  },
  result_reveal: {
    kind: "result_reveal",
    durationMs: 1200,
    spring: "soft",
    haptic: "success",
    transform: "staged",
    interruptible: true,
    reducedMotionFallback: "fade",
  },
  live_transition: {
    kind: "live_transition",
    durationMs: 360,
    spring: "soft",
    haptic: "none",
    transform: "staged",
    interruptible: true,
    reducedMotionFallback: "fade",
  },
  search_focus: {
    kind: "search_focus",
    durationMs: 160,
    spring: "tight",
    haptic: "none",
    transform: "scale",
    interruptible: true,
    reducedMotionFallback: "color",
  },
});

export function v3InteractionPolicy(
  kind: V3InteractionKind,
  profile: V3MotionProfile = "full",
): V3InteractionPolicy {
  const policy = FULL[kind];
  if (profile === "full") return policy;

  return {
    ...policy,
    durationMs: policy.reducedMotionFallback === "instant" ? 0 : Math.min(140, policy.durationMs),
    spring: "none",
    haptic: policy.haptic,
    transform: "none",
  };
}

export function shouldV3FireSuccessHaptic(authoritativeSuccess: boolean) {
  return authoritativeSuccess;
}
