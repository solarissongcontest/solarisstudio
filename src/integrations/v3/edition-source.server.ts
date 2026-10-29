import { loadPublicResultSnapshots, type PublicResultCoverage } from "@/lib/v3-public-result-snapshots";
import { createConfirmationPublicRuntimeClient } from "@/integrations/confirmations/public-runtime.server";
import {
  resolvePublicEditionState,
  type PublicContestPhase,
} from "@/lib/current-contest-state";
import type { Country, Edition, Participant, ResultRow, Show } from "@/lib/data";
import { normalizeLegacyEditionStatus } from "@/lib/edition-state";
import { canonicalEditionEntries } from "@/lib/entry-utils";
import {
  entityDisplayMap,
  type ContestEntityRow,
  type EntityDisplay,
} from "@/lib/entities";
import { isShowPublic, resolveShowPublication } from "@/lib/publication";
import { showModeConfig } from "@/lib/show-mode";
import {
  buildV3EditionPageProjection,
  type V3EditionEntry,
  type V3EditionPageProjection,
  type V3EditionParticipant,
  type V3EditionResult,
  type V3EditionStory,
} from "@/lib/v3-edition";
import type {
  V3EditionExperience,
  V3ExploreEditionInput,
} from "@/lib/v3-explore";

const EDITION_COLUMNS =
  "id,edition_number,name,year,slug,description,host_country_id,host_city,logo,theme_id,artwork_url,status,published";
const SHOW_COLUMNS =
  "id,edition_id,name,kind,sort_order,status,published,qualifier_count,theme_id,voting_config,broadcast_config,publication_config";
const ENTITY_COLUMNS =
  "id,edition_id,entity_type,country_id,display_name,abbreviation,flag_image,region,historical_identity_override";
const COUNTRY_COLUMNS =
  "id,name,native_name,short_code,flag_image,region,accent_color,description,first_participation";

type EditionSourceClient = {
  from(table: string): any;
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{
    data: unknown;
    error: unknown;
  }>;
};

type SafeParticipant = Participant & {
  participation_status?: "confirmed" | "withdrawn" | "disqualified" | null;
};

type PublicStoryPayload = {
  title?: unknown;
  subtitle?: unknown;
  introduction?: unknown;
  publishedAt?: unknown;
  items?: unknown;
};

export type V3EditionServerBundle = {
  projection: V3EditionPageProjection;
  shell: {
    editionLabel: string;
    phaseLabel: string | null;
  };
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

function normalisePublicParticipant(value: unknown): SafeParticipant | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.edition_id !== "string") return null;
  const identity =
    typeof row.country_id === "string" && row.country_id
      ? row.country_id
      : typeof row.contest_entity_id === "string" && row.contest_entity_id
        ? row.contest_entity_id
        : "";
  if (!identity) return null;

  return {
    ...(row as unknown as Participant),
    country_id: identity,
    contest_entity_id:
      typeof row.contest_entity_id === "string" ? row.contest_entity_id : null,
    artist: typeof row.artist === "string" ? row.artist : null,
    song: typeof row.song === "string" ? row.song : null,
    show_id: typeof row.show_id === "string" ? row.show_id : null,
    running_order:
      typeof row.running_order === "number" ? row.running_order : null,
    qualified: typeof row.qualified === "boolean" ? row.qualified : null,
    notes: null,
    participation_status:
      row.participation_status === "withdrawn" || row.participation_status === "disqualified"
        ? row.participation_status
        : "confirmed",
  };
}

function parseSafeParticipants(value: unknown): SafeParticipant[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalisePublicParticipant)
    .filter((row): row is SafeParticipant => row !== null);
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parsePublicStory(value: unknown): V3EditionStory | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const story = value as PublicStoryPayload;
  const title = stringOrNull(story.title);
  if (!title) return null;
  const items = Array.isArray(story.items)
    ? story.items.flatMap((value) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return [];
        const row = value as Record<string, unknown>;
        const id = stringOrNull(row.id);
        const headline = stringOrNull(row.headline);
        const summary = stringOrNull(row.summary);
        if (!id || !headline || !summary) return [];
        return [{
          id,
          headline,
          summary,
          occurredAt: stringOrNull(row.occurredAt),
        }];
      })
    : [];

  return {
    title,
    subtitle: stringOrNull(story.subtitle),
    introduction: stringOrNull(story.introduction),
    publishedAt: stringOrNull(story.publishedAt),
    items,
  };
}

function publicScheduledStart(show: Show): string | null {
  const value = showModeConfig(show).scheduledStart;
  if (!value) return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

function experienceFromPhase(phase: PublicContestPhase): V3EditionExperience {
  switch (phase) {
    case "live":
      return "live";
    case "results_published":
      return "results";
    case "post_edition":
      return "post-edition";
    case "jury_voting":
    case "voting":
    case "results_pending":
      return "show-day";
    case "pre_show":
    case "submissions":
    case "confirmations":
      return "pre-show";
    case "announced":
    case "between_editions":
      return "upcoming";
  }
}

function editionExperience(
  edition: Edition,
  shows: readonly Show[],
  results: readonly ResultRow[],
): { experience: V3EditionExperience; phaseLabel: string | null } {
  const lifecycle = normalizeLegacyEditionStatus(edition.status);
  if (lifecycle === "archived") {
    return { experience: "archived", phaseLabel: "Archive" };
  }
  if (lifecycle === "post_edition") {
    return { experience: "post-edition", phaseLabel: "Complete" };
  }

  const state = resolvePublicEditionState({ edition, shows, results });
  return {
    experience: experienceFromPhase(state.phase),
    phaseLabel: state.statusLabel,
  };
}

function identityProjection(display: EntityDisplay) {
  return {
    id: display.id,
    name: display.name,
    shortCode: display.short_code,
    flagImage: display.flag_image,
    accentColor: display.accent_color,
    href:
      display.entityType === "global" && display.countryId
        ? `/countries/${display.short_code}`
        : null,
  };
}

function uniqueParticipants(
  rows: readonly SafeParticipant[],
  displayMap: Map<string, EntityDisplay>,
): V3EditionParticipant[] {
  const projected = new Map<string, V3EditionParticipant>();
  for (const row of rows) {
    const display = displayMap.get(row.country_id);
    if (!display || projected.has(display.id)) continue;
    projected.set(display.id, {
      ...identityProjection(display),
      participationStatus: row.participation_status ?? "confirmed",
    });
  }
  return [...projected.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function publicEntries(
  rows: readonly SafeParticipant[],
  displayMap: Map<string, EntityDisplay>,
): V3EditionEntry[] {
  return canonicalEditionEntries(rows as Participant[])
    .filter((entry) => Boolean(entry.artist?.trim() || entry.song?.trim()))
    .flatMap((entry) => {
      const display = displayMap.get(entry.country_id);
      if (!display) return [];
      return [{
        ...identityProjection(display),
        artist: entry.artist?.trim() || null,
        song: entry.song?.trim() || null,
      }];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function publicResults(
  rows: readonly ResultRow[],
  displayMap: Map<string, EntityDisplay>,
): V3EditionResult[] {
  return rows
    .filter((row) => row.final_rank != null)
    .sort((a, b) => (a.final_rank ?? Number.MAX_SAFE_INTEGER) - (b.final_rank ?? Number.MAX_SAFE_INTEGER))
    .flatMap((row) => {
      const identity = row.contest_entity_id ?? row.country_id;
      const display = displayMap.get(identity);
      if (!display || row.final_rank == null) return [];
      return [{
        ...identityProjection(display),
        rank: row.final_rank,
        totalPoints: row.total_points,
      }];
    });
}

function shellEditionLabel(edition: Edition) {
  return edition.edition_number == null
    ? edition.name
    : `SSC ${edition.edition_number} · ${edition.name}`;
}

/**
 * Publication-safe server source for one V3 Edition page. The browser supplies
 * only a slug. Participant rows always come from public_safe_participants;
 * result rows are not queried until the canonical Grand Final publication gate
 * says official results are public. Identity lookups are narrow and bounded to
 * this edition, avoiding the legacy page's archive-wide history fanout.
 */
export async function loadV3EditionBundle(input: {
  slug: string;
}, client: EditionSourceClient = createConfirmationPublicRuntimeClient() as unknown as EditionSourceClient): Promise<V3EditionServerBundle | null> {
  let resultCoverage: PublicResultCoverage = { includedShows: 0, unavailableShows: 0 };
  const slug = input.slug.trim();
  if (!slug) return null;

  const editionResult = await client
    .from("editions")
    .select(EDITION_COLUMNS)
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();
  throwIfError(editionResult.error, "Could not load public Solaris edition");

  const edition = (editionResult.data ?? null) as Edition | null;
  if (!edition?.published) return null;

  const [showsResult, participantsResult, entitiesResult, storyResult] = await Promise.all([
    client
      .from("shows")
      .select(SHOW_COLUMNS)
      .eq("edition_id", edition.id)
      .eq("published", true)
      .order("sort_order", { ascending: true }),
    client.rpc("public_safe_participants", {
      _edition_id: edition.id,
      _show_id: null,
    }),
    client
      .from("contest_entities")
      .select(ENTITY_COLUMNS)
      .eq("edition_id", edition.id),
    client.rpc("studio2_public_storyline", { p_edition_slug: slug }),
  ]);

  throwIfError(showsResult.error, "Could not load public Edition shows");
  throwIfError(participantsResult.error, "Could not load public Edition participants");
  throwIfError(entitiesResult.error, "Could not load Edition identities");
  throwIfError(storyResult.error, "Could not load public Edition story");

  const shows = ((showsResult.data ?? []) as Show[])
    .filter((show) => isShowPublic(show))
    .sort((a, b) => a.sort_order - b.sort_order);
  const participants = parseSafeParticipants(participantsResult.data);
  const entities = (entitiesResult.data ?? []) as ContestEntityRow[];
  const candidateResultShow =
    shows.find(
      (show) =>
        (show.kind === "grand-final" || show.kind === "final") &&
        resolveShowPublication(show).results,
    ) ?? null;

  const snapshots = await loadPublicResultSnapshots(client, candidateResultShow ? [candidateResultShow.id] : []);
  const snapshot = candidateResultShow ? snapshots.get(candidateResultShow.id) : null;
  const resultShow = snapshot?.editionId === edition.id ? candidateResultShow : null;
  const resultRows = resultShow ? snapshot!.rows : [];
  resultCoverage = { includedShows: resultShow ? 1 : 0, unavailableShows: candidateResultShow && !resultShow ? 1 : 0 };

  const countryIds = new Set<string>();
  for (const entity of entities) {
    if (entity.country_id) countryIds.add(entity.country_id);
  }
  for (const participant of participants) {
    const entity = entities.find((candidate) => candidate.id === participant.contest_entity_id);
    if (entity?.country_id) countryIds.add(entity.country_id);
    else if (!participant.contest_entity_id && participant.country_id) countryIds.add(participant.country_id);
  }
  for (const row of resultRows) {
    if (row.country_id) countryIds.add(row.country_id);
  }

  let countries: Country[] = [];
  if (countryIds.size) {
    const countriesResult = await client
      .from("countries")
      .select(COUNTRY_COLUMNS)
      .in("id", [...countryIds]);
    throwIfError(countriesResult.error, "Could not load public Edition country identities");
    countries = (countriesResult.data ?? []) as Country[];
  }

  const displayMap = entityDisplayMap(entities, countries);
  const participantProjection = uniqueParticipants(participants, displayMap);
  const entryProjection = publicEntries(participants, displayMap);
  const resultProjection = publicResults(resultRows, displayMap);
  const story = parsePublicStory(storyResult.data);
  const experience = editionExperience(edition, shows, resultRows);
  const resultsPublished = Boolean(resultShow);

  const editionInput: V3ExploreEditionInput = {
    id: edition.id,
    slug: edition.slug,
    name: edition.name,
    editionNumber: edition.edition_number,
    year: edition.year,
    hostLabel: edition.host_city,
    artworkUrl: edition.artwork_url ?? edition.logo ?? null,
    visibility: "public",
    experience: experience.experience,
    resultsPublication: resultsPublished ? "published" : "hidden",
    href: `/editions/${edition.slug}`,
    liveHref: experience.experience === "live" ? "/show-mode" : null,
    nextEvent: null,
    archiveEligible:
      experience.experience === "post-edition" || experience.experience === "archived",
  };

  const projection = buildV3EditionPageProjection({
    edition: editionInput,
    description: edition.description,
    participants: participantProjection,
    entries: entryProjection,
    shows: shows.map((show) => {
      const publication = resolveShowPublication(show);
      return {
        id: show.id,
        name: show.name,
        kind: show.kind,
        href: `/shows/${show.id}`,
        startsAt: publicScheduledStart(show),
        participantCount: publication.participants
          ? participants.filter((participant) => participant.show_id === show.id).length
          : 0,
        runningOrderAvailable: publication.running_order,
        resultsAvailable: publication.results,
      };
    }),
    story,
    resultShowHref: resultShow ? `/shows/${resultShow.id}?from=results` : null,
    results: resultProjection,
    publishedResultSource: snapshot ? { resultVersion: snapshot.resultVersion, publicationVersion: snapshot.publicationVersion } : undefined,
  });

  if (!projection) return null;

  return {
    projection,
    shell: {
      editionLabel: shellEditionLabel(edition),
      phaseLabel: experience.phaseLabel,
    },
    resultCoverage,
    generatedAt: new Date().toISOString(),
  };
}