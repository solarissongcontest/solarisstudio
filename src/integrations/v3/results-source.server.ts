import { loadPublicResultSnapshots, loadPublicResultSnapshotHeaders, type PublicResultCoverage } from "@/lib/v3-public-result-snapshots";
import { createConfirmationPublicRuntimeClient } from "@/integrations/confirmations/public-runtime.server";
import type { Country, Edition, ResultRow, Show } from "@/lib/data";
import { entityDisplayMap, entityKeyOf, type ContestEntityRow } from "@/lib/entities";
import { isShowPublic, resolveShowPublication } from "@/lib/publication";
import type {
  V3ResultProjectionInput,
  V3ResultShowOption,
} from "@/lib/v3-results";

const EDITION_COLUMNS = "id,edition_number,name,slug,published";
const SHOW_COLUMNS =
  "id,edition_id,name,kind,sort_order,status,published,qualifier_count,theme_id,voting_config,broadcast_config,publication_config";
const ENTITY_COLUMNS =
  "id,edition_id,entity_type,country_id,display_name,abbreviation,flag_image,region,historical_identity_override";
const COUNTRY_COLUMNS =
  "id,name,native_name,short_code,flag_image,region,accent_color,description,first_participation";

type ResultsSourceClient = {
  from(table: string): any;
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{
    data: unknown;
    error: unknown;
  }>;
};

export type V3ResultsServerBundle = {
  editionSlug: string | null;
  options: V3ResultShowOption[];
  shell: {
    editionLabel: string;
    phaseLabel: string | null;
  };
  input: V3ResultProjectionInput;
  countries: Country[];
  resultCoverage?: PublicResultCoverage;
  generatedAt: string;
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

function editionLabel(edition: Pick<Edition, "edition_number" | "name"> | null) {
  if (!edition) return "Solaris Studio";
  return edition.edition_number == null
    ? edition.name
    : `SSC ${edition.edition_number} · ${edition.name}`;
}

function emptyInput(edition: Pick<Edition, "id" | "name" | "edition_number"> | null): V3ResultProjectionInput {
  return {
    editionId: edition?.id ?? "",
    editionName: editionLabel(edition),
    showId: "",
    showName: "",
    publication: "hidden",
    disclosure: "withheld",
    rows: [],
    juryPublished: false,
    televotePublished: false,
    userDelegationCountryId: null,
    resultTools: [],
    advancedTools: [],
  };
}

/**
 * Narrow, publication-gated source for the installed-app Results root.
 *
 * Discovery returns only published edition/final-show metadata. The browser may
 * nominate one show id from that archive, but the source revalidates the id
 * against canonical public result publication before performing larger reads.
 * Result rows, participant state and historical identity remain scoped to one
 * server-approved edition/show at a time.
 */
export async function loadV3ResultsBundle(
  requestedShowId?: string | null,
  client: ResultsSourceClient = createConfirmationPublicRuntimeClient() as unknown as ResultsSourceClient,
): Promise<V3ResultsServerBundle> {
  let resultCoverage: PublicResultCoverage = { includedShows: 0, unavailableShows: 0 };

  const editionsResult = await client
    .from("editions")
    .select(EDITION_COLUMNS)
    .eq("published", true)
    .order("edition_number", { ascending: false });
  throwIfError(editionsResult.error, "Could not load public Solaris editions for Results");

  const editions = (editionsResult.data ?? []) as Edition[];
  const latestPublicEdition = editions[0] ?? null;
  if (!editions.length) {
    return {
      editionSlug: null,
      options: [],
      shell: { editionLabel: "Solaris Studio", phaseLabel: null },
      input: emptyInput(null),
      countries: [],
      resultCoverage,
      generatedAt: new Date().toISOString(),
    };
  }

  const editionById = new Map(editions.map((edition) => [edition.id, edition]));
  const editionOrder = new Map(
    editions.map((edition, index) => [edition.id, edition.edition_number ?? -index - 1]),
  );
  const showsResult = await client
    .from("shows")
    .select(SHOW_COLUMNS)
    .eq("published", true)
    .in("edition_id", editions.map((edition) => edition.id))
    .in("kind", ["grand-final", "final"]);
  throwIfError(showsResult.error, "Could not load public final shows for Results");

  const candidateShows = ((showsResult.data ?? []) as Show[])
    .filter((show) => isShowPublic(show) && resolveShowPublication(show).results)
    .sort((a, b) => {
      const editionDifference =
        (editionOrder.get(b.edition_id) ?? Number.MIN_SAFE_INTEGER) -
        (editionOrder.get(a.edition_id) ?? Number.MIN_SAFE_INTEGER);
      if (editionDifference !== 0) return editionDifference;
      const aGrandFinal = a.kind === "grand-final";
      const bGrandFinal = b.kind === "grand-final";
      if (aGrandFinal !== bGrandFinal) return aGrandFinal ? -1 : 1;
      return b.sort_order - a.sort_order || a.id.localeCompare(b.id);
    });

  const snapshots = await loadPublicResultSnapshotHeaders(client, candidateShows.map((show) => show.id));
  const resultShows = candidateShows.filter((show) => {
    const snapshot = snapshots.get(show.id);
    return snapshot?.editionId === show.edition_id;
  });

  resultCoverage = { includedShows: resultShows.length, unavailableShows: candidateShows.length - resultShows.length };

  const options = resultShows.flatMap((show) => {
    const edition = editionById.get(show.edition_id);
    if (!edition?.slug) return [];
    return [{
      id: show.id,
      name: show.name,
      kind: show.kind,
      editionId: edition.id,
      editionName: editionLabel(edition),
      editionSlug: edition.slug,
      editionNumber: edition.edition_number ?? null,
    } satisfies V3ResultShowOption];
  });

  const selectedShow =
    resultShows.find((show) => show.id === requestedShowId) ?? resultShows[0] ?? null;
  const selectedEdition = selectedShow
    ? editionById.get(selectedShow.edition_id) ?? null
    : latestPublicEdition;

  if (!selectedShow || !selectedEdition) {
    return {
      editionSlug: selectedEdition?.slug ?? null,
      options,
      shell: { editionLabel: editionLabel(selectedEdition), phaseLabel: null },
      input: emptyInput(selectedEdition),
      countries: [],
      resultCoverage,
      generatedAt: new Date().toISOString(),
    };
  }

  const snapshot = (await loadPublicResultSnapshots(client, [selectedShow.id])).get(selectedShow.id);
  if (!snapshot || snapshot.editionId !== selectedEdition.id
      || snapshot.resultVersion !== snapshots.get(selectedShow.id)!.resultVersion
      || snapshot.publicationVersion !== snapshots.get(selectedShow.id)!.publicationVersion) {
    throw new Error("Published results changed during this read. Refresh to load the current publication.");
  }
  const [entitiesResult] = await Promise.all([
    client
      .from("contest_entities")
      .select(ENTITY_COLUMNS)
      .eq("edition_id", selectedEdition.id),
  ]);
  throwIfError(entitiesResult.error, "Could not load public result identities");

  const rows = snapshot.rows;
  const entities = (entitiesResult.data ?? []) as ContestEntityRow[];

  const countryIds = new Set<string>();
  for (const entity of entities) {
    if (entity.country_id) countryIds.add(entity.country_id);
  }
  for (const row of rows) {
    if (row.country_id) countryIds.add(row.country_id);
  }

  let countries: Country[] = [];
  if (countryIds.size) {
    const countriesResult = await client
      .from("countries")
      .select(COUNTRY_COLUMNS)
      .in("id", [...countryIds]);
    throwIfError(countriesResult.error, "Could not load public country identities for Results");
    countries = (countriesResult.data ?? []) as Country[];
  }

  const publication = { jury_results: snapshot.availability.jury, televote_results: snapshot.availability.televote };
  const displayMap = entityDisplayMap(entities, countries);
  const resultCountries = new Map<string, Country>();
  const projectedRows = rows.flatMap((row) => {
    const display = displayMap.get(entityKeyOf(row));
    if (!display || row.final_rank == null || row.final_rank <= 0) return [];
    const country: Country = {
      id: display.id,
      name: display.name,
      native_name: display.native_name,
      short_code: display.short_code,
      flag_image: display.flag_image,
      region: display.region,
      accent_color: display.accent_color,
      description: display.description,
      first_participation: display.first_participation,
    };
    resultCountries.set(display.id, country);
    return [{
      countryId: display.id,
      canonicalCountryId: row.country_id,
      countryName: display.name,
      flagUrl: display.flag_image,
      rank: row.final_rank,
      points: row.total_points,
      juryPoints: publication.jury_results === true ? row.jury_points : null,
      televotePoints: publication.televote_results === true ? row.televote_points : null,
    }];
  });

  return {
    editionSlug: selectedEdition.slug,
    options,
    shell: {
      editionLabel: editionLabel(selectedEdition),
      phaseLabel: "Results",
    },
    input: {
      editionId: selectedEdition.id,
      editionName: editionLabel(selectedEdition),
      showId: selectedShow.id,
      showName: selectedShow.name,
      publication: "published",
      disclosure: "withheld",
      rows: projectedRows,
      juryPublished: publication.jury_results === true,
      televotePublished: publication.televote_results === true,
      userDelegationCountryId: null,
      resultTools: [{ key: "scorecharts", label: "Full scorecharts", href: "/scorecharts" }],
      advancedTools: [
        { key: "analysis", label: "Analysis", href: "/analysis" },
        { key: "records", label: "Records", href: "/records" },
        { key: "relationships", label: "Voting relationships", href: "/relationships" },
        { key: "lab", label: "Result Lab", href: "/result-lab" },
        {
          key: "broadcast-intelligence",
          label: "Broadcast Intelligence",
          href: "/broadcast-intelligence",
        },
      ],
    },
    countries: [...resultCountries.values()],
    resultCoverage,
    generatedAt: new Date().toISOString(),
  };
}

/** Backward-compatible latest-result loader for non-interactive server callers. */
export async function loadLatestV3ResultsBundle(): Promise<V3ResultsServerBundle> {
  return loadV3ResultsBundle(null);
}
