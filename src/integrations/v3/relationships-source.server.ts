import { loadPublicResultSnapshots, type PublicResultSnapshotClient, type PublicResultCoverage } from "@/lib/v3-public-result-snapshots";
import { createConfirmationPublicRuntimeClient } from "@/integrations/confirmations/public-runtime.server";
import { computeCanonicalHeadToHead } from "@/lib/canonical-head-to-head";
import type {
  Country,
  Edition,
  JuryVote,
  Participant,
  ResultRow,
  Show,
  Televote,
} from "@/lib/data";
import { buildPublicCountryArchive } from "@/lib/public-country-archive";
import { isShowPublic, resolveShowPublication } from "@/lib/publication";
import { computeRelationship } from "@/lib/stats";
import type {
  V3RelationshipCountry,
  V3RelationshipDetailBundle,
  V3RelationshipPairSummary,
  V3RelationshipsIndexBundle,
} from "@/lib/v3-relationships";

const PAGE_SIZE = 1000;
const EDITION_COLUMNS =
  "id,edition_number,name,year,slug,status,published";
const SHOW_COLUMNS =
  "id,edition_id,name,kind,sort_order,status,published,qualifier_count,theme_id,voting_config,broadcast_config,publication_config";
const COUNTRY_COLUMNS =
  "id,name,native_name,short_code,flag_image,region,accent_color,description,first_participation";
const PARTICIPANT_COLUMNS =
  "id,edition_id,show_id,country_id,contest_entity_id,artist,song,running_order,semi_final,qualified,notes,publication_status,scheduled_publish_at,participation_status";
const JURY_COLUMNS =
  "id,edition_id,show_id,voter_country_id,voter_id,voter_entity_id,receiving_country_id,receiving_entity_id,points";
const TELEVOTE_COLUMNS =
  "id,edition_id,show_id,country_id,contest_entity_id,points";

type RelationshipsSourceClient = PublicResultSnapshotClient & {
  from(table: string): any;
};

type SafeRelationshipArchive = ReturnType<typeof buildPublicCountryArchive> & {
  resultCoverage: PublicResultCoverage;
  countries: Country[];
  publishedResultVersions?: ReadonlyMap<string, number>;
  latestEdition: Edition | null;
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
  client: RelationshipsSourceClient,
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
    throwIfError(result.error, `Could not load public ${table} for Relationships`);
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
    voter_country_id: row.voter_country_id || row.voter_entity_id || "",
    receiving_country_id:
      row.receiving_country_id || row.receiving_entity_id || "",
  };
}

function canonicalTelevote(row: Televote): Televote {
  return {
    ...row,
    country_id: row.country_id || row.contest_entity_id || "",
  };
}

function editionLabel(edition: Pick<Edition, "edition_number" | "name"> | null) {
  if (!edition) return "Solaris Studio";
  return edition.edition_number == null
    ? edition.name
    : `SSC ${edition.edition_number} · ${edition.name}`;
}

function relationshipCountry(country: Country): V3RelationshipCountry {
  return {
    id: country.id,
    name: country.name,
    shortCode: country.short_code,
    flagImage: country.flag_image,
    accentColor: country.accent_color,
  };
}

function pairParam(a: Country, b: Country) {
  return `${a.short_code}-vs-${b.short_code}`.toUpperCase();
}

async function loadSafeArchive(includeTelevote: boolean, client: RelationshipsSourceClient): Promise<SafeRelationshipArchive> {

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
  if (!editions.length) {
    return {
      editions: [],
      shows: [],
      participants: [],
      results: [],
      jury: [],
      televote: [],
      countries: [],
      latestEdition: null,
      resultCoverage: { includedShows: 0, unavailableShows: 0 },
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
  const publishedResultVersions = new Map([...snapshots].map(([id, snapshot]) => [id, snapshot.resultVersion]));
  const versionedShows = publicShows.filter((show) => snapshots.get(show.id)?.editionId === show.edition_id);
  const detailedShowIds = versionedShows
    .filter((show) => snapshots.get(show.id)!.availability.detailedVoting)
    .map((show) => show.id);
  const results = versionedShows.flatMap((show) => snapshots.get(show.id)!.rows);
  const [jury, televote] = await Promise.all([
    detailedShowIds.length
      ? fetchPaged<JuryVote>(client, "jury_votes", JURY_COLUMNS, (query) => query.in("show_id", detailedShowIds))
      : Promise.resolve([] as JuryVote[]),
    includeTelevote && detailedShowIds.length
      ? fetchPaged<Televote>(client, "televote_votes", TELEVOTE_COLUMNS, (query) => query.in("show_id", detailedShowIds))
      : Promise.resolve([] as Televote[]),
  ]);

  const safe = buildPublicCountryArchive({
    editions,
    shows: publicShows,
    participants: participants
      .map(canonicalParticipant)
      .filter((row) => Boolean(row.country_id)),
    results: results.map(canonicalResult).filter((row) => Boolean(row.country_id)),
    publishedResultVersions,
    jury: jury
      .map(canonicalJuryVote)
      .filter(
        (row) => Boolean(row.voter_country_id && row.receiving_country_id),
      ),
    televote: televote
      .map(canonicalTelevote)
      .filter((row) => Boolean(row.country_id)),
  });

  return {
    ...safe,
    resultCoverage: { includedShows: versionedShows.length, unavailableShows: resultShowIds.length - versionedShows.length },
    publishedResultVersions,
    countries,
    latestEdition,
  };
}

function sharedEditionSets(participants: readonly Participant[]) {
  const map = new Map<string, Set<string>>();
  for (const participant of participants) {
    const set = map.get(participant.country_id) ?? new Set<string>();
    set.add(participant.edition_id);
    map.set(participant.country_id, set);
  }
  return map;
}

export async function loadV3RelationshipsIndexBundle(client: RelationshipsSourceClient = createConfirmationPublicRuntimeClient() as unknown as RelationshipsSourceClient): Promise<V3RelationshipsIndexBundle> {
  const archive = await loadSafeArchive(false, client);
  const countryMap = new Map(archive.countries.map((country) => [country.id, country]));
  const editionSets = sharedEditionSets(archive.participants);
  const participatingCountries = [...editionSets.keys()]
    .map((id) => countryMap.get(id))
    .filter((country): country is Country => Boolean(country))
    .sort((a, b) => a.name.localeCompare(b.name));

  const pairs: V3RelationshipPairSummary[] = [];
  for (let i = 0; i < participatingCountries.length; i += 1) {
    for (let j = i + 1; j < participatingCountries.length; j += 1) {
      const a = participatingCountries[i]!;
      const b = participatingCountries[j]!;
      const aEditions = editionSets.get(a.id);
      const bEditions = editionSets.get(b.id);
      if (!aEditions || !bEditions) continue;
      const sharedEditions = [...aEditions].filter((id) => bEditions.has(id)).length;
      if (!sharedEditions) continue;

      const relationship = computeRelationship(a.id, b.id, {
        editions: archive.editions,
        jury: archive.jury,
        results: archive.results,
        shows: archive.shows,
      });
      pairs.push({
        key: [a.id, b.id].sort().join("|"),
        pairParam: pairParam(a, b),
        a: relationshipCountry(a),
        b: relationshipCountry(b),
        sharedEditions,
        friendshipScore: relationship.friendshipScore,
        rivalryScore: relationship.rivalryScore,
        reciprocityScore: relationship.reciprocityScore,
        normalizedAtoB: relationship.normalizedAtoB,
        normalizedBtoA: relationship.normalizedBtoA,
        oneSidedGap: Math.abs(
          relationship.normalizedAtoB - relationship.normalizedBtoA,
        ),
      });
    }
  }

  return {
    rolloutEditionSlug: archive.latestEdition?.slug ?? null,
    shell: {
      editionLabel: editionLabel(archive.latestEdition),
      phaseLabel: "Relationships",
    },
    pairs,
    resultCoverage: archive.resultCoverage,
    generatedAt: new Date().toISOString(),
  };
}

export async function loadV3RelationshipDetailBundle(
  pair: string,
  client: RelationshipsSourceClient = createConfirmationPublicRuntimeClient() as unknown as RelationshipsSourceClient,
): Promise<V3RelationshipDetailBundle> {
  const archive = await loadSafeArchive(true, client);
  const [codeA, codeB] = pair.trim().toUpperCase().split("-VS-");
  if (!codeA || !codeB || codeA === codeB) return null;

  const a = archive.countries.find(
    (country) => country.short_code.toUpperCase() === codeA,
  );
  const b = archive.countries.find(
    (country) => country.short_code.toUpperCase() === codeB,
  );
  if (!a || !b) return null;

  const relationship = computeRelationship(a.id, b.id, {
    editions: archive.editions,
    jury: archive.jury,
    results: archive.results,
    shows: archive.shows,
  });
  const headToHead = computeCanonicalHeadToHead(a.id, b.id, {
    editions: archive.editions,
    shows: archive.shows,
    participants: archive.participants,
    results: archive.results,
    jury: archive.jury,
    televote: archive.televote,
    publishedResultVersions: archive.publishedResultVersions,
  });

  const aEditions = new Set(
    archive.participants
      .filter((participant) => participant.country_id === a.id)
      .map((participant) => participant.edition_id),
  );
  const sharedEditionIds = new Set(
    archive.participants
      .filter(
        (participant) =>
          participant.country_id === b.id && aEditions.has(participant.edition_id),
      )
      .map((participant) => participant.edition_id),
  );
  const sharedEditions = archive.editions
    .filter((edition) => sharedEditionIds.has(edition.id))
    .sort(
      (x, y) =>
        (y.edition_number ?? Number.MIN_SAFE_INTEGER) -
        (x.edition_number ?? Number.MIN_SAFE_INTEGER),
    )
    .map((edition) => ({
      id: edition.id,
      slug: edition.slug,
      label: editionLabel(edition),
      editionNumber: edition.edition_number,
    }));

  return {
    rolloutEditionSlug: archive.latestEdition?.slug ?? null,
    shell: {
      editionLabel: editionLabel(archive.latestEdition),
      phaseLabel: "Relationships",
    },
    a: relationshipCountry(a),
    b: relationshipCountry(b),
    relationship,
    headToHead,
    sharedEditions,
    resultCoverage: archive.resultCoverage,
    generatedAt: new Date().toISOString(),
  };
}
