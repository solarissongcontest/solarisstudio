export type VotingDnaAggregate = {
  sample: {
    detailedEditions: number;
    givenPoints: number;
    receivedPoints: number;
    resultEditions: number;
  };
  topGiven: Array<{ countryId: string; points: number; ballots: number }>;
  topReceived: Array<{ countryId: string; points: number; ballots: number }>;
  results: Array<{
    editionId: string;
    showId: string;
    finalRank: number | null;
    juryPoints: number;
    televotePoints: number;
    totalPoints: number;
  }>;
};

/**
 * Version the arithmetic that this client adds on top of the publication-safe
 * server aggregate. Bump this when the presentation formula changes.
 */
export const VOTING_DNA_PRESENTATION_FORMULA_VERSION = "v1" as const;

export type VotingDnaAvailability = {
  hasAnyPublishedData: boolean;
  hasDetailedVotingSample: boolean;
  hasResultSample: boolean;
  limitedDetailedSample: boolean;
  limitedResultSample: boolean;
};

type VotingDnaAvailabilityInput = {
  sample: {
    detailedEditions: number;
    resultEditions: number;
  };
  topGiven: readonly unknown[];
  topReceived: readonly unknown[];
  results: readonly unknown[];
};

export function getVotingDnaAvailability(
  aggregate: VotingDnaAvailabilityInput,
): VotingDnaAvailability {
  const hasDetailedVotingSample =
    aggregate.sample.detailedEditions > 0 &&
    (aggregate.topGiven.length > 0 || aggregate.topReceived.length > 0);
  const hasResultSample =
    aggregate.sample.resultEditions > 0 && aggregate.results.length > 0;

  return {
    hasAnyPublishedData: hasDetailedVotingSample || hasResultSample,
    hasDetailedVotingSample,
    hasResultSample,
    limitedDetailedSample:
      hasDetailedVotingSample && aggregate.sample.detailedEditions === 1,
    limitedResultSample:
      hasResultSample && aggregate.sample.resultEditions === 1,
  };
}

export function averagePublishedTotals(values: readonly number[]) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}
