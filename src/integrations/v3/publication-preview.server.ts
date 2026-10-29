import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  createSolarisAuthenticatedClientServer,
  requireSolarisOrganizerServer,
} from "@/integrations/supabase/organizer.server";
import type { Country, ResultRow } from "@/lib/data";
import { entityDisplayMap, entityKeyOf, type ContestEntityRow } from "@/lib/entities";
import {
  normalisePublicationDependencies,
  resolvePublicationConfig,
  type PublicationConfig,
} from "@/lib/publication";
import {
  buildV3ResultsProjection,
  type V3ResultEntryInput,
  type V3ResultsProjection,
} from "@/lib/v3-results";

const SHOW_COLUMNS =
  "id,edition_id,name,kind,sort_order,status,published,publication_config,updated_at";
const EDITION_COLUMNS = "id,edition_number,name,slug,published";
const RESULT_COLUMNS =
  "id,edition_id,show_id,country_id,contest_entity_id,jury_points,televote_points,total_points,final_rank";
const ENTITY_COLUMNS =
  "id,edition_id,entity_type,country_id,display_name,abbreviation,flag_image,region,historical_identity_override";
const COUNTRY_COLUMNS =
  "id,name,native_name,short_code,flag_image,region,accent_color,description,first_participation";
const RESULT_OPERATION_COLUMNS =
  "show_id,calculation_version,reviewed_version,locked_version,reveal_ready_version";

export type PublicationPreviewSourceVersions = {
  publicationVersion: number;
  showUpdatedAt: string;
  resultVersion: number | null;
};

export type V3AuthoritativePublicationPreview = {
  schemaVersion: 1;
  context: {
    editionId: string;
    editionLabel: string;
    editionSlug: string | null;
    editionPublished: boolean;
    showId: string;
    showName: string;
    showKind: string;
  };
  sourceVersions: PublicationPreviewSourceVersions;
  candidate: {
    targetState: "public";
    publication: PublicationConfig;
    publicShow: {
      id: string;
      editionId: string;
      published: true;
      publicationConfig: PublicationConfig;
    };
  };
  visibility: PublicationConfig;
  discovery: {
    editionPublished: boolean;
    showPublicUnderCandidate: boolean;
    resultsIndexEligible: boolean;
  };
  resultPreview: {
    enabled: boolean;
    sourceVersion: number | null;
    spoilerProtected: V3ResultsProjection;
    revealed: V3ResultsProjection;
  };
  generatedAt: string;
};

type Obj = Record<string, unknown>;

type PublicationPreflight = {
  showId: string;
  editionId: string;
  expectedVersion: number;
  config: PublicationConfig;
  sourceShowUpdatedAt: string;
  sourceResultVersion: number | null;
  hasOutcomes: boolean;
  resultReleaseReady: boolean;
  integrityClear: boolean;
};

type RawParticipant = {
  edition_id: string;
  country_id: string;
  participation_status: string | null;
};

type RawShow = {
  id: string;
  edition_id: string;
  name: string;
  kind: string;
  sort_order: number;
  status: string | null;
  published: boolean;
  publication_config: Record<string, unknown> | null;
  updated_at: string;
};

type RawEdition = {
  id: string;
  edition_number: number | null;
  name: string;
  slug: string | null;
  published: boolean;
};

type RawResultOperation = {
  show_id: string;
  calculation_version: number | null;
  reviewed_version: number | null;
  locked_version: number | null;
  reveal_ready_version: number | null;
};

function asObject(value: unknown, label: string): Obj {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Solaris returned an invalid ${label}.`);
  }
  return value as Obj;
}

function stringValue(value: unknown, label: string) {
  if (typeof value !== "string" || !value) {
    throw new Error(`Solaris returned an invalid ${label}.`);
  }
  return value;
}

function integerValue(value: unknown, label: string) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Solaris returned an invalid ${label}.`);
  }
  return parsed;
}

function nullableInteger(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") return null;
  return integerValue(value, label);
}

function optionalBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function sameInstant(left: string, right: string) {
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  return Number.isFinite(leftMs) && Number.isFinite(rightMs) && leftMs === rightMs;
}

function samePublicationConfig(left: PublicationConfig, right: PublicationConfig) {
  return (
    left.participants === right.participants &&
    left.artists === right.artists &&
    left.songs === right.songs &&
    left.semi_split === right.semi_split &&
    left.running_order === right.running_order &&
    left.qualifiers === right.qualifiers &&
    left.results === right.results &&
    left.jury_results === right.jury_results &&
    left.televote_results === right.televote_results &&
    left.detailed_voting === right.detailed_voting
  );
}

function editionLabel(edition: RawEdition) {
  return edition.edition_number == null
    ? edition.name
    : `SSC ${edition.edition_number} · ${edition.name}`;
}

function parsePreflight(value: unknown): PublicationPreflight {
  const row = asObject(value, "Publication preflight");
  const config = resolvePublicationConfig(asObject(row.config, "Publication config"));
  const hasOutcomesFallback =
    config.qualifiers ||
    config.results ||
    config.jury_results ||
    config.televote_results ||
    config.detailed_voting;
  return {
    showId: stringValue(row.showId, "Publication Show id"),
    editionId: stringValue(row.editionId, "Publication Edition id"),
    expectedVersion: integerValue(row.expectedVersion, "Publication version"),
    config,
    sourceShowUpdatedAt: stringValue(
      row.sourceShowUpdatedAt,
      "Publication Show source version",
    ),
    sourceResultVersion: nullableInteger(
      row.sourceResultVersion,
      "Publication Result source version",
    ),
    hasOutcomes: optionalBoolean(row.hasOutcomes, hasOutcomesFallback),
    resultReleaseReady: optionalBoolean(row.resultReleaseReady, true),
    integrityClear: optionalBoolean(row.integrityClear, true),
  };
}

function filterNonCompetingRows(
  rows: readonly ResultRow[],
  participants: readonly RawParticipant[],
) {
  const excluded = new Set(
    participants
      .filter(
        (participant) =>
          participant.participation_status === "withdrawn" ||
          participant.participation_status === "disqualified",
      )
      .map((participant) => `${participant.edition_id}:${participant.country_id}`),
  );
  if (!excluded.size) return [...rows];
  return rows.filter((row) => !excluded.has(`${row.edition_id}:${row.country_id}`));
}

function buildResultRows(input: {
  rows: readonly ResultRow[];
  entities: readonly ContestEntityRow[];
  countries: readonly Country[];
  publication: PublicationConfig;
}): V3ResultEntryInput[] {
  const displayMap = entityDisplayMap(input.entities, input.countries);
  return input.rows.flatMap((row) => {
    const display = displayMap.get(entityKeyOf(row));
    if (!display || row.final_rank == null || row.final_rank <= 0) return [];
    return [{
      countryId: display.id,
      canonicalCountryId: row.country_id,
      countryName: display.name,
      flagUrl: display.flag_image,
      rank: row.final_rank,
      points: row.total_points,
      juryPoints: input.publication.jury_results ? row.jury_points : null,
      televotePoints: input.publication.televote_results ? row.televote_points : null,
    } satisfies V3ResultEntryInput];
  });
}

function buildResultProjection(input: {
  edition: RawEdition;
  show: RawShow;
  publication: PublicationConfig;
  rows: readonly V3ResultEntryInput[];
  disclosure: "withheld" | "revealed";
}) {
  const resultsIndexEligible =
    input.edition.published &&
    (input.show.kind === "grand-final" || input.show.kind === "final") &&
    input.publication.results;
  return buildV3ResultsProjection({
    editionId: input.edition.id,
    editionName: editionLabel(input.edition),
    showId: input.show.id,
    showName: input.show.name,
    publication: resultsIndexEligible ? "published" : "hidden",
    disclosure: input.disclosure,
    rows: input.rows,
    juryPublished: resultsIndexEligible && input.publication.jury_results,
    televotePublished: resultsIndexEligible && input.publication.televote_results,
    userDelegationCountryId: null,
    resultTools: [],
    advancedTools: [],
  });
}

function assertExactResultOperation(
  operation: RawResultOperation | null,
  expectedVersion: number,
) {
  const exactVersion = Number(operation?.calculation_version ?? 0);
  if (
    !Number.isSafeInteger(exactVersion) ||
    exactVersion <= 0 ||
    exactVersion !== expectedVersion ||
    Number(operation?.reviewed_version ?? -1) !== exactVersion ||
    Number(operation?.locked_version ?? -1) !== exactVersion ||
    Number(operation?.reveal_ready_version ?? -1) !== exactVersion
  ) {
    throw new Error(
      "Result version changed while Publication preview was loading. Reload before continuing.",
    );
  }
}

async function loadResultOperation(showId: string) {
  const result = await (supabaseAdmin as any)
    .from("studio2_result_operations")
    .select(RESULT_OPERATION_COLUMNS)
    .eq("show_id", showId)
    .maybeSingle();
  if (result.error) throw result.error;
  return (result.data ?? null) as RawResultOperation | null;
}

async function loadAuthorizedPreflight(input: {
  editionId: string;
  showId: string;
  expectedPublicationVersion: number;
  config: PublicationConfig;
}) {
  // Global Organizer identity is required before any privileged read is even
  // attempted. Exact Publication authority is then revalidated by the canonical
  // governed preflight under the caller's bearer token, not a service role.
  await requireSolarisOrganizerServer();
  const authenticated = createSolarisAuthenticatedClientServer() as any;
  const { data, error } = await authenticated.rpc(
    "studio2_show_publication_change_preview",
    {
      p_show_id: input.showId,
      p_target_state: "public",
      p_config: input.config,
      p_scheduled_for: null,
    },
  );
  if (error) throw error;

  const preflight = parsePreflight(data);
  if (
    preflight.showId !== input.showId ||
    preflight.editionId !== input.editionId
  ) {
    throw new Error("Publication preview scope changed. Reload before continuing.");
  }
  if (preflight.expectedVersion !== input.expectedPublicationVersion) {
    throw new Error(
      "Publication changed since this preview was requested. Reload before continuing.",
    );
  }

  const requestedConfig = normalisePublicationDependencies(
    resolvePublicationConfig(input.config),
  );
  if (!samePublicationConfig(preflight.config, requestedConfig)) {
    throw new Error(
      "Canonical Publication preflight did not accept the reviewed candidate config. Reload before continuing.",
    );
  }
  if (!preflight.integrityClear) {
    throw new Error(
      "Publication preview is blocked by an unresolved integrity incident.",
    );
  }
  if (preflight.hasOutcomes && !preflight.resultReleaseReady) {
    throw new Error(
      "Publication preview cannot expose outcomes before the exact Result version is release-ready.",
    );
  }
  return preflight;
}

/**
 * Organizer-only shadow projection for one reviewed candidate Publication.
 *
 * This never changes Show/publication state. The existing governed Publication
 * preflight remains the authorization, normalization and source-version owner;
 * privileged reads happen only after that exact preflight succeeds. The
 * returned candidate public Show and Results projections are render inputs,
 * not a second publication authority.
 */
export async function loadV3AuthoritativePublicationPreview(input: {
  editionId: string;
  showId: string;
  expectedPublicationVersion: number;
  config: PublicationConfig;
}): Promise<V3AuthoritativePublicationPreview> {
  const preflight = await loadAuthorizedPreflight(input);

  const [editionResult, showResult] = await Promise.all([
    (supabaseAdmin as any)
      .from("editions")
      .select(EDITION_COLUMNS)
      .eq("id", input.editionId)
      .maybeSingle(),
    (supabaseAdmin as any)
      .from("shows")
      .select(SHOW_COLUMNS)
      .eq("id", input.showId)
      .eq("edition_id", input.editionId)
      .maybeSingle(),
  ]);
  if (editionResult.error) throw editionResult.error;
  if (showResult.error) throw showResult.error;
  if (!editionResult.data || !showResult.data) {
    throw new Error(
      "Publication preview scope no longer exists. Reload before continuing.",
    );
  }

  const edition = editionResult.data as RawEdition;
  const show = showResult.data as RawShow;
  if (!sameInstant(show.updated_at, preflight.sourceShowUpdatedAt)) {
    throw new Error(
      "Show content changed while Publication preview was loading. Reload before continuing.",
    );
  }

  const publication = preflight.config;
  const sourceResultVersion = preflight.hasOutcomes
    ? preflight.sourceResultVersion
    : null;
  let resultRows: V3ResultEntryInput[] = [];

  if (preflight.hasOutcomes) {
    if (sourceResultVersion == null || sourceResultVersion <= 0) {
      throw new Error(
        "Publication preview is missing its exact Result source version.",
      );
    }
    assertExactResultOperation(
      await loadResultOperation(input.showId),
      sourceResultVersion,
    );
  }

  if (publication.results) {
    const [resultsResult, participantsResult, entitiesResult] = await Promise.all([
      (supabaseAdmin as any)
        .from("results")
        .select(RESULT_COLUMNS)
        .eq("show_id", input.showId)
        .not("final_rank", "is", null)
        .order("final_rank", { ascending: true }),
      (supabaseAdmin as any)
        .from("participants")
        .select("edition_id,country_id,participation_status")
        .eq("edition_id", input.editionId),
      (supabaseAdmin as any)
        .from("contest_entities")
        .select(ENTITY_COLUMNS)
        .eq("edition_id", input.editionId),
    ]);

    for (const [result, label] of [
      [resultsResult, "Result rows"],
      [participantsResult, "participant state"],
      [entitiesResult, "result identities"],
    ] as const) {
      if (result.error) {
        throw new Error(
          `Could not load Publication preview ${label}: ${result.error.message ?? String(result.error)}`,
        );
      }
    }

    const participants = (participantsResult.data ?? []) as RawParticipant[];
    const rows = filterNonCompetingRows(
      (resultsResult.data ?? []) as ResultRow[],
      participants,
    );
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
      const countriesResult = await (supabaseAdmin as any)
        .from("countries")
        .select(COUNTRY_COLUMNS)
        .in("id", [...countryIds]);
      if (countriesResult.error) throw countriesResult.error;
      countries = (countriesResult.data ?? []) as Country[];
    }

    resultRows = buildResultRows({
      rows,
      entities,
      countries,
      publication,
    });

    // A second exact-version read closes the race between the preflight and the
    // multi-query render snapshot. Result versions are monotonic, so observing
    // the same release-ready version on both sides proves no calculation cutover
    // occurred while this preview assembled its rows.
    if (sourceResultVersion == null) {
      throw new Error("Publication Result source version disappeared.");
    }
    assertExactResultOperation(
      await loadResultOperation(input.showId),
      sourceResultVersion,
    );
  }

  const spoilerProtected = buildResultProjection({
    edition,
    show,
    publication,
    rows: resultRows,
    disclosure: "withheld",
  });
  const revealed = buildResultProjection({
    edition,
    show,
    publication,
    rows: resultRows,
    disclosure: "revealed",
  });
  const showPublicUnderCandidate = Object.values(publication).some(Boolean);
  const resultsIndexEligible =
    edition.published &&
    (show.kind === "grand-final" || show.kind === "final") &&
    publication.results;

  return {
    schemaVersion: 1,
    context: {
      editionId: edition.id,
      editionLabel: editionLabel(edition),
      editionSlug: edition.slug,
      editionPublished: edition.published,
      showId: show.id,
      showName: show.name,
      showKind: show.kind,
    },
    sourceVersions: {
      publicationVersion: preflight.expectedVersion,
      showUpdatedAt: preflight.sourceShowUpdatedAt,
      resultVersion: sourceResultVersion,
    },
    candidate: {
      targetState: "public",
      publication,
      publicShow: {
        id: show.id,
        editionId: edition.id,
        published: true,
        publicationConfig: publication,
      },
    },
    visibility: publication,
    discovery: {
      editionPublished: edition.published,
      showPublicUnderCandidate,
      resultsIndexEligible,
    },
    resultPreview: {
      enabled: resultsIndexEligible,
      sourceVersion: sourceResultVersion,
      spoilerProtected,
      revealed,
    },
    generatedAt: new Date().toISOString(),
  };
}
