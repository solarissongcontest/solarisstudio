import { getRequestHeader } from "@tanstack/react-start/server";

import { createConfirmationPublicRuntimeClient } from "@/integrations/confirmations/public-runtime.server";
import { createSolarisAuthenticatedClientServer } from "@/integrations/supabase/organizer.server";
import type {
  CountryConfirmationAccess,
  CountryConfirmationRequirement,
} from "@/lib/confirmation-country-account";
import { resolveCurrentPublicEdition } from "@/lib/current-contest-state";
import type { Edition, ResultRow, Show } from "@/lib/data";
import {
  tasksFromHodWorkspace,
  type SolarisTask,
  type VotingTaskInput,
} from "@/lib/participation-os";
import type { PublicRound } from "@/lib/confirmation-rounds.functions";
import {
  buildStudio2HodWorkspaceSnapshot,
  mapStudio2HodContext,
} from "@/lib/studio2-hod-workspace";
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

async function loadOpenPublicTelevote(client: AnyClient) {
  const result = await client
    .schema("televoting")
    .from("rounds")
    .select("id,name,closed_at,editions!inner(name,is_active)")
    .eq("status", "open")
    .eq("editions.is_active", true)
    .limit(1)
    .maybeSingle();
  throwIfError(result.error, "Could not load open public televote context");
  return televoteTaskFromRound(result.data);
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

  // Canonical edition rows are created incrementally, so valid editions can be
  // mixed: some delegations have a show_id = null row while others only have
  // show appearances. Read one narrow identity projection across the edition
  // and deduplicate the union instead of treating canonical rows as all-or-none.
  const identities = await client
    .from("participants")
    .select(PARTICIPANT_IDENTITY_COLUMNS)
    .eq("edition_id", editionId);
  throwIfError(identities.error, "Could not load current-edition delegation identities");
  return countDistinctV3Delegations(
    (identities.data ?? []) as V3ParticipantIdentityRow[],
  );
}

async function loadHodTasks(input: {
  client: AnyClient;
  editionId: string | null;
  delegation: V3PrimarySurfaceDelegation | null;
  capabilities: readonly string[];
  now: number;
}): Promise<SolarisTask[]> {
  if (
    !input.editionId ||
    !input.delegation ||
    !input.capabilities.includes("hod_workspace_v2")
  ) {
    return [];
  }

  const context = await input.client.rpc("studio2_hod_context", {
    p_edition_id: input.editionId,
    p_country_id: input.delegation.id,
  });
  throwIfError(context.error, "Could not load authoritative HOD workspace");
  const snapshot = buildStudio2HodWorkspaceSnapshot(
    mapStudio2HodContext(context.data),
  );
  return tasksFromHodWorkspace(snapshot, input.now);
}

async function loadParticipantEvidence(input: {
  viewer: Exclude<RequestViewer, null>;
  publicClient: AnyClient;
  editionId: string | null;
  serverNow: number;
}) {
  const { viewer, publicClient, editionId, serverNow } = input;
  const client = viewer.client;

  const featurePromise = Promise.all(
    PARTICIPANT_FEATURES.map((key) =>
      client.rpc("studio2_feature_enabled", {
        p_key: key,
        p_edition_id: editionId,
      }),
    ),
  );
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
    preferences,
    featureResults,
  ] = await Promise.all([
    loadDelegation(client, viewer.id),
    client.rpc("public_country_account_confirmation_access"),
    client.rpc("public_country_account_confirmation_requirements"),
    publicClient.rpc("public_confirmation_rounds"),
    client.rpc("country_jury_voting_context"),
    preferencePromise,
    featurePromise,
  ]);

  throwIfError(confirmation.error, "Could not load confirmation access");
  throwIfError(requirements.error, "Could not load confirmation requirements");
  throwIfError(rounds.error, "Could not load confirmation rounds");
  throwIfError(juryContext.error, "Could not load jury task context");
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

  const hodTasks = await loadHodTasks({
    client,
    editionId,
    delegation,
    capabilities,
    now: serverNow,
  });

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
    additionalTasks: hodTasks,
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
  const serverNow = Date.parse(serverTime);
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

  const [showsResult, resultsResult, participantCount, publicTelevote] = editionId
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
        loadOpenPublicTelevote(publicClient),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
        0,
        null,
      ];
  throwIfError(showsResult.error, "Could not load current-edition shows");
  throwIfError(resultsResult.error, "Could not load current-edition results");

  const participant = viewer
    ? await loadParticipantEvidence({
        viewer,
        publicClient,
        editionId,
        serverNow,
      })
    : {
        delegation: null,
        capabilities: [] as string[],
        confirmationResponses: [],
        confirmationRequirements: [] as CountryConfirmationRequirement[],
        rounds: [] as PublicRound[],
        acknowledgementTasks: 0,
        jury: null as VotingTaskInput | null,
        additionalTasks: [] as SolarisTask[],
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
    televote: publicTelevote,
    additionalTasks: participant.additionalTasks,
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