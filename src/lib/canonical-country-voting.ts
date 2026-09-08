import type { JuryVote, ResultRow } from "./data";

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function voteGroupKey(vote: JuryVote) {
  return vote.show_id ?? `edition:${vote.edition_id}`;
}

function resultMatchesVoteGroup(result: ResultRow, vote: JuryVote) {
  return vote.show_id ? result.show_id === vote.show_id : result.edition_id === vote.edition_id;
}

/**
 * Country-to-country jury metrics with explicit zero-point opportunities.
 * A missing award to an eligible country/voter is a real zero for averages,
 * harshest-recipient and never-awarded/never-voted-for statistics.
 */
export function canonicalCountryVotingMetrics(
  countryId: string,
  options: { jury: JuryVote[]; results: ResultRow[] },
) {
  const jury = options.jury.filter(
    (vote): vote is JuryVote & { voter_country_id: string } => Boolean(vote.voter_country_id),
  );
  const given = jury.filter((vote) => vote.voter_country_id === countryId);
  const received = jury.filter((vote) => vote.receiving_country_id === countryId);

  const givenTotals = new Map<string, number>();
  for (const vote of given) {
    if (vote.receiving_country_id === countryId) continue;
    givenTotals.set(
      vote.receiving_country_id,
      (givenTotals.get(vote.receiving_country_id) ?? 0) + vote.points,
    );
  }

  const receivedTotals = new Map<string, number>();
  for (const vote of received) {
    if (vote.voter_country_id === countryId) continue;
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
    const eligibleCountryIds = new Set(
      options.results
        .filter((result) => resultMatchesVoteGroup(result, first))
        .map((result) => result.country_id)
        .filter(Boolean),
    );
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
    if (vote.receiving_country_id === countryId) continue;
    givenByEdition.set(vote.edition_id, (givenByEdition.get(vote.edition_id) ?? 0) + vote.points);
  }

  const receivedByEdition = new Map<string, number>();
  for (const vote of received) {
    if (vote.voter_country_id === countryId) continue;
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
    neverAwarded: [...recipientOpportunities].filter((id) => !givenTotals.has(id)).sort(),
    neverVotedForThem: [...giverOpportunities].filter((id) => !receivedTotals.has(id)).sort(),
  };
}
