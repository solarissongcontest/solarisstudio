import type { Edition, JuryVote, Participant, ResultRow, Show, Televote } from "./data";

import { computeCountryStats } from "./stats";

export type FormBand = "elite" | "strong" | "steady" | "building" | "unrated";

export type FormTimelinePoint = {
  editionId: string;
  editionNumber: number | null;
  label: string;
  rank: number;
  fieldSize: number;
  percentile: number;
};

export type CountryForm = {
  countryId: string;
  formIndex: number | null;
  formBand: FormBand;
  consistency: number | null;
  momentum: number | null;
  votingReach: number | null;
  supportDependence: number | null;
  juryTelevoteLean: number | null;
  resilience: number | null;
  peakEra: string | null;
  droughtEra: string | null;
  sampleSize: number;
  methodology: string;
  timeline: FormTimelinePoint[];
};

type CountryFormOptions = {
  editions: Edition[];
  shows: Show[];
  participants: Participant[];
  results: ResultRow[];
  jury: JuryVote[];
  televote: Televote[];
};

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

const average = (values: number[]) =>
  values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;

const weightedAverage = (values: Array<{ value: number; weight: number }>) => {
  const weight = values.reduce((total, item) => total + item.weight, 0);
  return weight
    ? values.reduce((total, item) => total + item.value * item.weight, 0) / weight
    : null;
};

function scoreBand(score: number | null): FormBand {
  if (score == null) return "unrated";
  if (score >= 80) return "elite";
  if (score >= 65) return "strong";
  if (score >= 45) return "steady";
  return "building";
}

function channelRanks(rows: ResultRow[], key: "jury_points" | "televote_points") {
  const sorted = [...rows].sort((a, b) => b[key] - a[key]);
  const ranks = new Map<string, number>();

  sorted.forEach((row, index) => {
    const previous = sorted[index - 1];
    ranks.set(
      row.country_id,
      previous && previous[key] === row[key]
        ? (ranks.get(previous.country_id) ?? index + 1)
        : index + 1,
    );
  });

  return ranks;
}

function percentile(rank: number, fieldSize: number) {
  if (fieldSize <= 1) return 100;
  return clamp(((fieldSize - rank) / (fieldSize - 1)) * 100);
}

function eraLabel(points: FormTimelinePoint[]) {
  if (!points.length) return null;
  const first = points[0];
  const last = points[points.length - 1];
  return first.editionNumber === last.editionNumber ? first.label : `${first.label}–${last.label}`;
}

function bestAndWorstEra(timeline: FormTimelinePoint[]) {
  if (!timeline.length) return { peakEra: null, droughtEra: null };

  const windowSize = Math.min(3, timeline.length);
  const windows = timeline.slice(windowSize - 1).map((_, index) => {
    const rows = timeline.slice(index, index + windowSize);
    return {
      rows,
      average: average(rows.map((row) => row.percentile)) ?? 0,
    };
  });

  const peak = [...windows].sort((a, b) => b.average - a.average)[0];
  const drought = [...windows].sort((a, b) => a.average - b.average)[0];

  return {
    peakEra: eraLabel(peak?.rows ?? []),
    droughtEra: eraLabel(drought?.rows ?? []),
  };
}

/**
 * A transparent form model. It measures recent competitive results, not song
 * quality. Every placement is converted to a field-size percentile before the
 * components are combined, so a fifth place in a ten-entry show is not treated
 * like a fifth place in a thirty-entry show.
 */
export function computeCountryForm(countryId: string, options: CountryFormOptions): CountryForm {
  const stats = computeCountryStats(countryId, options);
  const showById = new Map(options.shows.map((show) => [show.id, show]));

  const timeline = stats.timeline
    .filter((point): point is typeof point & { rank: number } => point.rank != null)
    .map((point) => {
      const fieldSize = new Set(
        options.results
          .filter((result) => result.edition_id === point.editionId)
          .map((result) => result.country_id),
      ).size;

      return {
        editionId: point.editionId,
        editionNumber: point.editionNumber,
        label: point.label,
        rank: point.rank,
        fieldSize: Math.max(fieldSize, point.rank),
        percentile: percentile(point.rank, Math.max(fieldSize, point.rank)),
      } satisfies FormTimelinePoint;
    });

  const recencyWeighted = timeline.map((point, index) => ({
    value: point.percentile,
    weight: 0.78 ** (timeline.length - index - 1),
  }));
  const formIndex = weightedAverage(recencyWeighted);

  const mean = average(timeline.map((point) => point.percentile));
  const standardDeviation =
    mean == null
      ? null
      : Math.sqrt(
          timeline.reduce((total, point) => total + (point.percentile - mean) ** 2, 0) /
            timeline.length,
        );
  const consistency = standardDeviation == null ? null : clamp(100 - standardDeviation * 2);

  const recentWindow = Math.min(3, Math.max(1, Math.floor(timeline.length / 2)));
  const recent = timeline.slice(-recentWindow).map((point) => point.percentile);
  const earlier = timeline.slice(0, -recentWindow).map((point) => point.percentile);
  const recentAverage = average(recent);
  const baseline = average(earlier.length ? earlier : timeline.map((p) => p.percentile));
  const momentum =
    recentAverage == null || baseline == null ? null : clamp(recentAverage - baseline, -100, 100);

  const resultKeys = new Set(
    options.results
      .filter((result) => result.country_id === countryId)
      .map((result) => result.show_id ?? `edition:${result.edition_id}`),
  );
  let voterOpportunities = 0;
  let votersReached = 0;

  for (const key of resultKeys) {
    const ballots = options.jury.filter((vote) =>
      key.startsWith("edition:")
        ? vote.edition_id === key.slice("edition:".length)
        : vote.show_id === key,
    );
    const voters = new Set(ballots.map((vote) => vote.voter_country_id).filter(Boolean));
    const supporters = new Set(
      ballots
        .filter((vote) => vote.receiving_country_id === countryId && vote.points > 0)
        .map((vote) => vote.voter_country_id)
        .filter(Boolean),
    );
    voterOpportunities += voters.size;
    votersReached += supporters.size;
  }

  const votingReach = voterOpportunities ? clamp((votersReached / voterOpportunities) * 100) : null;

  const supporterTotals = new Map<string, number>();
  options.jury
    .filter((vote) => vote.receiving_country_id === countryId)
    .forEach((vote) => {
      supporterTotals.set(
        vote.voter_country_id,
        (supporterTotals.get(vote.voter_country_id) ?? 0) + vote.points,
      );
    });
  const supportValues = [...supporterTotals.values()].sort((a, b) => b - a);
  const allSupport = supportValues.reduce((total, value) => total + value, 0);
  const supportDependence = allSupport
    ? clamp(
        (supportValues.slice(0, 3).reduce((total, value) => total + value, 0) / allSupport) * 100,
      )
    : null;

  const channelLeans = options.results
    .filter((result) => result.country_id === countryId && result.show_id)
    .map((result) => {
      const rows = options.results.filter((row) => row.show_id === result.show_id);
      if (rows.length < 2) return null;
      const juryRank = channelRanks(rows, "jury_points").get(countryId);
      const televoteRank = channelRanks(rows, "televote_points").get(countryId);
      if (juryRank == null || televoteRank == null) return null;
      return percentile(juryRank, rows.length) - percentile(televoteRank, rows.length);
    })
    .filter((value): value is number => value != null);
  const juryTelevoteLean = average(channelLeans);

  const recoveryScores: number[] = [];
  timeline.forEach((point, index) => {
    if (point.percentile > 20 || !timeline[index + 1]) return;
    recoveryScores.push(timeline[index + 1].percentile);
  });
  const resilience = average(recoveryScores);
  const eras = bestAndWorstEra(timeline);

  // Touch the show map so editions whose archived result has a deleted show do
  // not silently appear as stronger evidence than a real published show.
  const ratedSample = stats.timeline.filter(
    (point) => !point.showId || showById.has(point.showId),
  ).length;

  return {
    countryId,
    formIndex,
    formBand: scoreBand(formIndex),
    consistency,
    momentum,
    votingReach,
    supportDependence,
    juryTelevoteLean,
    resilience,
    peakEra: eras.peakEra,
    droughtEra: eras.droughtEra,
    sampleSize: Math.min(ratedSample, timeline.length),
    methodology:
      "Form is a recency-weighted average of field-normalized placements. It describes competitive results, not entry quality.",
    timeline,
  };
}
