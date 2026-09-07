import type {
  Country,
  Edition,
  JuryVote,
  Participant,
  ResultRow,
  Show,
} from "@/lib/data";

export type AnniversaryCountrySnapshot = {
  countryId: string;
  name: string;
  shortCode: string;
  participations: number;
  finals: number;
  wins: number;
  topFives: number;
  totalFinalPoints: number;
  bestRank: number | null;
  debutEdition: number | null;
  latestEdition: number | null;
  activeStreak: number;
  participationShare: number;
  anniversaryIndex: number;
};

export type AnniversaryEditionSnapshot = {
  editionId: string;
  editionNumber: number;
  slug: string;
  name: string;
  year: number | null;
  hostCity: string | null;
  fieldSize: number;
  winnerCountryId: string | null;
  winnerName: string | null;
  winnerPoints: number | null;
  runnerUpName: string | null;
  winningMargin: number | null;
  juryTelevoteDisagreement: number | null;
};

export type AnniversaryEraSnapshot = {
  year: number;
  editions: number;
  averageFieldSize: number;
  averageWinnerScore: number | null;
  averageWinningMargin: number | null;
  uniqueWinners: number;
};

export type AnniversaryMoment = {
  id: string;
  kicker: string;
  title: string;
  detail: string;
  editionNumber: number | null;
};

export type AnniversaryRelationship = {
  aId: string;
  bId: string;
  aName: string;
  bName: string;
  aToB: number;
  bToA: number;
  mutualScore: number;
};

export type AnniversaryArchiveInsights = {
  totalEditions: number;
  totalCountries: number;
  countries: AnniversaryCountrySnapshot[];
  editions: AnniversaryEditionSnapshot[];
  eras: AnniversaryEraSnapshot[];
  moments: AnniversaryMoment[];
  topDelegations: AnniversaryCountrySnapshot[];
  strongestMutualRelationship: AnniversaryRelationship | null;
  strongestDirectionalRelationship: {
    fromId: string;
    toId: string;
    fromName: string;
    toName: string;
    points: number;
  } | null;
  biggestJuryTelevoteSplit: {
    countryId: string;
    countryName: string;
    editionNumber: number;
    juryPoints: number;
    televotePoints: number;
    gap: number;
  } | null;
  biggestTelevoteLift: {
    countryId: string;
    countryName: string;
    editionNumber: number;
    juryRank: number;
    televoteRank: number;
    places: number;
  } | null;
  oldestStandingRecord: AnniversaryMoment | null;
  anniversaryYearEditionIds: string[];
};

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function finalShowForEdition(shows: Show[], editionId: string) {
  return [...shows]
    .filter(
      (show) =>
        show.edition_id === editionId &&
        show.published &&
        (show.kind === "grand-final" || show.kind === "final"),
    )
    .sort((a, b) => b.sort_order - a.sort_order)[0] ?? null;
}

function uniqueBaseParticipants(participants: Participant[], editionId: string) {
  const seen = new Set<string>();
  const rows: Participant[] = [];
  for (const participant of participants) {
    if (participant.edition_id !== editionId || participant.show_id != null || !participant.country_id) continue;
    if (seen.has(participant.country_id)) continue;
    seen.add(participant.country_id);
    rows.push(participant);
  }
  return rows;
}

function ranked(rows: ResultRow[], selector: (row: ResultRow) => number) {
  return [...rows].sort((a, b) => selector(b) - selector(a) || (a.final_rank ?? 999) - (b.final_rank ?? 999));
}

function relationshipKey(a: string, b: string) {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

export function buildAnniversaryArchiveInsights({
  anniversaryYear,
  editions,
  shows,
  participants,
  results,
  countries,
  juryVotes = [],
}: {
  anniversaryYear: number;
  editions: Edition[];
  shows: Show[];
  participants: Participant[];
  results: ResultRow[];
  countries: Country[];
  juryVotes?: JuryVote[];
}): AnniversaryArchiveInsights {
  const countryMap = new Map(countries.map((country) => [country.id, country]));
  const publishedEditions = editions
    .filter((edition) => edition.published && edition.edition_number != null)
    .sort((a, b) => (a.edition_number ?? 0) - (b.edition_number ?? 0));
  const publishedEditionIds = new Set(publishedEditions.map((edition) => edition.id));
  const editionMap = new Map(publishedEditions.map((edition) => [edition.id, edition]));

  const finalShowMap = new Map<string, Show>();
  for (const edition of publishedEditions) {
    const show = finalShowForEdition(shows, edition.id);
    if (show) finalShowMap.set(edition.id, show);
  }
  const finalShowIds = new Set([...finalShowMap.values()].map((show) => show.id));

  const editionSnapshots: AnniversaryEditionSnapshot[] = publishedEditions.map((edition) => {
    const baseParticipants = uniqueBaseParticipants(participants, edition.id);
    const finalShow = finalShowMap.get(edition.id) ?? null;
    const finalRows = finalShow
      ? results
          .filter((result) => result.show_id === finalShow.id && result.final_rank != null)
          .sort((a, b) => (a.final_rank ?? 999) - (b.final_rank ?? 999))
      : [];
    const winner = finalRows.find((row) => row.final_rank === 1) ?? finalRows[0] ?? null;
    const runnerUp = finalRows.find((row) => row.final_rank === 2) ?? finalRows[1] ?? null;
    const disagreement = finalRows.length
      ? average(finalRows.map((row) => Math.abs((row.jury_points ?? 0) - (row.televote_points ?? 0))))
      : null;

    return {
      editionId: edition.id,
      editionNumber: edition.edition_number ?? 0,
      slug: edition.slug,
      name: edition.name,
      year: edition.year,
      hostCity: edition.host_city,
      fieldSize: baseParticipants.length,
      winnerCountryId: winner?.country_id ?? null,
      winnerName: winner ? countryMap.get(winner.country_id)?.name ?? null : null,
      winnerPoints: winner?.total_points ?? null,
      runnerUpName: runnerUp ? countryMap.get(runnerUp.country_id)?.name ?? null : null,
      winningMargin:
        winner && runnerUp
          ? Math.max(0, (winner.total_points ?? 0) - (runnerUp.total_points ?? 0))
          : null,
      juryTelevoteDisagreement: disagreement == null ? null : round(disagreement, 1),
    };
  });

  const participationByCountry = new Map<string, Set<number>>();
  for (const edition of publishedEditions) {
    for (const participant of uniqueBaseParticipants(participants, edition.id)) {
      if (!countryMap.has(participant.country_id)) continue;
      const set = participationByCountry.get(participant.country_id) ?? new Set<number>();
      set.add(edition.edition_number ?? 0);
      participationByCountry.set(participant.country_id, set);
    }
  }

  const finalResults = results.filter(
    (result) =>
      result.show_id != null &&
      finalShowIds.has(result.show_id) &&
      publishedEditionIds.has(result.edition_id) &&
      result.final_rank != null,
  );

  const finalRowsByCountry = new Map<string, ResultRow[]>();
  for (const result of finalResults) {
    if (!countryMap.has(result.country_id)) continue;
    const rows = finalRowsByCountry.get(result.country_id) ?? [];
    rows.push(result);
    finalRowsByCountry.set(result.country_id, rows);
  }

  const editionNumbers = publishedEditions.map((edition) => edition.edition_number ?? 0);
  const latestEditionNumber = editionNumbers.at(-1) ?? null;

  const countrySnapshots = countries
    .map<AnniversaryCountrySnapshot>((country) => {
      const participationSet = participationByCountry.get(country.id) ?? new Set<number>();
      const participated = [...participationSet].sort((a, b) => a - b);
      const rows = finalRowsByCountry.get(country.id) ?? [];
      const wins = rows.filter((row) => row.final_rank === 1).length;
      const topFives = rows.filter((row) => (row.final_rank ?? 999) <= 5).length;
      const bestRank = rows.length ? Math.min(...rows.map((row) => row.final_rank ?? 999)) : null;

      let activeStreak = 0;
      if (latestEditionNumber != null) {
        for (let number = latestEditionNumber; number >= 1; number -= 1) {
          if (!editionNumbers.includes(number)) continue;
          if (!participationSet.has(number)) break;
          activeStreak += 1;
        }
      }

      const participations = participated.length;
      const finals = rows.length;
      const anniversaryIndex = wins * 100 + topFives * 15 + finals * 5 + participations;

      return {
        countryId: country.id,
        name: country.name,
        shortCode: country.short_code,
        participations,
        finals,
        wins,
        topFives,
        totalFinalPoints: rows.reduce((sum, row) => sum + (row.total_points ?? 0), 0),
        bestRank: bestRank === 999 ? null : bestRank,
        debutEdition: participated[0] ?? country.first_participation ?? null,
        latestEdition: participated.at(-1) ?? null,
        activeStreak,
        participationShare: publishedEditions.length
          ? round((participations / publishedEditions.length) * 100, 0)
          : 0,
        anniversaryIndex,
      };
    })
    .filter((snapshot) => snapshot.participations > 0 || snapshot.finals > 0)
    .sort((a, b) => b.anniversaryIndex - a.anniversaryIndex || a.name.localeCompare(b.name));

  const yearGroups = new Map<number, AnniversaryEditionSnapshot[]>();
  for (const edition of editionSnapshots) {
    if (!edition.year) continue;
    const rows = yearGroups.get(edition.year) ?? [];
    rows.push(edition);
    yearGroups.set(edition.year, rows);
  }

  const eras = [...yearGroups.entries()]
    .sort(([a], [b]) => a - b)
    .map<AnniversaryEraSnapshot>(([year, rows]) => {
      const winnerScores = rows
        .map((row) => row.winnerPoints)
        .filter((value): value is number => value != null);
      const margins = rows
        .map((row) => row.winningMargin)
        .filter((value): value is number => value != null);
      return {
        year,
        editions: rows.length,
        averageFieldSize: round(rows.reduce((sum, row) => sum + row.fieldSize, 0) / Math.max(1, rows.length), 1),
        averageWinnerScore: average(winnerScores) == null ? null : round(average(winnerScores)!, 1),
        averageWinningMargin: average(margins) == null ? null : round(average(margins)!, 1),
        uniqueWinners: new Set(rows.map((row) => row.winnerCountryId).filter(Boolean)).size,
      };
    });

  const firstEdition = editionSnapshots[0] ?? null;
  const latestEdition = editionSnapshots.at(-1) ?? null;
  const largestField = [...editionSnapshots].sort(
    (a, b) => b.fieldSize - a.fieldSize || a.editionNumber - b.editionNumber,
  )[0] ?? null;
  const highestWinnerScore = [...editionSnapshots]
    .filter((edition) => edition.winnerPoints != null)
    .sort((a, b) => (b.winnerPoints ?? 0) - (a.winnerPoints ?? 0) || a.editionNumber - b.editionNumber)[0] ?? null;
  const closestFinal = [...editionSnapshots]
    .filter((edition) => edition.winningMargin != null)
    .sort((a, b) => (a.winningMargin ?? 999999) - (b.winningMargin ?? 999999) || a.editionNumber - b.editionNumber)[0] ?? null;

  const moments: AnniversaryMoment[] = [];
  if (firstEdition) {
    moments.push({
      id: "first-edition",
      kicker: "Where it started",
      title: `SSC ${firstEdition.editionNumber} opened the archive`,
      detail: firstEdition.winnerName
        ? `${firstEdition.winnerName} became the first champion in the published Solaris archive.`
        : "The first published contest chapter started the Solaris history book.",
      editionNumber: firstEdition.editionNumber,
    });
  }
  if (closestFinal) {
    moments.push({
      id: "closest-final",
      kicker: "Closest final",
      title: `${closestFinal.winningMargin} point${closestFinal.winningMargin === 1 ? "" : "s"} decided SSC ${closestFinal.editionNumber}`,
      detail:
        closestFinal.winnerName && closestFinal.runnerUpName
          ? `${closestFinal.winnerName} held off ${closestFinal.runnerUpName} in the archive's tightest published finish.`
          : "The archive's tightest published finish came down to almost nothing.",
      editionNumber: closestFinal.editionNumber,
    });
  }
  if (highestWinnerScore) {
    moments.push({
      id: "highest-score",
      kicker: "Winning high-water mark",
      title: `${highestWinnerScore.winnerPoints} points in SSC ${highestWinnerScore.editionNumber}`,
      detail: highestWinnerScore.winnerName
        ? `${highestWinnerScore.winnerName} owns the highest published winning total in the archive.`
        : "This edition produced the archive's highest published winning score.",
      editionNumber: highestWinnerScore.editionNumber,
    });
  }
  if (latestEdition && latestEdition.editionNumber !== firstEdition?.editionNumber) {
    moments.push({
      id: "latest-chapter",
      kicker: "The latest chapter",
      title: latestEdition.winnerName
        ? `${latestEdition.winnerName} carried the trophy out of SSC ${latestEdition.editionNumber}`
        : `SSC ${latestEdition.editionNumber} is the newest published chapter`,
      detail: "The anniversary archive ends here for now. The next contest will move every all-time table again.",
      editionNumber: latestEdition.editionNumber,
    });
  }

  const relationshipPairs = new Map<
    string,
    { aId: string; bId: string; aToB: number; bToA: number }
  >();
  let strongestDirectionalRelationship: AnniversaryArchiveInsights["strongestDirectionalRelationship"] = null;
  for (const vote of juryVotes) {
    if (!publishedEditionIds.has(vote.edition_id)) continue;
    const from = vote.voter_country_id;
    const to = vote.receiving_country_id;
    if (!from || !to || from === to || !countryMap.has(from) || !countryMap.has(to)) continue;

    if (!strongestDirectionalRelationship || vote.points > strongestDirectionalRelationship.points) {
      // The running single-vote comparison is replaced below by the aggregate map.
      strongestDirectionalRelationship = {
        fromId: from,
        toId: to,
        fromName: countryMap.get(from)?.name ?? from,
        toName: countryMap.get(to)?.name ?? to,
        points: vote.points,
      };
    }

    const key = relationshipKey(from, to);
    const [aId, bId] = from < to ? [from, to] : [to, from];
    const pair = relationshipPairs.get(key) ?? { aId, bId, aToB: 0, bToA: 0 };
    if (from === pair.aId) pair.aToB += vote.points;
    else pair.bToA += vote.points;
    relationshipPairs.set(key, pair);
  }

  const directionalTotals = new Map<string, number>();
  for (const pair of relationshipPairs.values()) {
    directionalTotals.set(`${pair.aId}::${pair.bId}`, pair.aToB);
    directionalTotals.set(`${pair.bId}::${pair.aId}`, pair.bToA);
  }
  const strongestDirection = [...directionalTotals.entries()].sort((a, b) => b[1] - a[1])[0];
  if (strongestDirection) {
    const [fromId, toId] = strongestDirection[0].split("::");
    strongestDirectionalRelationship = {
      fromId,
      toId,
      fromName: countryMap.get(fromId)?.name ?? fromId,
      toName: countryMap.get(toId)?.name ?? toId,
      points: strongestDirection[1],
    };
  }

  const strongestPair = [...relationshipPairs.values()]
    .filter((pair) => pair.aToB > 0 && pair.bToA > 0)
    .map((pair) => ({ ...pair, mutualScore: Math.min(pair.aToB, pair.bToA) }))
    .sort((a, b) => b.mutualScore - a.mutualScore || b.aToB + b.bToA - (a.aToB + a.bToA))[0] ?? null;

  const strongestMutualRelationship: AnniversaryRelationship | null = strongestPair
    ? {
        ...strongestPair,
        aName: countryMap.get(strongestPair.aId)?.name ?? strongestPair.aId,
        bName: countryMap.get(strongestPair.bId)?.name ?? strongestPair.bId,
      }
    : null;

  let biggestJuryTelevoteSplit: AnniversaryArchiveInsights["biggestJuryTelevoteSplit"] = null;
  let biggestTelevoteLift: AnniversaryArchiveInsights["biggestTelevoteLift"] = null;

  for (const edition of publishedEditions) {
    const finalShow = finalShowMap.get(edition.id);
    if (!finalShow) continue;
    const rows = results.filter((result) => result.show_id === finalShow.id && result.final_rank != null);

    for (const row of rows) {
      if (!countryMap.has(row.country_id)) continue;
      const gap = Math.abs((row.jury_points ?? 0) - (row.televote_points ?? 0));
      if (!biggestJuryTelevoteSplit || gap > biggestJuryTelevoteSplit.gap) {
        biggestJuryTelevoteSplit = {
          countryId: row.country_id,
          countryName: countryMap.get(row.country_id)?.name ?? row.country_id,
          editionNumber: edition.edition_number ?? 0,
          juryPoints: row.jury_points ?? 0,
          televotePoints: row.televote_points ?? 0,
          gap,
        };
      }
    }

    const juryRanking = ranked(rows, (row) => row.jury_points ?? 0);
    const teleRanking = ranked(rows, (row) => row.televote_points ?? 0);
    const juryRankMap = new Map(juryRanking.map((row, index) => [row.country_id, index + 1]));
    const teleRankMap = new Map(teleRanking.map((row, index) => [row.country_id, index + 1]));
    for (const row of rows) {
      if (!countryMap.has(row.country_id)) continue;
      const juryRank = juryRankMap.get(row.country_id) ?? rows.length;
      const televoteRank = teleRankMap.get(row.country_id) ?? rows.length;
      const places = juryRank - televoteRank;
      if (places <= 0) continue;
      if (!biggestTelevoteLift || places > biggestTelevoteLift.places) {
        biggestTelevoteLift = {
          countryId: row.country_id,
          countryName: countryMap.get(row.country_id)?.name ?? row.country_id,
          editionNumber: edition.edition_number ?? 0,
          juryRank,
          televoteRank,
          places,
        };
      }
    }
  }

  const standingRecords = [
    largestField
      ? {
          id: "largest-field",
          kicker: "Old record still standing",
          title: `${largestField.fieldSize} countries in SSC ${largestField.editionNumber}`,
          detail: "This edition still owns the largest published field in the archive.",
          editionNumber: largestField.editionNumber,
        }
      : null,
    highestWinnerScore
      ? {
          id: "winner-score",
          kicker: "Old record still standing",
          title: `${highestWinnerScore.winnerPoints} winning points in SSC ${highestWinnerScore.editionNumber}`,
          detail: "The highest published winning total remains unbeaten.",
          editionNumber: highestWinnerScore.editionNumber,
        }
      : null,
    closestFinal
      ? {
          id: "closest-margin",
          kicker: "Old record still standing",
          title: `${closestFinal.winningMargin}-point margin in SSC ${closestFinal.editionNumber}`,
          detail: "No published final has produced a smaller winning margin.",
          editionNumber: closestFinal.editionNumber,
        }
      : null,
  ].filter((item): item is AnniversaryMoment => Boolean(item));

  const oldestStandingRecord = [...standingRecords].sort(
    (a, b) => (a.editionNumber ?? 999) - (b.editionNumber ?? 999),
  )[0] ?? null;

  const currentYearEditions = publishedEditions.filter((edition) => edition.year === anniversaryYear);
  const previousYearEditions = publishedEditions.filter((edition) => edition.year === anniversaryYear - 1);
  const bridge = [...previousYearEditions].sort(
    (a, b) => (b.edition_number ?? 0) - (a.edition_number ?? 0),
  )[0];
  const anniversaryYearEditionIds = [...(bridge ? [bridge.id] : []), ...currentYearEditions.map((edition) => edition.id)];

  return {
    totalEditions: publishedEditions.length,
    totalCountries: countrySnapshots.length,
    countries: countrySnapshots,
    editions: editionSnapshots,
    eras,
    moments: moments.slice(0, 4),
    topDelegations: countrySnapshots.slice(0, 4),
    strongestMutualRelationship,
    strongestDirectionalRelationship,
    biggestJuryTelevoteSplit,
    biggestTelevoteLift,
    oldestStandingRecord,
    anniversaryYearEditionIds,
  };
}

export function anniversaryCountrySnapshot(
  insights: AnniversaryArchiveInsights,
  countryId: string | null | undefined,
) {
  if (!countryId) return null;
  return insights.countries.find((country) => country.countryId === countryId) ?? null;
}

export function anniversaryEditionSnapshot(
  insights: AnniversaryArchiveInsights,
  editionNumberOrSlug: string | number | null | undefined,
) {
  if (editionNumberOrSlug == null) return null;
  const numeric = typeof editionNumberOrSlug === "number" ? editionNumberOrSlug : Number(editionNumberOrSlug.replace(/^ssc-?/i, ""));
  return insights.editions.find(
    (edition) =>
      edition.slug === editionNumberOrSlug ||
      (Number.isFinite(numeric) && edition.editionNumber === numeric),
  ) ?? null;
}
