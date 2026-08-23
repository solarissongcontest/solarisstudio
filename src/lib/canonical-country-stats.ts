import type { Edition, JuryVote, Participant, ResultRow, Show, Televote } from "./data";
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

  const placementFlags = base.timeline
    .filter((point): point is typeof point & { editionNumber: number } => point.editionNumber != null)
    .map((point) => ({
      editionNumber: point.editionNumber,
      top10: point.rank != null && point.rank <= 10,
      podium: point.rank != null && point.rank <= 3,
    }));

  const editionScores = base.timeline.map((point) => point.total);
  const averageEditionScore = editionScores.length
    ? editionScores.reduce((sum, score) => sum + score, 0) / editionScores.length
    : null;

  const participations = participationEditionIds.size;
  const finals = finalEditionIds.size;
  const semis = semiByEdition.size;

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
    avgReceivedPerContest: averageEditionScore,
    highestScore: editionScores.length ? Math.max(...editionScores) : null,
    lowestScore: editionScores.length ? Math.min(...editionScores) : null,
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
