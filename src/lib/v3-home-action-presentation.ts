import type { V3ActionProjection } from "./v3-experience";

type HomeAttentionAction = Pick<
  V3ActionProjection,
  "sourceState" | "urgency" | "deliveryClass"
>;

/**
 * Urgency is time pressure, not proof that an action is mandatory.
 * Keep Home styling consistent with the canonical action delivery class.
 */
export function homeActionTone(action: HomeAttentionAction) {
  if (action.sourceState === "problem") return "problem" as const;
  if (action.urgency === "immediate" || action.urgency === "high") return "urgent" as const;
  if (action.deliveryClass === "required") return "required" as const;
  return "neutral" as const;
}

export function homeActionRequirementLabel(
  deliveryClass: V3ActionProjection["deliveryClass"],
) {
  switch (deliveryClass) {
    case "required":
      return "Required";
    case "recommended":
      return "Recommended";
    case "optional":
      return "Optional";
  }
}

/**
 * A lack of participant tasks is not evidence of completion for a visitor who
 * has no authenticated identity. Preserve the calm state without inventing
 * personal progress or forcing sign-in to browse the public contest.
 */
export function homeCalmPresentation(viewerId: string | null) {
  return viewerId
    ? { title: "You're all caught up", showSignIn: false }
    : { title: "Discover what's happening in Solaris", showSignIn: true };
}
