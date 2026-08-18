import type { Edition, Participant, ResultRow, Show } from "@/lib/data";

export type ArchiveGameMode =
  | "higher-lower"
  | "jury-tele"
  | "edition-detective"
  | "winner-detective";

export type ArchiveGameOption = {
  id: string;
  label: string;
  detail?: string;
};

export type ArchiveGameQuestion = {
  id: string;
  mode: ArchiveGameMode;
  prompt: string;
  eyebrow: string;
  options: ArchiveGameOption[];
  correctOptionId: string;
  explanation: string;
  editionId?: string;
  showId?: string;
  entityIds: string[];
};

type ArchiveGameInput = {
  editions: Edition[];
  shows: Show[];
  participants: Participant[];
  results: ResultRow[];
  nameForEntity: (id: string) => string;
};

type HistoricalEntry = {
  entityId: string;
  name: string;
  editionId: string;
  editionNumber: number | null;
  editionLabel: string;
  showId: string | null;
  showName: string;
  finalRank: number;
  juryPoints: number;
  televotePoints: number;
  totalPoints: number;
  artist: string | null;
  song: string | null;
};

function hashSeed(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededNumber(seed: string) {
  let value = hashSeed(seed) || 1;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return (value >>> 0) / 4294967296;
}

function pick<T>(items: T[], seed: string) {
  if (!items.length) return undefined;
  return items[Math.floor(seededNumber(seed) * items.length) % items.length];
}

function shuffle<T>(items: T[], seed: string) {
  return [...items]
    .map((item, index) => ({ item, order: seededNumber(`${seed}:${index}`) }))
    .sort((a, b) => a.order - b.order)
    .map(({ item }) => item);
}

function editionDisplay(edition: Edition) {
  if (edition.edition_number != null) return `SSC ${edition.edition_number}`;
  return edition.name || "Solaris edition";
}

function historicalEntries(input: ArchiveGameInput): HistoricalEntry[] {
  const editions = new Map(input.editions.map((edition) => [edition.id, edition]));
  const shows = new Map(input.shows.map((show) => [show.id, show]));
  const participants = new Map(
    input.participants.map((participant) => [
      `${participant.show_id ?? "edition"}:${participant.country_id}`,
      participant,
    ]),
  );

  return input.results
    .filter(
      (result) =>
        Boolean(result.country_id) &&
        result.final_rank != null &&
        result.final_rank > 0 &&
        editions.get(result.edition_id)?.published,
    )
    .map((result) => {
      const edition = editions.get(result.edition_id)!;
      const show = result.show_id ? shows.get(result.show_id) : undefined;
      const participant = participants.get(
        `${result.show_id ?? "edition"}:${result.country_id}`,
      );

      return {
        entityId: result.country_id,
        name: input.nameForEntity(result.country_id),
        editionId: result.edition_id,
        editionNumber: edition.edition_number,
        editionLabel: editionDisplay(edition),
        showId: result.show_id,
        showName: show?.name ?? edition.name,
        finalRank: result.final_rank as number,
        juryPoints: result.jury_points ?? 0,
        televotePoints: result.televote_points ?? 0,
        totalPoints: result.total_points ?? 0,
        artist: participant?.artist ?? null,
        song: participant?.song ?? null,
      };
    });
}

function entryDetail(entry: HistoricalEntry) {
  const music = [entry.artist, entry.song].filter(Boolean).join(" · ");
  return music || entry.editionLabel;
}

function groupedByShow(entries: HistoricalEntry[]) {
  const grouped = new Map<string, HistoricalEntry[]>();
  for (const entry of entries) {
    const key = entry.showId ?? `edition:${entry.editionId}`;
    grouped.set(key, [...(grouped.get(key) ?? []), entry]);
  }
  return grouped;
}

function buildHigherLower(entries: HistoricalEntry[], seed: string): ArchiveGameQuestion | null {
  const groups = [...groupedByShow(entries).values()].filter((group) => group.length >= 2);
  const group = pick(groups, `${seed}:group`);
  if (!group) return null;

  const first = pick(group, `${seed}:first`);
  if (!first) return null;

  const alternatives = group.filter(
    (entry) => entry.entityId !== first.entityId && entry.finalRank !== first.finalRank,
  );
  const second = pick(alternatives, `${seed}:second`);
  if (!second) return null;

  const winner = first.finalRank < second.finalRank ? first : second;
  const options = shuffle(
    [
      { id: first.entityId, label: first.name, detail: entryDetail(first) },
      { id: second.entityId, label: second.name, detail: entryDetail(second) },
    ],
    `${seed}:options`,
  );

  return {
    id: `higher:${first.editionId}:${first.showId ?? "edition"}:${first.entityId}:${second.entityId}`,
    mode: "higher-lower",
    eyebrow: `${first.editionLabel} · ${first.showName}`,
    prompt: "Which entry finished higher?",
    options,
    correctOptionId: winner.entityId,
    explanation: `${winner.name} finished #${winner.finalRank}. ${winner === first ? second.name : first.name} finished #${winner === first ? second.finalRank : first.finalRank}.`,
    editionId: first.editionId,
    showId: first.showId ?? undefined,
    entityIds: [first.entityId, second.entityId],
  };
}

function buildJuryTele(entries: HistoricalEntry[], seed: string): ArchiveGameQuestion | null {
  const eligible = entries.filter(
    (entry) =>
      entry.juryPoints !== entry.televotePoints &&
      (entry.juryPoints > 0 || entry.televotePoints > 0),
  );
  const entry = pick(eligible, `${seed}:entry`);
  if (!entry) return null;

  const juryWon = entry.juryPoints > entry.televotePoints;

  return {
    id: `jury-tele:${entry.editionId}:${entry.showId ?? "edition"}:${entry.entityId}`,
    mode: "jury-tele",
    eyebrow: `${entry.editionLabel} · ${entry.showName}`,
    prompt: `Who supported ${entry.name} more?`,
    options: [
      { id: "jury", label: "Jury", detail: "Professional / jury points" },
      { id: "televote", label: "Televote", detail: "Public / televote points" },
    ],
    correctOptionId: juryWon ? "jury" : "televote",
    explanation: `${entry.name} received ${entry.juryPoints} jury points and ${entry.televotePoints} televote points.`,
    editionId: entry.editionId,
    showId: entry.showId ?? undefined,
    entityIds: [entry.entityId],
  };
}

function buildEditionDetective(
  entries: HistoricalEntry[],
  editions: Edition[],
  seed: string,
): ArchiveGameQuestion | null {
  const eligible = entries.filter((entry) => entry.editionNumber != null);
  const entry = pick(eligible, `${seed}:entry`);
  if (!entry) return null;

  const publishedEditions = editions
    .filter((edition) => edition.published && edition.edition_number != null)
    .sort((a, b) => (a.edition_number ?? 0) - (b.edition_number ?? 0));

  const correctEdition = publishedEditions.find((edition) => edition.id === entry.editionId);
  if (!correctEdition || correctEdition.edition_number == null) return null;

  const nearbyPool = publishedEditions
    .filter((edition) => edition.id !== entry.editionId && edition.edition_number != null)
    .map((edition) => ({
      edition,
      distance: Math.abs((edition.edition_number ?? 0) - correctEdition.edition_number!),
    }))
    .sort(
      (a, b) =>
        a.distance - b.distance ||
        (a.edition.edition_number ?? 0) - (b.edition.edition_number ?? 0),
    );

  const nearestDistance = nearbyPool[0]?.distance ?? Number.POSITIVE_INFINITY;
  const closePool = nearbyPool.filter(
    (item) => item.distance <= Math.max(3, nearestDistance + 2),
  );
  const distractorSource = closePool.length >= 3 ? closePool : nearbyPool;
  const distractors = shuffle(
    distractorSource.map((item) => item.edition),
    `${seed}:distractors`,
  ).slice(0, 3);

  const optionEditions = shuffle([correctEdition, ...distractors], `${seed}:options`);
  if (optionEditions.length < 2) return null;

  const music = [entry.artist, entry.song].filter(Boolean).join(" · ");
  const clue = music || `${entry.name} · ${entry.showName}`;

  return {
    id: `edition:${entry.editionId}:${entry.showId ?? "edition"}:${entry.entityId}`,
    mode: "edition-detective",
    eyebrow: `Archive detective · ${entry.name}`,
    prompt: `Which edition featured ${clue}?`,
    options: optionEditions.map((edition) => ({
      id: edition.id,
      label: editionDisplay(edition),
      detail: edition.host_city || undefined,
    })),
    correctOptionId: correctEdition.id,
    explanation: `${entry.name} appeared in ${editionDisplay(correctEdition)} in ${entry.showName}.`,
    editionId: entry.editionId,
    showId: entry.showId ?? undefined,
    entityIds: [entry.entityId],
  };
}

function buildWinnerDetective(
  entries: HistoricalEntry[],
  seed: string,
): ArchiveGameQuestion | null {
  const groups = [...groupedByShow(entries).values()].filter(
    (group) => group.length >= 4 && group.some((entry) => entry.finalRank === 1),
  );
  const group = pick(groups, `${seed}:group`);
  if (!group) return null;

  const winner = group.find((entry) => entry.finalRank === 1);
  if (!winner) return null;

  const closestFinishers = group
    .filter((entry) => entry.entityId !== winner.entityId)
    .sort((a, b) => a.finalRank - b.finalRank)
    .slice(0, 8);
  const distractors = shuffle(closestFinishers, `${seed}:distractors`).slice(0, 3);
  if (distractors.length < 2) return null;

  const options = shuffle([winner, ...distractors], `${seed}:options`).map((entry) => ({
    id: entry.entityId,
    label: entry.name,
    detail: entryDetail(entry),
  }));

  return {
    id: `winner:${winner.editionId}:${winner.showId ?? "edition"}`,
    mode: "winner-detective",
    eyebrow: `${winner.editionLabel} · ${winner.showName}`,
    prompt: `Who won ${winner.showName}?`,
    options,
    correctOptionId: winner.entityId,
    explanation: `${winner.name} won ${winner.showName} with ${winner.totalPoints} points.`,
    editionId: winner.editionId,
    showId: winner.showId ?? undefined,
    entityIds: options.map((option) => option.id),
  };
}

export function buildArchiveGameQuestion(
  input: ArchiveGameInput,
  mode: ArchiveGameMode,
  seed: string,
): ArchiveGameQuestion | null {
  const entries = historicalEntries(input);
  if (!entries.length) return null;

  if (mode === "higher-lower") return buildHigherLower(entries, seed);
  if (mode === "jury-tele") return buildJuryTele(entries, seed);
  if (mode === "winner-detective") return buildWinnerDetective(entries, seed);
  return buildEditionDetective(entries, input.editions, seed);
}

export function archiveGameStats(input: ArchiveGameInput) {
  const entries = historicalEntries(input);
  const editions = new Set(entries.map((entry) => entry.editionId));
  const shows = new Set(entries.map((entry) => entry.showId).filter(Boolean));
  const entities = new Set(entries.map((entry) => entry.entityId));

  return {
    resultCount: entries.length,
    editionCount: editions.size,
    showCount: shows.size,
    entityCount: entities.size,
  };
}
