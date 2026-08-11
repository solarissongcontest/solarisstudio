export type TasteDnaResultEntry = {
  id: string;
  juryPoints: number;
  televotePoints: number;
  totalPoints: number;
  officialRank: number | null;
};

export type TasteDnaJuryBallot = {
  key: string;
  name: string;
  ranking: string[];
};

export type TasteDnaHistoryBallot = {
  showId: string;
  ranking: string[];
};

export type TasteDnaMatch = {
  key: string;
  name: string;
  similarity: number;
};

export type TasteDnaFavourite = {
  id: string;
  name: string;
  topThreeCount: number;
  topTenCount: number;
  ballotCount: number;
  score: number;
};

export type TasteDnaProfile = {
  jurySimilarity: number;
  televoteSimilarity: number;
  overallSimilarity: number;
  mainstreamScore: number;
  contrarianScore: number;
  juryLean: number;
  televoteLean: number;
  alignmentLabel: string;
  personalityLabel: string;
  similarJuries: TasteDnaMatch[];
  oppositeJuries: TasteDnaMatch[];
  recurringFavourites: TasteDnaFavourite[];
};

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function uniqueRanking(ranking: readonly string[], universe: readonly string[]) {
  const allowed = new Set(universe);
  const seen = new Set<string>();
  const clean: string[] = [];

  for (const id of ranking) {
    if (!allowed.has(id) || seen.has(id)) continue;
    clean.push(id);
    seen.add(id);
  }

  for (const id of universe) {
    if (!seen.has(id)) clean.push(id);
  }

  return clean;
}

export function rankingFromScores(
  entries: TasteDnaResultEntry[],
  score: (entry: TasteDnaResultEntry) => number,
) {
  return [...entries]
    .sort((a, b) => {
      const scoreDelta = score(b) - score(a);
      if (scoreDelta !== 0) return scoreDelta;
      const aRank = a.officialRank ?? Number.MAX_SAFE_INTEGER;
      const bRank = b.officialRank ?? Number.MAX_SAFE_INTEGER;
      return aRank - bRank || a.id.localeCompare(b.id);
    })
    .map((entry) => entry.id);
}

export function rankingSimilarity(
  first: readonly string[],
  second: readonly string[],
  universeInput?: readonly string[],
) {
  const universe = universeInput?.length
    ? [...new Set(universeInput)]
    : [...new Set([...first, ...second])];

  if (universe.length < 2) return 100;

  const a = uniqueRanking(first, universe);
  const b = uniqueRanking(second, universe);
  const aPosition = new Map(a.map((id, index) => [id, index + 1]));
  const bPosition = new Map(b.map((id, index) => [id, index + 1]));
  const maxDistance = universe.length - 1;

  const averageDistance =
    universe.reduce((sum, id) => {
      const aRank = aPosition.get(id) ?? universe.length;
      const bRank = bPosition.get(id) ?? universe.length;
      return sum + Math.abs(aRank - bRank) / maxDistance;
    }, 0) / universe.length;

  return Number(clamp((1 - averageDistance) * 100).toFixed(1));
}

function juryBallotSimilarity(
  fanRanking: readonly string[],
  juryRanking: readonly string[],
  universe: readonly string[],
) {
  if (!juryRanking.length || !fanRanking.length) return 0;

  const limit = Math.min(10, universe.length);
  const fanTop = fanRanking.slice(0, limit);
  const juryTop = juryRanking.slice(0, limit);
  const fanPosition = new Map(fanTop.map((id, index) => [id, index + 1]));
  const juryPosition = new Map(juryTop.map((id, index) => [id, index + 1]));

  let overlapScore = 0;
  let maximum = 0;

  for (let position = 1; position <= limit; position += 1) {
    maximum += (limit - position + 1) ** 2;
  }

  for (const id of fanTop) {
    const fanRank = fanPosition.get(id)!;
    const juryRank = juryPosition.get(id);
    if (juryRank == null) continue;
    const fanWeight = limit - fanRank + 1;
    const juryWeight = limit - juryRank + 1;
    overlapScore += fanWeight * juryWeight;
  }

  return Number(clamp(maximum > 0 ? (overlapScore / maximum) * 100 : 0).toFixed(1));
}

export function buildTasteDna({
  ranking,
  results,
  juryBallots,
  history,
  nameForId,
}: {
  ranking: string[];
  results: TasteDnaResultEntry[];
  juryBallots: TasteDnaJuryBallot[];
  history: TasteDnaHistoryBallot[];
  nameForId: (id: string) => string;
}): TasteDnaProfile | null {
  if (ranking.length < 3 || results.length < 3) return null;

  const universe = results.map((entry) => entry.id);
  const fanRanking = uniqueRanking(ranking, universe);
  const juryRanking = rankingFromScores(results, (entry) => entry.juryPoints);
  const televoteRanking = rankingFromScores(results, (entry) => entry.televotePoints);
  const overallRanking = rankingFromScores(results, (entry) => entry.totalPoints);

  const jurySimilarity = rankingSimilarity(fanRanking, juryRanking, universe);
  const televoteSimilarity = rankingSimilarity(fanRanking, televoteRanking, universe);
  const overallSimilarity = rankingSimilarity(fanRanking, overallRanking, universe);
  const mainstreamScore = overallSimilarity;
  const contrarianScore = Number((100 - mainstreamScore).toFixed(1));
  const juryAdvantage = jurySimilarity - televoteSimilarity;
  const televoteAdvantage = televoteSimilarity - jurySimilarity;
  const juryLean = Number(clamp(50 + juryAdvantage / 2).toFixed(1));
  const televoteLean = Number((100 - juryLean).toFixed(1));

  let alignmentLabel = "Balanced taste";
  if (juryAdvantage >= 8) alignmentLabel = "Jury-leaning";
  if (televoteAdvantage >= 8) alignmentLabel = "Televote-leaning";
  if (Math.abs(juryAdvantage) < 8 && Math.max(jurySimilarity, televoteSimilarity) < 55) {
    alignmentLabel = "Independent taste";
  }

  let personalityLabel = "Selective mainstream";
  if (mainstreamScore >= 82) personalityLabel = "Consensus magnet";
  else if (mainstreamScore >= 68) personalityLabel = "Mainstream with opinions";
  else if (mainstreamScore >= 52) personalityLabel = "Balanced explorer";
  else if (mainstreamScore >= 38) personalityLabel = "Contrarian streak";
  else personalityLabel = "Certified chaos voter";

  const juryMatches = juryBallots
    .filter((ballot) => ballot.ranking.length)
    .map((ballot) => ({
      key: ballot.key,
      name: ballot.name,
      similarity: juryBallotSimilarity(fanRanking, ballot.ranking, universe),
    }))
    .sort((a, b) => b.similarity - a.similarity || a.name.localeCompare(b.name));

  const historyIncludingCurrent = [
    ...history,
    { showId: "__current__", ranking: fanRanking },
  ];
  const favouriteStats = new Map<
    string,
    { topThreeCount: number; topTenCount: number; ballotCount: number; score: number }
  >();

  for (const ballot of historyIncludingCurrent) {
    const seen = new Set<string>();
    ballot.ranking.slice(0, 10).forEach((id, index) => {
      if (seen.has(id)) return;
      seen.add(id);
      const current = favouriteStats.get(id) ?? {
        topThreeCount: 0,
        topTenCount: 0,
        ballotCount: 0,
        score: 0,
      };
      current.topTenCount += 1;
      if (index < 3) current.topThreeCount += 1;
      current.ballotCount += 1;
      current.score += Math.max(1, 10 - index) + (index < 3 ? 8 : 0);
      favouriteStats.set(id, current);
    });
  }

  const recurringFavourites = [...favouriteStats.entries()]
    .map(([id, stats]) => ({ id, name: nameForId(id), ...stats }))
    .filter((item) => item.ballotCount >= 2 || item.topThreeCount >= 2)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.topThreeCount - a.topThreeCount ||
        b.topTenCount - a.topTenCount ||
        a.name.localeCompare(b.name),
    )
    .slice(0, 8);

  return {
    jurySimilarity,
    televoteSimilarity,
    overallSimilarity,
    mainstreamScore,
    contrarianScore,
    juryLean,
    televoteLean,
    alignmentLabel,
    personalityLabel,
    similarJuries: juryMatches.slice(0, 5),
    oppositeJuries: [...juryMatches].sort(
      (a, b) => a.similarity - b.similarity || a.name.localeCompare(b.name),
    ).slice(0, 5),
    recurringFavourites,
  };
}

export function tasteFingerprintText({
  profile,
  showName,
}: {
  profile: TasteDnaProfile;
  showName: string;
}) {
  const closest = profile.similarJuries[0]?.name;
  const lines = [
    `Solaris Taste DNA — ${showName}`,
    `${profile.personalityLabel} · ${profile.alignmentLabel}`,
    `Jury match ${profile.jurySimilarity}% · Televote match ${profile.televoteSimilarity}%`,
    `Mainstream ${profile.mainstreamScore}% · Contrarian ${profile.contrarianScore}%`,
  ];

  if (closest) lines.push(`Closest jury taste: ${closest}`);
  return lines.join("\n");
}
