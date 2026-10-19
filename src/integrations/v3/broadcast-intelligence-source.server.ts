import { createConfirmationPublicRuntimeClient } from "@/integrations/confirmations/public-runtime.server";
import {
  broadcastEntriesFromResults,
  buildBroadcastIntelligence,
} from "@/lib/broadcast-intelligence";
import type { Country, Edition, ResultRow, Show } from "@/lib/data";
import { entityDisplayMap, entityKeyOf, type ContestEntityRow } from "@/lib/entities";
import { isShowPublic, resolveShowPublication } from "@/lib/publication";
import type {
  V3BroadcastIdentity,
  V3BroadcastIntelligenceBundle,
  V3BroadcastShowOption,
} from "@/lib/v3-broadcast-intelligence";

const EDITION_COLUMNS = "id,edition_number,name,slug,published";
const SHOW_COLUMNS =
  "id,edition_id,name,kind,sort_order,status,published,publication_config";
const RESULT_COLUMNS =
  "id,edition_id,show_id,country_id,contest_entity_id,jury_points,televote_points,total_points,final_rank";
const ENTITY_COLUMNS =
  "id,edition_id,entity_type,country_id,display_name,abbreviation,flag_image,region,historical_identity_override";
const COUNTRY_COLUMNS =
  "id,name,native_name,short_code,flag_image,region,accent_color,description,first_participation";

type BroadcastSourceClient = {
  from(table: string): any;
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{
    data: unknown;
    error: unknown;
  }>;
};

type PublicParticipantState = {
  edition_id: string;
  country_id: string;
  participation_status?: string | null;
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

function emptyIntelligence() {
  return buildBroadcastIntelligence([]);
}

function parseParticipantStates(value: unknown): PublicParticipantState[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return [];
    }
    const row = candidate as Record<string, unknown>;
    if (
      typeof row.edition_id !== "string" ||
      typeof row.country_id !== "string"
    ) {
      return [];
    }
    return [
      {
        edition_id: row.edition_id,
        country_id: row.country_id,
        participation_status:
          typeof row.participation_status === "string"
            ? row.participation_status
            : null,
      },
    ];
  });
}

function filterNonCompetingRows(
  rows: readonly ResultRow[],
  participants: readonly PublicParticipantState[],
) {
  const excluded = new Set(
    participants
      .filter(
        (participant) =>
          participant.participation_status === "withdrawn" ||
          participant.participation_status === "disqualified",
      )
      .map(
        (participant) =>
          `${participant.edition_id}:${participant.country_id}`,
      ),
  );
  if (!excluded.size) return [...rows];
  return rows.filter(
    (row) => !excluded.has(`${row.edition_id}:${row.country_id}`),
  );
}

/**
 * Publication-safe, show-scoped source for Broadcast Intelligence.
 *
 * The browser may nominate a public show id, but this source first rebuilds the
 * eligible show list from canonical publication state. An unpublished or
 * partially published show can therefore never be unlocked by client input.
 */
export async function loadV3BroadcastIntelligenceBundle(
  requestedShowId?: string | null,
): Promise<V3BroadcastIntelligenceBundle> {
  const client = createConfirmationPublicRuntimeClient() as unknown as BroadcastSourceClient;

  const editionsResult = await client
    .from("editions")
    .select(EDITION_COLUMNS)
    .eq("published", true)
    .order("edition_number", { ascending: false });
  throwIfError(
    editionsResult.error,
    "Could not load public editions for Broadcast Intelligence",
  );

  const editions = (editionsResult.data ?? []) as Edition[];
  const latestEdition = editions[0] ?? null;
  if (!editions.length) {
    return {
      rolloutEditionSlug: null,
      shell: {
        editionLabel: "Solaris Studio",
        phaseLabel: "Broadcast Intelligence",
      },
      options: [],
      selectedShowId: null,
      entries: [],
      intelligence: emptyIntelligence(),
      identities: [],
      generatedAt: new Date().toISOString(),
    };
  }

  const editionMap = new Map(editions.map((edition) => [edition.id, edition]));
  const editionOrder = new Map(
    editions.map((edition, index) => [
      edition.id,
      edition.edition_number ?? -index - 1,
    ]),
  );

  const showsResult = await client
    .from("shows")
    .select(SHOW_COLUMNS)
    .eq("published", true)
    .in(
      "edition_id",
      editions.map((edition) => edition.id),
    );
  throwIfError(
    showsResult.error,
    "Could not load public shows for Broadcast Intelligence",
  );

  const eligibleShows = ((showsResult.data ?? []) as Show[])
    .filter((show) => {
      if (!isShowPublic(show)) return false;
      const publication = resolveShowPublication(show);
      return (
        publication.results === true &&
        publication.jury_results === true &&
        publication.televote_results === true
      );
    })
    .sort((a, b) => {
      const editionDifference =
        (editionOrder.get(b.edition_id) ?? Number.MIN_SAFE_INTEGER) -
        (editionOrder.get(a.edition_id) ?? Number.MIN_SAFE_INTEGER);
      if (editionDifference !== 0) return editionDifference;
      return a.sort_order - b.sort_order || a.id.localeCompare(b.id);
    });

  const options = eligibleShows.flatMap((show) => {
    const edition = editionMap.get(show.edition_id);
    if (!edition?.slug) return [];
    return [
      {
        id: show.id,
        name: show.name,
        kind: show.kind,
        editionId: edition.id,
        editionName: editionLabel(edition),
        editionSlug: edition.slug,
        editionNumber: edition.edition_number ?? null,
      } satisfies V3BroadcastShowOption,
    ];
  });

  const selectedShow =
    eligibleShows.find((show) => show.id === requestedShowId) ??
    eligibleShows[0] ??
    null;
  const selectedEdition = selectedShow
    ? editionMap.get(selectedShow.edition_id) ?? null
    : latestEdition;

  if (!selectedShow || !selectedEdition) {
    return {
      rolloutEditionSlug: selectedEdition?.slug ?? null,
      shell: {
        editionLabel: editionLabel(selectedEdition),
        phaseLabel: "Broadcast Intelligence",
      },
      options,
      selectedShowId: null,
      entries: [],
      intelligence: emptyIntelligence(),
      identities: [],
      generatedAt: new Date().toISOString(),
    };
  }

  const [resultsResult, entitiesResult, participantsResult] = await Promise.all([
    client
      .from("results")
      .select(RESULT_COLUMNS)
      .eq("show_id", selectedShow.id)
      .not("final_rank", "is", null)
      .order("final_rank", { ascending: true }),
    client
      .from("contest_entities")
      .select(ENTITY_COLUMNS)
      .eq("edition_id", selectedEdition.id),
    client.rpc("public_safe_participants", {
      _edition_id: selectedEdition.id,
      _show_id: null,
    }),
  ]);
  throwIfError(
    resultsResult.error,
    "Could not load published Broadcast Intelligence result",
  );
  throwIfError(
    entitiesResult.error,
    "Could not load public Broadcast Intelligence identities",
  );
  throwIfError(
    participantsResult.error,
    "Could not load public participant state for Broadcast Intelligence",
  );

  const participantStates = parseParticipantStates(participantsResult.data);
  const rows = filterNonCompetingRows(
    (resultsResult.data ?? []) as ResultRow[],
    participantStates,
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
    const countriesResult = await client
      .from("countries")
      .select(COUNTRY_COLUMNS)
      .in("id", [...countryIds]);
    throwIfError(
      countriesResult.error,
      "Could not load public Broadcast Intelligence country identities",
    );
    countries = (countriesResult.data ?? []) as Country[];
  }

  const displayMap = entityDisplayMap(entities, countries);
  const analysisRows = rows.flatMap((row) => {
    const key = entityKeyOf(row);
    return displayMap.has(key) ? [{ ...row, country_id: key }] : [];
  });
  const entries = broadcastEntriesFromResults(
    analysisRows,
    (id) => displayMap.get(id)?.name ?? "Unknown entry",
  );
  const intelligence = buildBroadcastIntelligence(entries);

  const identities: V3BroadcastIdentity[] = entries.flatMap((entry) => {
    const display = displayMap.get(entry.id);
    if (!display) return [];
    return [
      {
        id: entry.id,
        name: display.name,
        shortCode: display.short_code,
        flagImage: display.flag_image,
        accentColor: display.accent_color,
      },
    ];
  });

  return {
    rolloutEditionSlug: selectedEdition.slug,
    shell: {
      editionLabel: editionLabel(selectedEdition),
      phaseLabel: "Broadcast Intelligence",
    },
    options,
    selectedShowId: selectedShow.id,
    entries,
    intelligence,
    identities,
    generatedAt: new Date().toISOString(),
  };
}
