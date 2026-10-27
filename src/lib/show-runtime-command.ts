import { supabase } from "@/integrations/supabase/client";
import type { ShowModeManualPhase } from "@/lib/broadcast";

export type ShowLifecycleState =
  | "scheduled"
  | "preparing"
  | "delayed"
  | "live"
  | "paused"
  | "ended"
  | "cancelled";

export type ShowRuntimeTarget = ShowLifecycleState | "results_in_progress";

export type ShowRuntimeSnapshot = {
  lifecycle: ShowLifecycleState;
  revision: number;
  phase: ShowModeManualPhase;
  scheduledStart: string | null;
  youtubeUrl: string;
  televoteRoundId: string | null;
};

type ShowRuntimeCommandResult = {
  operationId: string;
  showId: string;
  editionId: string;
  revision: number;
  previousState: ShowRuntimeTarget;
  state: ShowRuntimeTarget;
  lifecycleStatus: ShowLifecycleState;
  runtime: Record<string, unknown>;
};

type RpcClient = {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

const client = supabase as unknown as RpcClient;

const LIFECYCLE_ALIASES: Readonly<Record<string, ShowLifecycleState>> = {
  draft: "scheduled",
  scheduled: "scheduled",
  upcoming: "scheduled",
  planned: "scheduled",
  planning: "scheduled",
  announced: "scheduled",
  ready: "preparing",
  preparing: "preparing",
  rehearsal: "preparing",
  rehearsals: "preparing",
  delayed: "delayed",
  live: "live",
  on_air: "live",
  "on-air": "live",
  active: "live",
  open: "live",
  in_progress: "live",
  "in-progress": "live",
  paused: "paused",
  hold: "paused",
  held: "paused",
  ended: "ended",
  complete: "ended",
  completed: "ended",
  closed: "ended",
  cancelled: "cancelled",
  canceled: "cancelled",
};

export function canonicalShowLifecycle(status: string): ShowLifecycleState {
  const normalized = LIFECYCLE_ALIASES[status.trim().toLowerCase()];
  if (!normalized) throw new Error(`Unknown show lifecycle state: ${status}`);
  return normalized;
}

export function showRuntimeTargetFromStored(
  status: string,
  phase: ShowModeManualPhase,
): ShowRuntimeTarget {
  const lifecycle = canonicalShowLifecycle(status);
  return lifecycle === "live" && phase === "results_in_progress"
    ? "results_in_progress"
    : lifecycle;
}

export function companionPhaseForTarget(target: ShowRuntimeTarget): ShowModeManualPhase {
  if (target === "results_in_progress") return "results_in_progress";
  if (target === "live" || target === "paused") return "live";
  if (target === "ended" || target === "cancelled") return "ended";
  return "scheduled";
}

export function showRuntimeRevision(broadcastConfig: unknown) {
  if (!broadcastConfig || typeof broadcastConfig !== "object" || Array.isArray(broadcastConfig)) return 0;
  const showMode = (broadcastConfig as Record<string, unknown>).showMode;
  if (!showMode || typeof showMode !== "object" || Array.isArray(showMode)) return 0;
  const revision = (showMode as Record<string, unknown>).revision;
  return typeof revision === "number" && Number.isInteger(revision) && revision >= 0 ? revision : 0;
}

function isTransportFailure(error: unknown) {
  return Boolean(error && typeof error === "object" && !("code" in error));
}

function parseResult(value: unknown): ShowRuntimeCommandResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Show runtime command returned no canonical result. Reload before retrying.");
  }
  const result = value as Record<string, unknown>;
  if (
    typeof result.operationId !== "string" ||
    typeof result.showId !== "string" ||
    typeof result.editionId !== "string" ||
    typeof result.revision !== "number" ||
    !Number.isInteger(result.revision) ||
    result.revision < 1 ||
    typeof result.previousState !== "string" ||
    typeof result.state !== "string" ||
    typeof result.lifecycleStatus !== "string" ||
    !result.runtime ||
    typeof result.runtime !== "object" ||
    Array.isArray(result.runtime)
  ) {
    throw new Error("Show runtime command returned inconsistent canonical evidence. Reload before retrying.");
  }
  canonicalShowLifecycle(result.lifecycleStatus);
  return result as unknown as ShowRuntimeCommandResult;
}

async function loadExpectedLifecycle(showId: string): Promise<ShowLifecycleState> {
  const { data, error } = await (supabase.from("shows") as any)
    .select("status")
    .eq("id", showId)
    .single();
  if (error) throw error;
  return canonicalShowLifecycle(String(data?.status ?? ""));
}

export async function applyShowRuntimeChange(input: {
  showId: string;
  expectedRevision: number;
  expectedStatus?: ShowLifecycleState;
  targetState?: ShowRuntimeTarget;
  /** Compatibility for the existing reviewed Show Mode surface. */
  phase?: ShowModeManualPhase;
  scheduledStart: string | null;
  youtubeUrl: string;
  televoteRoundId: string | null;
  reason: string;
}) {
  const targetState: ShowRuntimeTarget = input.targetState ?? input.phase ?? "scheduled";
  const expectedStatus = input.expectedStatus ?? await loadExpectedLifecycle(input.showId);
  const operationId = globalThis.crypto.randomUUID();
  const args = {
    p_show_id: input.showId,
    p_expected_status: expectedStatus,
    p_expected_revision: input.expectedRevision,
    p_target_state: targetState,
    p_scheduled_start: input.scheduledStart,
    p_youtube_url: input.youtubeUrl,
    p_televote_round_id: input.televoteRoundId,
    p_reason: input.reason,
    p_operation_id: operationId,
    p_idempotency_key: `show-runtime:${operationId}`,
  };

  let response = await client.rpc("v3_apply_show_runtime_change", args);
  if (response.error && isTransportFailure(response.error)) {
    // Reuse the exact operation identity. A lost response after commit therefore
    // reads back the durable receipt instead of applying the transition twice.
    response = await client.rpc("v3_apply_show_runtime_change", args);
  }
  if (response.error) throw response.error;
  const result = parseResult(response.data);
  if (
    result.showId !== input.showId ||
    result.lifecycleStatus !== (targetState === "results_in_progress" ? "live" : targetState) ||
    result.revision !== input.expectedRevision + 1
  ) {
    throw new Error("Show runtime command returned stale or cross-show evidence. Reload before retrying.");
  }
  return result;
}
