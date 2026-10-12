import { getRequestHeader } from "@tanstack/react-start/server";

import { createConfirmationPublicRuntimeClient } from "@/integrations/confirmations/public-runtime.server";
import { createSolarisAuthenticatedClientServer } from "@/integrations/supabase/organizer.server";
import type {
  CountryConfirmationAccess,
  CountryConfirmationRequirement,
} from "@/lib/confirmation-country-account";
import { resolveCurrentPublicEdition } from "@/lib/current-contest-state";
import type { Edition, ResultRow, Show } from "@/lib/data";
import type { VotingTaskInput } from "@/lib/participation-os";
import type { PublicRound } from "@/lib/confirmation-rounds.functions";
import {
  loadV3PrimarySurfaceBundle,
  type V3PrimarySurfaceBundle,
  type V3PrimarySurfaceServerSource,
} from "@/lib/v3-primary-surface-bootstrap";
import {
  assembleV3PrimarySurfaceSnapshot,
  countDistinctV3Delegations,
  countPendingAcknowledgementTasks,
  type V3ParticipantIdentityRow,
  type V3PrimarySurfaceDelegation,
} from "@/lib/v3-primary-surface-source";
import type { V3BootstrapServerRequest } from "@/lib/v3-bootstrap-server";

const PARTICIPANT_FEATURES = [
  "official_communications",
  "hod_workspace_v2",
  "rules_engine",
] as const;

const EDITION_COLUMNS =
  "id,edition_number,name,year,slug,description,host_country_id,host_city,logo,theme_id,status,published";
const SHOW_COLUMNS =
  "id,edition_id,name,kind,sort_order,status,published,publication_config";
const RESULT_COLUMNS =
  "id,edition_id,show_id,country_id,final_rank,jury_points,televote_points,total_points";
const PARTICIPANT_IDENTITY_COLUMNS = "country_id,contest_entity_id";

type RpcResult = {
  data: any;
  error: any;
  count?: number | null;
};

type AnyClient = {
  auth: {
    getUser(token?: string): Promise<{
      data: { user: { id: string; email?: string | null } | null };
      error: unknown;
    }>;
  };
  from(table: string): any;
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<RpcResult>;
  schema(schemaName: string): AnyClient;
};

type RequestViewer = {
  id: string;
  displayName: string | null;
  client: AnyClient;
} | null;

function optionalId(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function bearerToken() {
  const header = getRequestHeader("authorization")?.trim() ?? "";
  if (!header) return null;
  if (!header.startsWith("Bearer ")) {
    throw new Error("Invalid Solaris authorization header.");
  }
  const token = header.slice("Bearer ".length).trim();
  if (!token) throw new Error("Invalid Solaris authorization header.");
  return token;
}

async function resolveRequestViewer(): Promise<RequestViewer> {
  const token = bearerToken();
  if (!token) return null;

  const client = createSolarisAuthenticatedClientServer() as unknown as AnyClient;
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) {
    throw new Error("Solaris session is not authenticated.");
  }

  return {
    id: data.user.id,
    displayName: null,
    client,
  };
}

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

function juryTaskFromContext(data: any, editionId: string | null): VotingTaskInput | null {
  if (!editionId || !data?.ok) return null;
  const rounds = Array.isArray(data.rounds) ? data.rounds : [];
  const candidates = rounds.filter(
    (candidate: any) => candidate?.edition_id === editionId,
  );
  if (!candidates.length) return null;

  const round =
    candidates.find(
      (candidate: any) => candidate.status === "open" && candidate.eligible === true,
    ) ??
    candidates.find((candidate: any) => candidate.already_submitted === true) ??
    candidates.find((candidate: any) => candidate.eligible === true) ??
    candidates[0];

  if (!round?.eligible || round.status !== "open") return null;
  const showName = String(round.show_name ?? "Jury voting");
  return {
    id: String(round.show_id ?? round.show_name ?? "jury"),
    title: `${showName} jury ballot`,
    route: "/jury-voting",
    eligible: true,
    submitted: round.already_submitted === true,
    status: "open",
    opensAt: typeof round.opened_at === "string" ? round.opened_at : null,
    closesAt: typeof round.closed_at === "string" ? round.closed_at : null,
    required: true,
  };
}

function televoteTaskFromRound(data: any): VotingTaskInput | null {
  if (!data?.id) return null;
  const edition = Array.isArray(data.editions) ? data.editions[0] : data.editions;
  const roundName = String(data.name ?? "Televoting");
  const title = edition?.name
    ? `${String(edition.name)} public voting`
    : roundName;
  return {
    id: String(data.id),
    title,
    route: "/televoting",
    eligible: true,
    submitted: false,
    status: "open",
    closesAt: typeof data.closed_at === "string" ? data.closed_at : null,
    required: false,
  };
}

async function loadDelegation(
  client: AnyClient,
  viewerId: string,
): Promise<V3PrimarySurfaceDelegation | null> {
  const account = await client
    .from("country_accounts")
    .select("country_id,status")
    .eq("user_id", viewerId)
    .maybeSingle();
  throwIfError(account.error, "Could not load the signed-in delegation account");

  const countryId = account.data?.country_id;
  if (!countryId) return null;

  const country = await client
    .from("countries")
    .select("id,name")
    .eq("id", countryId)
    .maybeSingle();
  throwIfError(country.error, "Could not load the signed-in delegation");
  if (!country.data?.id || !country.data?.name) return null;
  return { id: String(country.data.id), name: String(country.data.name) };
}

async function loadDelegationCount(client: AnyClient, editionId: string | null) {
  if (!editionId) return 0;

  // Modern editions keep one canonical edition-level participant row per logical
  // delegation. Prefer those rows so the common path stays both exact and cheap.
  const canonical = await client
    .from("participants")
    .select(PARTICIPANT_IDENTITY_COLUMNS)
    .eq("edition_id", editionId)
    .is("show_id", null);
  throwIfError(canonical.error, "Could not load current-edition canonical delegations");
  const canonicalRows = (canonical.data ?? []) as V3ParticipantIdentityRow[];
  if (canonicalRows.length > 0) {
    return countDistinctV3Delegations(canonicalRows);
  }

  // Older editions may only have show-specific appearances. Fall back to the
  // narrow identity projection and deduplicate those rows in memory rather than
  // counting one delegation once per semi/final appearance.
  const appearances = await client
    .from("participants")
    .select(PARTICIPANT_IDENTITY_COLUMNS)
    .eq("edition_id", editionId);
  throwIfError(appearances.error, "Could not load current-edition delegation identities");
  return countDistinctV3Delegations(
    (appearances.data ?? []) as V3ParticipantIdentityRow[],
  );
}

async function loadParticipantEvidence(input: {
  viewer: Exclude<RequestViewer, null>;
  publicClient: AnyClient;
  editionId: string | null;
}) {
  const { viewer, publicClient, editionId } = input;
  const client = viewer.client;

  const featurePromise = Promise.all(
    PARTICIPANT_FEATURES.map((key) =>
      client.rpc("studio2_feature_enabled", {
        p_key: key,
        p_edition_id: editionId,
      }),
    ),
  );
  const televotePromise = publicClient
    .schema("televoting")
    .from("rounds")
    .select("id,name,closed_at,editions(name)")
    .eq("status", "open")
    .limit(1)
    .maybeSingle();
  const preferencePromise = client
    .from("notification_preferences")
    .select("spoiler_free")
    .eq("profile_id", viewer.id)
    .maybeSingle();

  const [
    delegation,
    confirmation,
    requirements,
    rounds,
    juryContext,
    televoteRound,
    preferences,
    featureResults,
  ] = await Promise.all([
    loadDelegation(client, viewer.id),
    client.rpc("public_country_account_confirmation_access"),
    client.rpc("public_country_account_confirmation_requirements"),
    publicClient.rpc("public_confirmation_rounds"),
    client.rpc("country_jury_voting_context"),
    televotePromise,
    preferencePromise,
    featurePromise,
  ]);

  throwIfError(confirmation.error, "Could not load confirmation access");
  throwIfError(requirements.error, "Could not load confirmation requirements");
  throwIfError(rounds.error, "Could not load confirmation rounds");
  throwIfError(juryContext.error, "Could not load jury task context");
  throwIfError(televoteRound.error, "Could not load open televote context");
  throwIfError(preferences.error, "Could not load Solaris app experience preferences");

  const capabilities: string[] = [];
  PARTICIPANT_FEATURES.forEach((key, index) => {
    const result = featureResults[index];
    throwIfError(result?.error, `Could not resolve ${key} capability`);
    if (result?.data === true) capabilities.push(key);
  });

  let acknowledgementTasks = 0;
  if (capabilities.includes("official_communications")) {
    const inbox = await client.rpc("studio2_my_notice_inbox", {
      p_edition_id: editionId,
    });
    throwIfError(inbox.error, "Could not load the participant notice inbox");
    acknowledgementTasks = countPendingAcknowledgementTasks(inbox.data);
  }

  const confirmationData = (confirmation.data ?? {}) as Partial<CountryConfirmationAccess>;
  return {
    delegation,
    capabilities,
    confirmationResponses: Array.isArray(confirmationData.responses)
      ? confirmationData.responses
      : [],
    confirmationRequirements: Array.isArray(requirements.data)
      ? (requirements.data as CountryConfirmationRequirement[])
      : [],
    rounds: Array.isArray(rounds.data) ? (rounds.data as PublicRound[]) : [],
    acknowledgementTasks,
    jury: juryTaskFromContext(juryContext.data, editionId),
    televote: televoteTaskFromRound(televoteRound.data),
    hideResultSpoilers: preferences.data?.spoiler_free === true,
  };
}

async function loadSnapshotForRequest(input: {
  request: V3BootstrapServerRequest;
  viewer: RequestViewer;
}) {
  const { request, viewer } = input;
  const actualViewerId = viewer?.id ?? null;
  if (request.viewerId !== actualViewerId) {
    throw new Error("V3 bootstrap request viewer does not match the authenticated request.");
  }

  const serverTime = new Date().toISOString();
  const publicClient = createConfirmationPublicRuntimeClient() as unknown as AnyClient;
  const editionQuery = await publicClient
    .from("editions")
    .select(EDITION_COLUMNS)
    .eq("published", true)
    .order("edition_number", { ascending: false });
  throwIfError(editionQuery.error, "Could not load published Solaris editions");
  const editions = (editionQuery.data ?? []) as Edition[];

  const requestedEditionId = optionalId(request.editionId);
  const selectedEdition = requestedEditionId
    ? editions.find((edition) => edition.id === requestedEditionId) ?? null
    : resolveCurrentPublicEdition(editions);
  if (requestedEditionId && !selectedEdition) {
    throw new Error("Requested V3 bootstrap edition is not public.");
  }
  const editionId = selectedEdition?.id ?? null;

  const [showsResult, resultsResult, participantCount] = editionId
    ? await Promise.all([
        publicClient
          .from("shows")
          .select(SHOW_COLUMNS)
          .eq("edition_id", editionId)
          .order("sort_order", { ascending: true }),
        publicClient
          .from("results")
          .select(RESULT_COLUMNS)
          .eq("edition_id", editionId),
        loadDelegationCount(publicClient, editionId),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
        0,
      ];
  throwIfError(showsResult.error, "Could not load current-edition shows");
  throwIfError(resultsResult.error, "Could not load current-edition results");

  const participant = viewer
    ? await loadParticipantEvidence({ viewer, publicClient, editionId })
    : {
        delegation: null,
        capabilities: [] as string[],
        confirmationResponses: [],
        confirmationRequirements: [] as CountryConfirmationRequirement[],
        rounds: [] as PublicRound[],
        acknowledgementTasks: 0,
        jury: null as VotingTaskInput | null,
        televote: null as VotingTaskInput | null,
        hideResultSpoilers: false,
      };

  const generatedAt = new Date().toISOString();
  return assembleV3PrimarySurfaceSnapshot({
    serverTime,
    generatedAt,
    targetEditionId: editionId,
    editions,
    shows: (showsResult.data ?? []) as Show[],
    results: (resultsResult.data ?? []) as ResultRow[],
    participantCount,
    viewer: viewer ? { id: viewer.id, displayName: viewer.displayName } : null,
    delegation: participant.delegation,
    capabilities: participant.capabilities,
    confirmationResponses: participant.confirmationResponses,
    confirmationRequirements: participant.confirmationRequirements,
    rounds: participant.rounds,
    acknowledgementTasks: participant.acknowledgementTasks,
    jury: participant.jury,
    televote: participant.televote,
    progressByActionId: {},
    hideResultSpoilers: participant.hideResultSpoilers,
  });
}

export async function createV3PrimarySurfaceRequestSource(input?: {
  editionId?: string | null;
}): Promise<{
  request: V3BootstrapServerRequest;
  source: V3PrimarySurfaceServerSource;
}> {
  const viewer = await resolveRequestViewer();
  const request: V3BootstrapServerRequest = {
    viewerId: viewer?.id ?? null,
    editionId: optionalId(input?.editionId),
    delegationId: null,
  };

  return {
    request,
    source: {
      loadSnapshot: (sourceRequest) =>
        loadSnapshotForRequest({ request: sourceRequest, viewer }),
    },
  };
}

export async function loadCurrentV3PrimarySurfaceBundle(input?: {
  editionId?: string | null;
}): Promise<V3PrimarySurfaceBundle> {
  const { request, source } = await createV3PrimarySurfaceRequestSource(input);
  return loadV3PrimarySurfaceBundle(request, source);
}