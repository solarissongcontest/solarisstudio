import { createConfirmationPublicRuntimeClient } from "@/integrations/confirmations/public-runtime.server";
import { resolveCurrentPublicEdition } from "@/lib/current-contest-state";
import type { Country, Edition, Participant, Show } from "@/lib/data";
import { normalizeLegacyEditionStatus } from "@/lib/edition-state";
import {
  entityDisplayMap,
  entityKeyOf,
  type ContestEntityRow,
} from "@/lib/entities";
import { isShowPublic, resolveShowPublication } from "@/lib/publication";
import {
  preferredShowModeShow,
  showModeConfig,
  type ShowModeTelevoteRound,
} from "@/lib/show-mode";
import {
  projectV3LiveExperience,
  type V3LiveEntrySummary,
  type V3LiveExperience,
  type V3LiveRevealState,
} from "@/lib/v3-live";

const EDITION_COLUMNS = "id,edition_number,name,slug,published,status";
const SHOW_COLUMNS =
  "id,edition_id,name,kind,sort_order,status,published,broadcast_config,publication_config";
const ENTITY_COLUMNS =
  "id,edition_id,entity_type,country_id,display_name,abbreviation,flag_image,region,historical_identity_override";
const COUNTRY_COLUMNS =
  "id,name,native_name,short_code,flag_image,region,accent_color,description,first_participation";

type PublicLiveClient = {
  from(table: string): any;
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{
    data: unknown;
    error: unknown;
  }>;
  schema(schemaName: string): PublicLiveClient;
};

type PublicParticipantRow = Participant & {
  contest_entity_id?: string | null;
};

export type V3LiveServerBundle = {
  edition: { id: string; slug: string; label: string } | null;
  experience: V3LiveExperience | null;
  availableShows: Array<{ id: string; name: string; state: string }>;
  generatedAt: string;
};

function throwIfError(error: unknown, label: string) {
  if (!error) return;
  const message = error instanceof Error
    ? error.message
    : typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message ?? label)
      : label;
  throw new Error(`${label}: ${message}`);
}

function editionLabel(edition: Pick<Edition, "edition_number" | "name">) {
  return edition.edition_number == null ? edition.name : `SSC ${edition.edition_number} · ${edition.name}`;
}

function publicParticipantRows(value: unknown): PublicParticipantRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter((candidate): candidate is PublicParticipantRow => Boolean(candidate && typeof candidate === "object"));
}

function activeLiveEdition(editions: readonly Edition[]) {
  const candidate = resolveCurrentPublicEdition(editions);
  if (!candidate) return null;
  const lifecycle = normalizeLegacyEditionStatus(candidate.status);
  return lifecycle === "post_edition" || lifecycle === "archived" ? null : candidate;
}

async function loadLinkedTelevoteRound(client: PublicLiveClient, show: Show): Promise<ShowModeTelevoteRound | null> {
  const roundId = showModeConfig(show).televoteRoundId;
  if (!roundId) return null;
  const result = await client.schema("televoting").from("rounds").select("id,name,status,opened_at,closed_at").eq("id", roundId).maybeSingle();
  throwIfError(result.error, "Could not load public Live voting state");
  if (!result.data) return null;
  const status = result.data.status === "open" || result.data.status === "closed" ? result.data.status : "draft";
  return {
    id: String(result.data.id),
    name: String(result.data.name ?? "Public voting"),
    status,
    openedAt: typeof result.data.opened_at === "string" ? result.data.opened_at : null,
    closedAt: typeof result.data.closed_at === "string" ? result.data.closed_at : null,
  };
}

function parsePublicReveal(value: unknown): V3LiveRevealState {
  const hidden: V3LiveRevealState = {
    state: "hidden",
    version: null,
    currentStep: 0,
    totalSteps: 0,
    lastRevealedId: null,
    updatedAt: null,
  };
  if (!value || typeof value !== "object" || Array.isArray(value)) return hidden;
  const row = value as Record<string, unknown>;
  if (row.state !== "live" && row.state !== "complete") return hidden;
  const version = Number(row.version);
  const currentStep = Number(row.currentStep);
  const totalSteps = Number(row.totalSteps);
  if (!Number.isInteger(version) || version < 1 || !Number.isInteger(currentStep) || currentStep < 0 || !Number.isInteger(totalSteps) || totalSteps < currentStep) {
    throw new Error("Could not load public Live reveal state: invalid canonical reveal projection");
  }
  return {
    state: row.state,
    version,
    currentStep,
    totalSteps,
    lastRevealedId: typeof row.lastRevealedId === "string" && row.lastRevealedId ? row.lastRevealedId : null,
    updatedAt: typeof row.updatedAt === "string" && row.updatedAt ? row.updatedAt : null,
  };
}

async function loadPublicReveal(client: PublicLiveClient, show: Show): Promise<V3LiveRevealState> {
  const result = await client.rpc("studio2_public_reveal_snapshot", { p_show_id: show.id });
  throwIfError(result.error, "Could not load public Live reveal state");
  return parsePublicReveal(result.data);
}

async function loadRunningOrder(input: { client: PublicLiveClient; edition: Edition; show: Show }): Promise<V3LiveEntrySummary[]> {
  if (!resolveShowPublication(input.show).running_order) return [];
  const [participantResult, entityResult] = await Promise.all([
    input.client.rpc("public_safe_participants", { _edition_id: input.edition.id, _show_id: input.show.id }),
    input.client.from("contest_entities").select(ENTITY_COLUMNS).eq("edition_id", input.edition.id),
  ]);
  throwIfError(participantResult.error, "Could not load public Live running order");
  throwIfError(entityResult.error, "Could not load public Live identities");
  const participants = publicParticipantRows(participantResult.data);
  const entities = (entityResult.data ?? []) as ContestEntityRow[];
  const countryIds = new Set<string>();
  for (const participant of participants) if (participant.country_id) countryIds.add(participant.country_id);
  for (const entity of entities) if (entity.country_id) countryIds.add(entity.country_id);

  let countries: Country[] = [];
  if (countryIds.size) {
    const countryResult = await input.client.from("countries").select(COUNTRY_COLUMNS).in("id", [...countryIds]);
    throwIfError(countryResult.error, "Could not load public Live country identities");
    countries = (countryResult.data ?? []) as Country[];
  }
  const display = entityDisplayMap(entities, countries);
  return participants.filter((participant) => participant.running_order != null).flatMap((participant) => {
    const identity = display.get(entityKeyOf(participant));
    if (!identity) return [];
    return [{
      id: participant.id,
      runningOrder: participant.running_order,
      countryId: identity.id,
      countryName: identity.name,
      flagImage: identity.flag_image,
      artist: participant.artist ?? null,
      song: participant.song ?? null,
    }];
  });
}

/**
 * Focused, publication-safe server snapshot for Public V3 Live. Reveal progress
 * is one bounded RPC read: Armed and earlier return only `hidden`; Live/Complete
 * expose progress and the already-revealed identity, never future sequence/points.
 */
export async function loadV3LiveBundle(): Promise<V3LiveServerBundle> {
  const client = createConfirmationPublicRuntimeClient() as unknown as PublicLiveClient;
  const generatedAt = new Date().toISOString();
  const serverTime = generatedAt;

  const editionResult = await client.from("editions").select(EDITION_COLUMNS).eq("published", true).order("edition_number", { ascending: false });
  throwIfError(editionResult.error, "Could not load public Live edition");
  const editions = (editionResult.data ?? []) as Edition[];
  const edition = activeLiveEdition(editions);
  if (!edition) return { edition: null, experience: null, availableShows: [], generatedAt };

  const showResult = await client.from("shows").select(SHOW_COLUMNS).eq("edition_id", edition.id).eq("published", true).order("sort_order", { ascending: true });
  throwIfError(showResult.error, "Could not load public Live shows");
  const shows = ((showResult.data ?? []) as Show[]).filter(isShowPublic);
  const selectedShow = preferredShowModeShow(shows, Date.parse(serverTime));
  if (!selectedShow) {
    return { edition: { id: edition.id, slug: edition.slug, label: editionLabel(edition) }, experience: null, availableShows: [], generatedAt };
  }

  const [round, runningOrder, reveal] = await Promise.all([
    loadLinkedTelevoteRound(client, selectedShow),
    loadRunningOrder({ client, edition, show: selectedShow }),
    loadPublicReveal(client, selectedShow),
  ]);
  const experience = projectV3LiveExperience({ show: selectedShow, televoteRound: round, runningOrder, reveal, serverTime, generatedAt });
  return {
    edition: { id: edition.id, slug: edition.slug, label: editionLabel(edition) },
    experience,
    availableShows: shows.map((show) => ({ id: show.id, name: show.name, state: show.id === selectedShow.id ? experience.state : show.status })),
    generatedAt,
  };
}
