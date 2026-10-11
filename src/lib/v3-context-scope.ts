export type V3ContestContext = {
  competitionId: string;
  editionId: string;
  showId?: string | null;
};

export type V3ContextMatch = "exact" | "same_edition" | "same_competition" | "different";

function required(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`V3 contest context requires ${label}.`);
  return normalized;
}

export function normalizeV3ContestContext(context: V3ContestContext): V3ContestContext {
  return {
    competitionId: required(context.competitionId, "competitionId"),
    editionId: required(context.editionId, "editionId"),
    showId: context.showId?.trim() || null,
  };
}

export function v3ContestContextKey(context: V3ContestContext) {
  const normalized = normalizeV3ContestContext(context);
  return [normalized.competitionId, normalized.editionId, normalized.showId ?? "edition"].join(":");
}

export function compareV3ContestContext(a: V3ContestContext, b: V3ContestContext): V3ContextMatch {
  const left = normalizeV3ContestContext(a);
  const right = normalizeV3ContestContext(b);

  if (
    left.competitionId === right.competitionId &&
    left.editionId === right.editionId &&
    (left.showId ?? null) === (right.showId ?? null)
  ) {
    return "exact";
  }
  if (left.competitionId === right.competitionId && left.editionId === right.editionId) {
    return "same_edition";
  }
  if (left.competitionId === right.competitionId) return "same_competition";
  return "different";
}

export type V3ContextSwitchPlan = {
  match: V3ContextMatch;
  preserveCompetitionCache: boolean;
  preserveEditionCache: boolean;
  preserveShowCache: boolean;
  clearPrivateActionState: boolean;
  reloadCanonicalContext: boolean;
};

/**
 * Every action/query can be scoped to an explicit contest context. V3 must not
 * choose an edition by 'highest edition number' or another client-side guess.
 */
export function projectV3ContextSwitch(
  from: V3ContestContext,
  to: V3ContestContext,
): V3ContextSwitchPlan {
  const match = compareV3ContestContext(from, to);

  return {
    match,
    preserveCompetitionCache: match !== "different",
    preserveEditionCache: match === "exact" || match === "same_edition",
    preserveShowCache: match === "exact",
    clearPrivateActionState: match !== "exact",
    reloadCanonicalContext: match !== "exact",
  };
}

export function assertV3ActionContext(
  actionContext: V3ContestContext,
  activeContext: V3ContestContext,
) {
  const match = compareV3ContestContext(actionContext, activeContext);
  if (match !== "exact") {
    throw new Error(
      `V3 action context mismatch (${match}). Resolve the canonical contest context before continuing.`,
    );
  }
}
