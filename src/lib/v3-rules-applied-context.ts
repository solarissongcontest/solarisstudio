import {
  GOVERNANCE_ACTION_KEYS,
  type GovernanceActionKey,
} from "@/lib/governance-v5";
import { getRuleContext } from "@/lib/rule-context";

export type AppliedRulesContextResolution = {
  context: GovernanceActionKey | null;
  source: "explicit" | "session-action" | "session-path" | "none";
};

export function actionForAppliedRulesPath(
  path: string | null | undefined,
): GovernanceActionKey | null {
  if (!path) return null;
  const context = getRuleContext(path);
  if (!context) return null;
  if (context.key === "confirmations") return "confirmation.submit";
  if (context.key === "jury") return "jury.vote";
  if (context.key === "televoting") return "televote.vote";
  if (context.key === "entries") return "entry.submit";
  if (context.key === "integrity") return "integrity.report";
  if (context.key === "hosting-media") return "hosting.accept";
  return null;
}

export function resolveAppliedRulesContext(input: {
  explicitContextPath?: string;
  storedAction?: string | null;
  storedContextPath?: string | null;
}): AppliedRulesContextResolution {
  if (input.explicitContextPath !== undefined) {
    return {
      context: actionForAppliedRulesPath(input.explicitContextPath),
      source: "explicit",
    };
  }

  const storedAction = input.storedAction?.trim() || null;
  if (
    storedAction &&
    GOVERNANCE_ACTION_KEYS.includes(storedAction as GovernanceActionKey)
  ) {
    return {
      context: storedAction as GovernanceActionKey,
      source: "session-action",
    };
  }

  const storedPathContext = actionForAppliedRulesPath(input.storedContextPath);
  if (storedPathContext) {
    return { context: storedPathContext, source: "session-path" };
  }

  return { context: null, source: "none" };
}
