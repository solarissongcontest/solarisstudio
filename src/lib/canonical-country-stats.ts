import type { Edition, JuryVote, Participant, ResultRow, Show, Televote } from "./data";
import { buildEditionProgressionPlacements, isFinalShow, isSemiShow } from "./edition-progression";
import { buildPublicCountryArchive } from "./public-country-archive";
import {
  qualificationCountsAsQualified,
  resolveCountryEditionQualification,
} from "./qualification";
import { computeCountryStats, type CountryStats, type CountryTimelinePoint } from "./stats";
import { isTopScore, makeTopScoreResolver } from "./voting";

type Options = {
  editions: Edition[];
  shows: Show[];
  participants: Participant[];
  results: ResultRow[];
  jury: JuryVote[];
  televote: Televote[];
};

type EditionFlag = { editionNumber: number; value: boolean };

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

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function buildRollingFive(timeline: CountryTimelinePoint[]): CountryStats["rolling5"] {
  const ranked = timeline.filter((point): point is CountryTimelinePoint & { rank: number } => point.rank != null);
  return ranked.map((point, index) => {
    const window = ranked.slice(Math.max(0, index - 4), index + 1);
    return {
      editionId: point.editionId,
      editionNumber: point.editionNumber,
      avgPlacement: average(window.map((entry) => entry.rank)),
    };
  });
}

function placementSwings(timeline: CountryTimelinePoint[]) {
  const ranked = timeline.filter((point): point is CountryTimelinePoint & { rank: number } => point.rank != null);
  let biggestImprovement: CountryStats["biggestImprovement"] = null;
  let biggestDecline: CountryStats["biggestDecline"] = null;

  for (let index = 1; index < ranked.length; index += 1) {
    const previous = ranked[index - 1]!;
    const current = ranked[index]!;
    const delta = previous.rank - current.rank;

    if (delta > 0 && (biggestImprovement == null || delta > biggestImprovement.delta)) {
      biggestImprovement = {
        fromEdition: previous.editionNumber,
        toEdition: current.editionNumber,
        delta,
      };
    }
    if (delta < 0 && (biggestDecline == null || delta < biggestDecline.delta)) {
      biggestDecline = {
        fromEdition: previous.editionNumber,
        toEdition: current.editionNumber,
        delta,
      };
    }
  }

  return { biggestImprovement, biggestDecline };
}

/**
 * Public country statistics must treat one delegation in one edition as one
 * participation. Show-level participant/result rows remain useful operational
 * data, but may never inflate public history, percentages or streaks.
 *
 * Multi-stage editions use one progression ladder for the canonical placement:
 * Grand Final first, then semi-final NQs, then heat NQs. Second Chance only
 * changes who reaches the semi-final and never creates an invented ranking tier.
 */
export function computeCanonicalCountryStats(countryId: string, options: Options): CountryStats {
  const publicOptions = buildPublicCountryArchive(options);
  const base = computeCountryStats(countryId, publicOptions);
  const showById = new Map(publicOptions.shows.map((show) => [show.id, show]));
  const editionNumber = new Map(publicOptions.editions.map((edition) => [edition.id, edition.edition_number]));

  const participants = publicOptions.participants.filter((participant) => participant.country_id === countryId);
  const results = publicOptions.results.filter((result) => result.country_id === countryId);

  const participationEditionIds = new Set<string>();
  participants.forEach((participant) => participationEditionIds.add(participant.edition_id));
  results.forEach((result) => participationEditionIds.add(result.edition_id));

  const finalEditionIds = new Set<string>();
  participants.forEach((participant) => {
    if (isFinalShow(showById.get(participant.show_id ?? ""))) finalEditionIds.add(participant.edition_id);
  });
  results.forEach((result) => {
    if (isFinalShow(showById.get(result.show_id ?? ""))) finalEditionIds.add(result.edition_id);
  });

  const semiByEdition = new Map<string, Participant[]>();
  participants.forEach((participant) => {
    if (!isSemiShow(showById.get(participant.show_id ?? ""))) return;
    semiByEdition.set(participant.edition_id, [
      ...(semiByEdition.get(participant.edition_id) ?? []),
      participant,
    ]);
  });

  const qualificationByEdition = new Map(
    [...participationEditionIds].map((editionId) => [
      editionId,
      resolveCountryEditionQualification(countryId, editionId, publicOptions),
    ]),
  );

  const qualificationOutcomes = [...participationEditionIds]
    .map((editionId) => {
      const number = editionNumber.get(editionId);
      if (number == null) return null;
      const status = qualificationByEdition.get(editionId) ?? null;
      if (status == null) return null;
      return { editionNumber: number, value: qualificationCountsAsQualified(status) };
    })
    .filter((row): row is EditionFlag => row != null);

  const qualifications = qualificationOutcomes.filter((row) => row.value).length;

  const progressionPlacements = buildEditionProgressionPlacements(publicOptions.results, publicOptions.shows);
  const canonicalTimeline: CountryTimelinePoint[] = publicOptions.editions
    .map((edition) => {
      const placement = progressionPlacements.get(edition.id)?.get(countryId);
      if (!placement) return null;
      const status = qualificationByEdition.get(edition.id) ?? null;
      const qualified = status != null
        ? qualificationCountsAsQualified(status)
        : placement.source === "final"
          ? true
          : placement.source === "semi" || placement.source === "heat"
            ? false
            : null;

      return {
        editionId: edition.id,
        editionNumber: edition.edition_number,
        label: edition.edition_number != null ? `SSC ${edition.edition_number}` : edition.name,
        showId: placement.row.show_id,
        jury: placement.row.jury_points,
        televote: placement.row.televote_points,
        total: placement.row.total_points,
        rank: placement.rank,
        qualified,
      } satisfies CountryTimelinePoint;
    })
    .filter((point): point is CountryTimelinePoint => point != null)
    .sort(
      (a, b) =>
        (a.editionNumber ?? Number.MAX_SAFE_INTEGER) -
        (b.editionNumber ?? Number.MAX_SAFE_INTEGER),
    );

  const placementFlags = canonicalTimeline
    .filter((point): point is typeof point & { editionNumber: number } => point.editionNumber != null)
    .map((point) => ({
      editionNumber: point.editionNumber,
      top10: point.rank != null && point.rank <= 10,
      podium: point.rank != null && point.rank <= 3,
    }));

  const editionScores = canonicalTimeline.map((point) => point.total);
  const averageEditionScore = average(editionScores);
  const averageCombinedPlacement = average(
    canonicalTimeline.map((point) => point.rank).filter((rank): rank is number => rank != null),
  );
  const rolling5 = buildRollingFive(canonicalTimeline);
  const { biggestImprovement, biggestDecline } = placementSwings(canonicalTimeline);

  // "Per contest" means per edition, not per show. A delegation can vote in a
  // heat, semi and final in the same edition; averaging those as separate
  // contests would make the statistic depend on the format.
  const givenByEdition = new Map<string, number>();
  publicOptions.jury
    .filter((vote) => vote.voter_country_id === countryId)
    .forEach((vote) => {
      givenByEdition.set(vote.edition_id, (givenByEdition.get(vote.edition_id) ?? 0) + vote.points);
    });
  const averageGivenPerEdition = average([...givenByEdition.values()]);

  // Received top-score counts must include every published jury/voter identity,
  // including custom/external voters that do not map to a Solaris country.
  const resolveTop = makeTopScoreResolver(publicOptions.shows);
  const topScoresReceived = publicOptions.jury.filter(
    (vote) => vote.receiving_country_id === countryId && isTopScore(vote, resolveTop),
  ).length;

  const participations = participationEditionIds.size;
  const finals = finalEditionIds.size;
  const semis = semiByEdition.size;
  const finalOutcomes = [...participationEditionIds]
    .map((editionId) => {
      const number = editionNumber.get(editionId);
      return number == null ? null : { editionNumber: number, value: finalEditionIds.has(editionId) };
    })
    .filter((row): row is EditionFlag => row != null);

  return {
    ...base,
    participations,
    finals,
    semis,
    qualifications,
    qualificationPct: qualificationOutcomes.length
      ? (qualifications / qualificationOutcomes.length) * 100
      : null,
    grandFinalAppearancePct: participations ? (finals / participations) * 100 : null,
    nilPointers: editionScores.filter((score) => score === 0).length,
    avgCombinedPlacement: averageCombinedPlacement,
    avgPointsPerParticipation: averageEditionScore,
    avgReceivedPerContest: averageEditionScore,
    avgGivenPerContest: averageGivenPerEdition,
    topScoresReceived,
    highestScore: editionScores.length ? Math.max(...editionScores) : null,
    lowestScore: editionScores.length ? Math.min(...editionScores) : null,
    timeline: canonicalTimeline,
    rolling5,
    biggestImprovement,
    biggestDecline,
    bestPlacementStreak: longestEditionStreak(
      placementFlags.map((point) => ({ editionNumber: point.editionNumber, value: point.top10 })),
    ),
    worstPlacementStreak: longestEditionStreak(
      qualificationOutcomes.map((point) => ({ ...point, value: !point.value })),
    ),
    consecutiveQualifications: currentEditionStreak(qualificationOutcomes),
    consecutiveFinals: currentEditionStreak(finalOutcomes),
    consecutiveTop10: currentEditionStreak(
      placementFlags.map((point) => ({ editionNumber: point.editionNumber, value: point.top10 })),
    ),
    consecutivePodiums: currentEditionStreak(
      placementFlags.map((point) => ({ editionNumber: point.editionNumber, value: point.podium })),
    ),
  };
}
