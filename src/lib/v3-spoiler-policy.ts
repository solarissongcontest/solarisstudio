export type V3SpoilerPreference = "show-immediately" | "hide-until-reveal";

export type V3SpoilerSurface =
  | "home"
  | "results"
  | "edition"
  | "notification"
  | "push"
  | "search"
  | "following";

export type V3SpoilerContext = {
  preference: V3SpoilerPreference;
  resultsPublished: boolean;
  explicitlyRevealed: boolean;
  surface: V3SpoilerSurface;
};

export type V3SpoilerDecision = {
  canRevealResult: boolean;
  canMentionWinner: boolean;
  canShowRanks: boolean;
  canShowPoints: boolean;
  resultAvailable: boolean;
  protected: boolean;
  reason: "not-published" | "preference-allows" | "revealed" | "protected";
};

/**
 * One disclosure contract for every result-bearing V3 surface.
 *
 * Individual screens, pushes and search snippets must not invent their own
 * spoiler rules. If spoiler protection is enabled, publication means only that
 * a result is available until the user explicitly reveals it.
 */
export function resolveV3SpoilerDecision(context: V3SpoilerContext): V3SpoilerDecision {
  if (!context.resultsPublished) {
    return {
      canRevealResult: false,
      canMentionWinner: false,
      canShowRanks: false,
      canShowPoints: false,
      resultAvailable: false,
      protected: false,
      reason: "not-published",
    };
  }

  if (context.preference === "show-immediately") {
    return {
      canRevealResult: true,
      canMentionWinner: true,
      canShowRanks: true,
      canShowPoints: true,
      resultAvailable: true,
      protected: false,
      reason: "preference-allows",
    };
  }

  if (context.explicitlyRevealed) {
    return {
      canRevealResult: true,
      canMentionWinner: true,
      canShowRanks: true,
      canShowPoints: true,
      resultAvailable: true,
      protected: false,
      reason: "revealed",
    };
  }

  return {
    canRevealResult: true,
    canMentionWinner: false,
    canShowRanks: false,
    canShowPoints: false,
    resultAvailable: true,
    protected: true,
    reason: "protected",
  };
}

export type V3PublishedResultSummary = {
  editionLabel: string;
  winnerName?: string | null;
  winnerPoints?: number | null;
};

export type V3SpoilerSafeResultCopy = {
  title: string;
  description: string;
};

export function v3SpoilerSafeResultCopy(
  result: V3PublishedResultSummary,
  decision: V3SpoilerDecision,
): V3SpoilerSafeResultCopy {
  if (!decision.resultAvailable) {
    return {
      title: `${result.editionLabel} results are not available yet`,
      description: "Official results have not been published.",
    };
  }

  if (!decision.canMentionWinner) {
    return {
      title: `${result.editionLabel} results are available`,
      description: "Result spoilers are hidden until you choose to reveal them.",
    };
  }

  if (result.winnerName) {
    return {
      title: `${result.winnerName} wins ${result.editionLabel}`,
      description:
        result.winnerPoints != null
          ? `${result.winnerName} finished first with ${result.winnerPoints} points.`
          : `${result.winnerName} finished first.`,
    };
  }

  return {
    title: `${result.editionLabel} results are available`,
    description: "Official results have been published.",
  };
}

/**
 * Notification/search callers can use this helper to prove that sensitive
 * winner/rank/points fields were stripped before composing user-visible copy.
 */
export function v3SpoilerSafeResultMetadata<T extends Record<string, unknown>>(
  metadata: T,
  decision: V3SpoilerDecision,
): T {
  if (!decision.protected) return metadata;

  const safe = { ...metadata } as Record<string, unknown>;
  for (const key of [
    "winner",
    "winnerName",
    "winnerCountry",
    "winnerPoints",
    "rank",
    "finalRank",
    "points",
    "juryPoints",
    "televotePoints",
  ]) {
    if (key in safe) delete safe[key];
  }
  return safe as T;
}
