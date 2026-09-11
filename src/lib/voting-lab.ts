export type VotingLabAward = {
  countryId: string;
  points: number;
};

export type VotingLabBallot = {
  id: string;
  voterId: string;
  awards: readonly VotingLabAward[];
};

export type VotingLabConfig = {
  maxPerCountry: number | null;
  ballotBudget: number | null;
  minimumCountries: number;
  invalidBallotPolicy: 'reject' | 'cap';
};

export type VotingLabResultRow = {
  countryId: string;
  points: number;
  rank: number;
  voteShare: number;
  ballotsReceived: number;
};

export type VotingLabSimulation = {
  acceptedBallots: number;
  rejectedBallots: string[];
  adjustedBallots: string[];
  totalPoints: number;
  results: VotingLabResultRow[];
  winner: string | null;
  winningMargin: number;
  concentration: number;
  maxSingleBallotWinnerImpact: number;
};

function validateConfig(config: VotingLabConfig) {
  if (config.maxPerCountry != null && (!Number.isFinite(config.maxPerCountry) || config.maxPerCountry < 0)) {
    throw new Error('maxPerCountry must be null or a non-negative number');
  }
  if (config.ballotBudget != null && (!Number.isFinite(config.ballotBudget) || config.ballotBudget < 0)) {
    throw new Error('ballotBudget must be null or a non-negative number');
  }
  if (!Number.isInteger(config.minimumCountries) || config.minimumCountries < 0) {
    throw new Error('minimumCountries must be a non-negative integer');
  }
}

function normalizeBallot(ballot: VotingLabBallot, config: VotingLabConfig) {
  const positive = ballot.awards.filter((award) => Number.isFinite(award.points) && award.points > 0);
  const merged = new Map<string, number>();
  for (const award of positive) merged.set(award.countryId, (merged.get(award.countryId) ?? 0) + award.points);

  const violatesCountryCount = merged.size < config.minimumCountries;
  const violatesMax = config.maxPerCountry != null && [...merged.values()].some((points) => points > config.maxPerCountry!);
  const rawTotal = [...merged.values()].reduce((sum, points) => sum + points, 0);
  const violatesBudget = config.ballotBudget != null && rawTotal > config.ballotBudget;

  if (config.invalidBallotPolicy === 'reject' && (violatesCountryCount || violatesMax || violatesBudget)) {
    return { rejected: true as const, adjusted: false, awards: [] as VotingLabAward[] };
  }

  let adjusted = false;
  let awards = [...merged.entries()].map(([countryId, points]) => ({ countryId, points }));

  if (config.maxPerCountry != null) {
    awards = awards.map((award) => {
      const points = Math.min(award.points, config.maxPerCountry!);
      if (points !== award.points) adjusted = true;
      return { ...award, points };
    });
  }

  if (config.ballotBudget != null) {
    let remaining = config.ballotBudget;
    awards = awards
      .sort((a, b) => b.points - a.points || a.countryId.localeCompare(b.countryId))
      .map((award) => {
        const points = Math.max(0, Math.min(award.points, remaining));
        remaining -= points;
        if (points !== award.points) adjusted = true;
        return { ...award, points };
      })
      .filter((award) => award.points > 0);
  }

  if (awards.length < config.minimumCountries) {
    return { rejected: true as const, adjusted, awards: [] as VotingLabAward[] };
  }

  return { rejected: false as const, adjusted, awards };
}

function rankTotals(totals: Map<string, { points: number; ballotsReceived: number }>): VotingLabResultRow[] {
  const totalPoints = [...totals.values()].reduce((sum, row) => sum + row.points, 0);
  const sorted = [...totals.entries()].sort((a, b) => b[1].points - a[1].points || a[0].localeCompare(b[0]));

  let previousPoints: number | null = null;
  let previousRank = 0;
  return sorted.map(([countryId, data], index) => {
    const rank = previousPoints === data.points ? previousRank : index + 1;
    previousPoints = data.points;
    previousRank = rank;
    return {
      countryId,
      points: data.points,
      rank,
      voteShare: totalPoints > 0 ? data.points / totalPoints : 0,
      ballotsReceived: data.ballotsReceived,
    };
  });
}

function winnerWithoutBallot(
  accepted: readonly { id: string; awards: readonly VotingLabAward[] }[],
  excludedId: string,
) {
  const totals = new Map<string, { points: number; ballotsReceived: number }>();
  for (const ballot of accepted) {
    if (ballot.id === excludedId) continue;
    for (const award of ballot.awards) {
      const current = totals.get(award.countryId) ?? { points: 0, ballotsReceived: 0 };
      totals.set(award.countryId, {
        points: current.points + award.points,
        ballotsReceived: current.ballotsReceived + 1,
      });
    }
  }
  return rankTotals(totals)[0] ?? null;
}

export function simulateVotingSystem(
  ballots: readonly VotingLabBallot[],
  config: VotingLabConfig,
): VotingLabSimulation {
  validateConfig(config);

  const rejectedBallots: string[] = [];
  const adjustedBallots: string[] = [];
  const accepted: Array<{ id: string; awards: VotingLabAward[] }> = [];
  const totals = new Map<string, { points: number; ballotsReceived: number }>();

  for (const ballot of ballots) {
    const normalized = normalizeBallot(ballot, config);
    if (normalized.rejected) {
      rejectedBallots.push(ballot.id);
      continue;
    }
    if (normalized.adjusted) adjustedBallots.push(ballot.id);
    accepted.push({ id: ballot.id, awards: normalized.awards });

    for (const award of normalized.awards) {
      const current = totals.get(award.countryId) ?? { points: 0, ballotsReceived: 0 };
      totals.set(award.countryId, {
        points: current.points + award.points,
        ballotsReceived: current.ballotsReceived + 1,
      });
    }
  }

  const results = rankTotals(totals);
  const totalPoints = results.reduce((sum, row) => sum + row.points, 0);
  const concentration = results.reduce((sum, row) => sum + row.voteShare ** 2, 0);
  const winner = results[0]?.countryId ?? null;
  const winningMargin = results.length > 1 ? results[0].points - results[1].points : results[0]?.points ?? 0;

  let maxSingleBallotWinnerImpact = 0;
  if (winner) {
    const fullWinnerPoints = results[0].points;
    for (const ballot of accepted) {
      const without = winnerWithoutBallot(accepted, ballot.id);
      const winnerAward = ballot.awards.find((award) => award.countryId === winner)?.points ?? 0;
      const changedWinner = without && without.countryId !== winner;
      const impact = changedWinner ? fullWinnerPoints : winnerAward;
      maxSingleBallotWinnerImpact = Math.max(maxSingleBallotWinnerImpact, impact);
    }
  }

  return {
    acceptedBallots: accepted.length,
    rejectedBallots,
    adjustedBallots,
    totalPoints,
    results,
    winner,
    winningMargin,
    concentration,
    maxSingleBallotWinnerImpact,
  };
}

export function compareVotingSystems(
  ballots: readonly VotingLabBallot[],
  systems: Readonly<Record<string, VotingLabConfig>>,
) {
  return Object.fromEntries(
    Object.entries(systems).map(([name, config]) => [name, simulateVotingSystem(ballots, config)]),
  );
}
