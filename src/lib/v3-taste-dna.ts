import {
  buildTasteDna,
  type TasteDnaHistoryBallot,
  type TasteDnaJuryBallot,
  type TasteDnaProfile,
  type TasteDnaResultEntry,
} from "./taste-dna";

export type V3TasteDnaSavedBallot = {
  showId: string;
  ranking: readonly string[];
};

export type V3TasteDnaAnalysis = {
  ranking: string[];
  history: TasteDnaHistoryBallot[];
  profile: TasteDnaProfile | null;
};

/**
 * Reconcile a previously saved ballot against the currently published field.
 *
 * Historical ballots are evidence of user preference, not authority over the
 * current show universe. Removed/unpublished IDs are discarded, duplicates are
 * collapsed, and newly published IDs are appended in canonical published
 * order. This keeps the draft deterministic without inventing missing entries.
 */
export function reconcileTasteRanking(
  savedRanking: readonly string[] | null | undefined,
  publishedRanking: readonly string[],
): string[] {
  const allowed = new Set(publishedRanking);
  const seen = new Set<string>();
  const reconciled: string[] = [];

  for (const id of savedRanking ?? []) {
    if (!allowed.has(id) || seen.has(id)) continue;
    seen.add(id);
    reconciled.push(id);
  }

  for (const id of publishedRanking) {
    if (seen.has(id)) continue;
    seen.add(id);
    reconciled.push(id);
  }

  return reconciled;
}

/**
 * Keep longitudinal Taste DNA history private and show-scoped. The active show
 * is represented by the current working ranking, so including its persisted
 * copy again would double-weight it in recurring-favourite analysis.
 */
export function projectTasteHistory(
  ballots: readonly V3TasteDnaSavedBallot[],
  currentShowId: string,
): TasteDnaHistoryBallot[] {
  return ballots
    .filter((ballot) => ballot.showId !== currentShowId)
    .map((ballot) => ({ showId: ballot.showId, ranking: [...ballot.ranking] }));
}

export function buildV3TasteDnaAnalysis({
  currentShowId,
  ranking,
  results,
  juryBallots,
  savedBallots,
  nameForId,
}: {
  currentShowId: string;
  ranking: readonly string[];
  results: TasteDnaResultEntry[];
  juryBallots: TasteDnaJuryBallot[];
  savedBallots: readonly V3TasteDnaSavedBallot[];
  nameForId: (id: string) => string;
}): V3TasteDnaAnalysis {
  const publishedRanking = results
    .slice()
    .sort((a, b) => {
      const rankA = a.officialRank ?? Number.MAX_SAFE_INTEGER;
      const rankB = b.officialRank ?? Number.MAX_SAFE_INTEGER;
      return rankA - rankB || b.totalPoints - a.totalPoints || a.id.localeCompare(b.id);
    })
    .map((entry) => entry.id);

  const reconciledRanking = reconcileTasteRanking(ranking, publishedRanking);
  const history = projectTasteHistory(savedBallots, currentShowId);

  return {
    ranking: reconciledRanking,
    history,
    profile: buildTasteDna({
      ranking: reconciledRanking,
      results,
      juryBallots,
      history,
      nameForId,
    }),
  };
}
