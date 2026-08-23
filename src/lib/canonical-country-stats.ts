import type { Edition, JuryVote, Participant, ResultRow, Show, Televote } from "./data";
import { canonicalEditionResults } from "./canonical-results";
import { buildPublicCountryArchive } from "./public-country-archive";
import {
  qualificationCountsAsQualified,
  resolveCountryEditionQualification,
} from "./qualification";
import { computeCountryStats, type CountryStats } from "./stats";

type Options = {
  editions: Edition[];
  shows: Show[];
  participants: Participant[];
  results: ResultRow[];
  jury: JuryVote[];
  televote: Televote[];
};

type EditionFlag = { editionNumber: number; value: boolean };

function isFinal(kind?: string | null) {
  return kind === "grand-final" || kind === "final";
}

function isSemi(kind?: string | null) {
  return kind === "semi-final" || kind === "semi";
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function longestEditionStreak(points: EditionFlag[]) {
  const ordered = [...points].sort((a, b) => a.editionNumber - b.editionNumber);
  let best = 0;
  let current = 0;
  let previous: number | null = null;

  for (const point of ordered) {
    if (point.value) {
      current = previous != null && point.editionNumber === previous + 1 ? current + 1 : 1;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
    previous = point.editionNumber;
  }

  return best;
}

function currentEditionStreak(points: EditionFlag[]) {
  const ordered = [...points].sort((a, b) => a.editionNumber - b.editionNumber);
  if (!ordered.length || !ordered[ordered.length - 1]?.value) return 0;

  let current = 1;
  let expected = ordered[ordered.length - 1]!.editionNumber - 1;
  for (let index = ordered.length - 2; index >= 0; index -= 1) {
    const point = ordered[index]!;
    if (!point.value || point.editionNumber !== expected) break;
    current += 1;
    expected -= 1;
  }
  return current;
}

function voteGroupKey(vote: JuryVote) {
  return vote.show_id ?? `edition:${vote.edition_id}`;
}

function resultMatchesVoteGroup(result: ResultRow, vote: JuryVote) {
  return vote.show_id
    ? result.show_id === vote.show_id
    : result.edition_id === vote.edition_id;
}

function votingMetrics(countryId: string, options: Options) {
  const jury = options.jury.filter(
    (vote): vote is JuryVote & { voter_country_id: string } => Boolean(vote.voter_country_id),
  );
  const given = jury.filter((vote) => vote.voter_country_id === countryId);
  const received = jury.filter((vote) => vote.receiving_country_id === countryId);

  const givenTotals = new Map<string, number>();
  for (const vote of given) {
    givenTotals.set(
      vote.receiving_country_id,
      (givenTotals.get(vote.receiving_country_id) ?? 0) + vote.points,
    );
  }

  const receivedTotals = new Map<string, number>();
  for (const vote of received) {
    receivedTotals.set(
      vote.voter_country_id,
      (receivedTotals.get(vote.voter_country_id) ?? 0) + vote.points,
    );
  }

  const groups = new Map<string, Array<JuryVote & { voter_country_id: string }>>();
  for (const vote of jury) {
    const key = voteGroupKey(vote);
    groups.set(key, [...(groups.get(key) ?? []), vote]);
  }

  const receivedOpportunityEditions = new Set<string>();
  const recipientOpportunities = new Set<string>();
  const giverOpportunities = new Set<string>();
  const voterOpportunityTotals: number[] = [];

  for (const votes of groups.values()) {
    const first = votes[0];
    if (!first) continue;
    const eligibleResults = options.results.filter((result) => resultMatchesVoteGroup(result, first));
    const eligibleCountryIds = new Set(eligibleResults.map((result) => result.country_id));
    const countryWasEligible = eligibleCountryIds.has(countryId);

    if (votes.some((vote) => vote.voter_country_id === countryId)) {
      eligibleCountryIds.forEach((id) => {
        if (id !== countryId) recipientOpportunities.add(id);
      });
    }

    if (countryWasEligible) {
      receivedOpportunityEditions.add(first.edition_id);
      const voterIds = new Set(votes.map((vote) => vote.voter_country_id));
      voterIds.forEach((voterId) => {
        if (voterId === countryId) return;
        giverOpportunities.add(voterId);
        const points = votes
          .filter(
            (vote) =>
              vote.voter_country_id === voterId && vote.receiving_country_id === countryId,
          )
          .reduce((sum, vote) => sum + vote.points, 0);
        voterOpportunityTotals.push(points);
      });
    }
  }

  const givenByEdition = new Map<string, number>();
  for (const vote of given) {
    givenByEdition.set(vote.edition_id, (givenByEdition.get(vote.edition_id) ?? 0) + vote.points);
  }

  const receivedByEdition = new Map<string, number>();
  for (const vote of received) {
    receivedByEdition.set(
      vote.edition_id,
      (receivedByEdition.get(vote.edition_id) ?? 0) + vote.points,
    );
  }

  const givenOpportunityEditions = new Set(given.map((vote) => vote.edition_id));
  const avgGivenPerContest = average(
    [...givenOpportunityEditions].map((editionId) => givenByEdition.get(editionId) ?? 0),
  );
  const avgReceivedPerContest = average(
    [...receivedOpportunityEditions].map((editionId) => receivedByEdition.get(editionId) ?? 0),
  );

  const sortedGiven = [...recipientOpportunities]
    .map((id) => [id, givenTotals.get(id) ?? 0] as const)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const sortedGivenAscending = [...sortedGiven].sort(
    (a, b) => a[1] - b[1] || a[0].localeCompare(b[0]),
  );

  return {
    avgGivenPerContest,
    avgReceivedPerContest,
    avgPointsPerVoter: average(voterOpportunityTotals),
    favouriteRecipient: sortedGiven[0]
      ? { countryId: sortedGiven[0][0], points: sortedGiven[0][1] }
      : null,
    mostGenerousTowards: sortedGiven[0]
      ? { countryId: sortedGiven[0][0], points: sortedGiven[0][1] }
      : null,
    harshestTowards: sortedGivenAscending[0]
      ? { countryId: sortedGivenAscending[0][0], points: sortedGivenAscending[0][1] }
      : null,
    distinctCountriesAwarded: givenTotals.size,
    neverAwarded: [...recipientOpportunities]
      .filter((id) => !givenTotals.has(id))
      .sort(),
    neverVotedForThem: [...giverOpportunities]
      .filter((id) => !receivedTotals.has(id))
      .sort(),
  };
}

/**
 * Public country statistics must treat one delegation in one edition as one
 * participation. Show-level participant/result rows remain useful operational
 * data, but may never inflate public history, percentages or streaks.
 *
 * The function also applies the public publication gates itself. That matters
 * because several analytics/directory surfaces call it with the raw live query
 * result. Draft placeholder ranks must never become a public "winner" simply
 * because an organizer has already prepared a running order or result row.
 */
export function computeCanonicalCountryStats(countryId: string, options: Options): CountryStats {
  const publicOptions = buildPublicCountryArchive(options);
  const base = computeCountryStats(countryId, publicOptions);
  const showById = new Map(publicOptions.shows.map((show) => [show.id, show]));
  const editionNumber = new Map(publicOptions.editions.map((edition) => [edition.id, edition.edition_number]));

  const participants = publicOptions.participants.filter((participant) => participant.country_id === countryId);
  const results = publicOptions.results.filter((result) => result.country_id === countryId);
  const canonicalResults = canonicalEditionResults(publicOptions.results, publicOptions.shows)
    .filter((result) => result.country_id === countryId);

  const participationEditionIds = new Set<string>();
  participants.forEach((participant) => participationEditionIds.add(participant.edition_id));
  results.forEach((result) => participationEditionIds.add(result.edition_id));

  const finalEditionIds = new Set<string>();
  participants.forEach((participant) => {
    if (isFinal(showById.get(participant.show_id ?? "")?.kind)) {
      finalEditionIds.add(participant.edition_id);
    }
  });
  results.forEach((result) => {
    if (isFinal(showById.get(result.show_id ?? "")?.kind)) {
      finalEditionIds.add(result.edition_id);
    }
  });

  const semiByEdition = new Map<string, Participant[]>();
  participants.forEach((participant) => {
    if (!isSemi(showById.get(participant.show_id ?? "")?.kind)) return;
    semiByEdition.set(participant.edition_id, [
      ...(semiByEdition.get(participant.edition_id) ?? []),
      participant,
    ]);
  });

  // Qualification history is an edition outcome, not merely the semi-final
  // top-N boolean. AQ and Wildcard both reached the final and therefore count
  // as successful qualifications for totals, rates and streaks.
  const qualificationOutcomes = [...participationEditionIds]
    .map((editionId) => {
      const number = editionNumber.get(editionId);
      if (number == null) return null;
      const status = resolveCountryEditionQualification(countryId, editionId, publicOptions);
      if (status == null) return null;
      return {
        editionNumber: number,
        value: qualificationCountsAsQualified(status),
      };
    })
    .filter((row): row is EditionFlag => row != null);

  const knownQualifications = qualificationOutcomes;
  const qualifications = knownQualifications.filter((row) => row.value).length;

  const qualificationRanks = [...participationEditionIds]
    .map((editionId) => {
      const status = resolveCountryEditionQualification(countryId, editionId, publicOptions);
      if (status !== "q" && status !== "wildcard") return null;
      const semiRanks = results
        .filter(
          (result) =>
            result.edition_id === editionId &&
            isSemi(showById.get(result.show_id ?? "")?.kind) &&
            result.final_rank != null,
        )
        .map((result) => result.final_rank as number);
      return semiRanks.length ? Math.min(...semiRanks) : null;
    })
    .filter((rank): rank is number => rank != null);

  const placementFlags = base.timeline
    .filter((point): point is typeof point & { editionNumber: number } => point.editionNumber != null)
    .map((point) => ({
      editionNumber: point.editionNumber,
      top10: point.rank != null && point.rank <= 10,
      podium: point.rank != null && point.rank <= 3,
    }));

  const editionScores = canonicalResults.map((result) => result.total_points);
  const averageEditionScore = average(editionScores);

  const participations = participationEditionIds.size;
  const finals = finalEditionIds.size;
  const semis = semiByEdition.size;
  const voting = votingMetrics(countryId, publicOptions);

  return {
    ...base,
    participations,
    finals,
    semis,
    qualifications,
    qualificationPct: knownQualifications.length
      ? (qualifications / knownQualifications.length) * 100
      : null,
    grandFinalAppearancePct: participations ? (finals / participations) * 100 : null,
    nilPointers: editionScores.filter((score) => score === 0).length,
    avgPointsPerParticipation: averageEditionScore,
    avgPointsPerVoter: voting.avgPointsPerVoter,
    avgReceivedPerContest: voting.avgReceivedPerContest,
    avgGivenPerContest: voting.avgGivenPerContest,
    avgQualificationRank: average(qualificationRanks),
    highestScore: editionScores.length ? Math.max(...editionScores) : null,
    lowestScore: editionScores.length ? Math.min(...editionScores) : null,
    favouriteRecipient: voting.favouriteRecipient,
    mostGenerousTowards: voting.mostGenerousTowards,
    harshestTowards: voting.harshestTowards,
    distinctCountriesAwarded: voting.distinctCountriesAwarded,
    neverAwarded: voting.neverAwarded,
    neverVotedForThem: voting.neverVotedForThem,
    neverVotedFor: voting.neverVotedForThem,
    bestPlacementStreak: longestEditionStreak(
      placementFlags.map((point) => ({ editionNumber: point.editionNumber, value: point.top10 })),
    ),
    worstPlacementStreak: longestEditionStreak(
      knownQualifications.map((point) => ({ ...point, value: !point.value })),
    ),
    consecutiveQualifications: currentEditionStreak(knownQualifications),
    consecutiveTop10: currentEditionStreak(
      placementFlags.map((point) => ({ editionNumber: point.editionNumber, value: point.top10 })),
    ),
    consecutivePodiums: currentEditionStreak(
      placementFlags.map((point) => ({ editionNumber: point.editionNumber, value: point.podium })),
    ),
  };
}
