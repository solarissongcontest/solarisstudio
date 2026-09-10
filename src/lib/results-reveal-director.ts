export type RevealBaseScore = {
  countryId: string;
  points: number;
};

export type RevealAward = {
  countryId: string;
  points: number;
};

export type RevealStep = {
  step: number;
  countryId: string;
  revealedPoints: number;
  leaderCountryId: string | null;
  leaderPoints: number;
  winnerCertain: boolean;
  mathematicallyCertainCountryId: string | null;
};

export type RevealSimulation = {
  steps: RevealStep[];
  finalWinner: string | null;
  certaintyStep: number | null;
  suspenseRatio: number;
};

function totalsMap(baseScores: readonly RevealBaseScore[]) {
  const totals = new Map<string, number>();
  for (const row of baseScores) {
    if (!Number.isFinite(row.points)) throw new Error(`Invalid base score for ${row.countryId}`);
    totals.set(row.countryId, (totals.get(row.countryId) ?? 0) + row.points);
  }
  return totals;
}

function leader(totals: Map<string, number>) {
  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return sorted[0] ?? null;
}

export function simulateResultsReveal(
  baseScores: readonly RevealBaseScore[],
  revealOrder: readonly RevealAward[],
): RevealSimulation {
  const current = totalsMap(baseScores);
  const knownAwards = new Map<string, number>();
  for (const award of revealOrder) {
    if (!Number.isFinite(award.points) || award.points < 0) throw new Error(`Invalid reveal award for ${award.countryId}`);
    if (knownAwards.has(award.countryId)) throw new Error(`Country appears twice in reveal order: ${award.countryId}`);
    knownAwards.set(award.countryId, award.points);
    if (!current.has(award.countryId)) current.set(award.countryId, 0);
  }

  const unrevealed = new Set(revealOrder.map((award) => award.countryId));
  const steps: RevealStep[] = [];
  let certaintyStep: number | null = null;

  revealOrder.forEach((award, index) => {
    current.set(award.countryId, (current.get(award.countryId) ?? 0) + award.points);
    unrevealed.delete(award.countryId);

    const currentLeader = leader(current);
    let certainCountryId: string | null = null;

    if (currentLeader) {
      const [leaderCountryId, leaderPoints] = currentLeader;
      let bestPossibleChallenger = Number.NEGATIVE_INFINITY;

      for (const [countryId, points] of current) {
        if (countryId === leaderCountryId) continue;
        const possible = points + (unrevealed.has(countryId) ? knownAwards.get(countryId) ?? 0 : 0);
        bestPossibleChallenger = Math.max(bestPossibleChallenger, possible);
      }

      if (leaderPoints > bestPossibleChallenger) certainCountryId = leaderCountryId;
    }

    const winnerCertain = certainCountryId !== null;
    if (winnerCertain && certaintyStep === null) certaintyStep = index + 1;

    steps.push({
      step: index + 1,
      countryId: award.countryId,
      revealedPoints: award.points,
      leaderCountryId: currentLeader?.[0] ?? null,
      leaderPoints: currentLeader?.[1] ?? 0,
      winnerCertain,
      mathematicallyCertainCountryId: certainCountryId,
    });
  });

  const finalWinner = leader(current)?.[0] ?? null;
  const suspenseRatio = revealOrder.length === 0
    ? 1
    : certaintyStep === null
      ? 1
      : Math.max(0, Math.min(1, certaintyStep / revealOrder.length));

  return {
    steps,
    finalWinner,
    certaintyStep,
    suspenseRatio,
  };
}

export function compareRevealOrders(
  baseScores: readonly RevealBaseScore[],
  orders: Readonly<Record<string, readonly RevealAward[]>>,
) {
  return Object.fromEntries(
    Object.entries(orders).map(([name, order]) => [name, simulateResultsReveal(baseScores, order)]),
  );
}
