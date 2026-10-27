import { loadPublicResultSnapshots, type PublicResultSnapshotClient, type PublicResultCoverage } from "@/lib/v3-public-result-snapshots";
import { createConfirmationPublicRuntimeClient } from "@/integrations/confirmations/public-runtime.server";
import { buildCanonicalFanRecords } from "@/lib/canonical-fan-records";
import { resolveCurrentPublicEdition } from "@/lib/current-contest-state";
import type {
  Country,
  Edition,
  JuryVote,
  Participant,
  ResultRow,
  Show,
} from "@/lib/data";
import { isShowPublic, resolveShowPublication } from "@/lib/publication";
import type { V3RecordsBundle } from "@/lib/v3-records";

const PAGE_SIZE = 1000;
const EDITION_COLUMNS =
  "id,edition_number,name,year,slug,status,published";
const SHOW_COLUMNS =
  "id,edition_id,name,kind,sort_order,status,published,qualifier_count,theme_id,voting_config,broadcast_config,publication_config";
const COUNTRY_COLUMNS =
  "id,name,native_name,short_code,flag_image,region,accent_color,description,first_participation";
const PARTICIPANT_COLUMNS =
  "id,edition_id,show_id,country_id,contest_entity_id,artist,song,running_order,semi_final,qualified,participation_status";
const JURY_COLUMNS =
  "id,edition_id,show_id,voter_country_id,voter_id,voter_entity_id,receiving_country_id,receiving_entity_id,points";

type RecordsSourceClient = PublicResultSnapshotClient & {
  from(table: string): any;
};

function throwIfError(error: unknown, label: string) {
  if (!error) return;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String((error as { message?: unknown }).message ?? label)
        : label;
  throw new Error(`${label}: ${message}`);
}

async function fetchPaged<T>(
  client: RecordsSourceClient,
  table: string,
  columns: string,
  configure?: (query: any) => any,
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    let query = client.from(table).select(columns);
    if (configure) query = configure(query);
    const result = await query
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    throwIfError(result.error, `Could not load public ${table} for Records`);

    const page = (result.data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return rows;
}

function canonicalParticipant(row: Participant): Participant {
  return {
    ...row,
    country_id: row.country_id || row.contest_entity_id || "",
  };
}

function canonicalResult(row: ResultRow): ResultRow {
  return {
    ...row,
    country_id: row.country_id || row.contest_entity_id || "",
  };
}

function canonicalJuryVote(row: JuryVote): JuryVote {
  return {
    ...row,
    receiving_country_id:
      row.receiving_country_id || row.receiving_entity_id || "",
  };
}

function editionLabel(edition: Pick<Edition, "edition_number" | "name"> | null) {
  if (!edition) return "Solaris Studio";
  return edition.edition_number == null
    ? edition.name
    : `SSC ${edition.edition_number} · ${edition.name}`;
}

function countFinalEditions(
  results: readonly ResultRow[],
  publicShows: readonly Show[],
) {
  const showById = new Map(publicShows.map((show) => [show.id, show]));
  return new Set(
    results
      .filter((row) => {
        const kind = row.show_id ? showById.get(row.show_id)?.kind : null;
        return kind === "grand-final" || kind === "final";
      })
      .map((row) => row.edition_id),
  ).size;
}

/**
 * Server-owned archive projection for Public V3 Records.
 *
 * Only derived record output crosses the server boundary. The source first
 * limits result and jury reads to shows whose corresponding publication layer
 * is public, then delegates the actual record semantics to
 * buildCanonicalFanRecords, which applies the canonical public archive filter
 * again before calculating records.
 *
 * A second derived projection excludes the canonical current public edition.
 * Spoiler-free clients can therefore render career totals, streaks and record
 * holders without letting a freshly published result leak indirectly through
 * an aggregate record. No client receives raw archive rows.
 */
export async function loadV3RecordsBundle(client: RecordsSourceClient = createConfirmationPublicRuntimeClient() as unknown as RecordsSourceClient): Promise<V3RecordsBundle> {
  let resultCoverage: PublicResultCoverage = { includedShows: 0, unavailableShows: 0 };

  const editions = await fetchPaged<Edition>(
    client,
    "editions",
    EDITION_COLUMNS,
    (query) => query.eq("published", true),
  );
  editions.sort(
    (a, b) =>
      (b.edition_number ?? Number.MIN_SAFE_INTEGER) -
      (a.edition_number ?? Number.MIN_SAFE_INTEGER),
  );

  const latestEdition = editions[0] ?? null;
  const currentEdition = resolveCurrentPublicEdition(editions);
  if (!editions.length) {
    return {
      rolloutEditionSlug: null,
      currentEditionId: null,
      shell: { editionLabel: "Solaris Studio", phaseLabel: "Records" },
      records: [],
      spoilerSafeRecords: [],
      archivedFinalEditions: 0,
      spoilerSafeArchivedFinalEditions: 0,
      currentEditionAffectsRecords: false,
      resultCoverage,
    generatedAt: new Date().toISOString(),
    };
  }

  const editionIds = editions.map((edition) => edition.id);
  const [shows, countries, participants] = await Promise.all([
    fetchPaged<Show>(client, "shows", SHOW_COLUMNS, (query) =>
      query.eq("published", true).in("edition_id", editionIds),
    ),
    fetchPaged<Country>(client, "countries", COUNTRY_COLUMNS),
    fetchPaged<Participant>(client, "participants", PARTICIPANT_COLUMNS, (query) =>
      query.in("edition_id", editionIds),
    ),
  ]);

  const publicShows = shows.filter(isShowPublic);
  const resultShowIds = publicShows
    .filter((show) => resolveShowPublication(show).results === true)
    .map((show) => show.id);
  const snapshots = await loadPublicResultSnapshots(client, resultShowIds);
  const versionedShows = publicShows.filter((show) => snapshots.get(show.id)?.editionId === show.edition_id);
  resultCoverage = { includedShows: versionedShows.length, unavailableShows: resultShowIds.length - versionedShows.length };
  const juryShowIds = versionedShows
    .filter((show) => snapshots.get(show.id)!.availability.detailedVoting)
    .map((show) => show.id);
  const publishedResultVersions = new Map([...snapshots].map(([id, snapshot]) => [id, snapshot.resultVersion]));
  const publishedComponentShowIds = new Set(versionedShows.filter((show) => {
    const availability = snapshots.get(show.id)!.availability;
    return availability.jury && availability.televote;
  }).map((show) => show.id));
  const results = versionedShows.flatMap((show) => snapshots.get(show.id)!.rows);
  const [jury] = await Promise.all([
    juryShowIds.length
      ? fetchPaged<JuryVote>(client, "jury_votes", JURY_COLUMNS, (query) => query.in("show_id", juryShowIds))
      : Promise.resolve([] as JuryVote[]),
  ]);

  const canonicalParticipants = participants
    .map(canonicalParticipant)
    .filter((row) => Boolean(row.country_id));
  const canonicalResults = results
    .map(canonicalResult)
    .filter((row) => Boolean(row.country_id));
  const canonicalJury = jury
    .map(canonicalJuryVote)
    .filter((row) => Boolean(row.receiving_country_id));

  const records = buildCanonicalFanRecords({
    countries,
    editions,
    shows: publicShows,
    participants: canonicalParticipants,
    results: canonicalResults,
    jury: canonicalJury,
    publishedComponentShowIds,
    publishedResultVersions,
  });

  const currentEditionId = currentEdition?.id ?? null;
  const currentEditionAffectsRecords = Boolean(
    currentEditionId &&
      (canonicalResults.some((row) => row.edition_id === currentEditionId) ||
        canonicalJury.some((row) => row.edition_id === currentEditionId)),
  );
  const spoilerSafeEditions = currentEditionId
    ? editions.filter((edition) => edition.id !== currentEditionId)
    : editions;
  const spoilerSafeShows = currentEditionId
    ? publicShows.filter((show) => show.edition_id !== currentEditionId)
    : publicShows;
  const spoilerSafeParticipants = currentEditionId
    ? canonicalParticipants.filter((row) => row.edition_id !== currentEditionId)
    : canonicalParticipants;
  const spoilerSafeResults = currentEditionId
    ? canonicalResults.filter((row) => row.edition_id !== currentEditionId)
    : canonicalResults;
  const spoilerSafeJury = currentEditionId
    ? canonicalJury.filter((row) => row.edition_id !== currentEditionId)
    : canonicalJury;
  const spoilerSafeRecords = currentEditionAffectsRecords
    ? buildCanonicalFanRecords({
        countries,
        editions: spoilerSafeEditions,
        shows: spoilerSafeShows,
        participants: spoilerSafeParticipants,
        results: spoilerSafeResults,
        jury: spoilerSafeJury,
        publishedComponentShowIds,
        publishedResultVersions,
      })
    : records;

  return {
    rolloutEditionSlug: latestEdition?.slug || null,
    currentEditionId,
    shell: {
      editionLabel: editionLabel(latestEdition),
      phaseLabel: "Records",
    },
    records,
    spoilerSafeRecords,
    archivedFinalEditions: countFinalEditions(canonicalResults, publicShows),
    spoilerSafeArchivedFinalEditions: countFinalEditions(
      spoilerSafeResults,
      spoilerSafeShows,
    ),
    currentEditionAffectsRecords,
    resultCoverage,
    generatedAt: new Date().toISOString(),
  };
}
