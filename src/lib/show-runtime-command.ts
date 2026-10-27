import { supabase } from "@/integrations/supabase/client";
import type { ShowModeManualPhase } from "@/lib/broadcast";

export type ShowRuntimeSnapshot = {
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
  previousPhase: ShowModeManualPhase;
  runtime: Record<string, unknown>;
};

type RpcClient = {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

const client = supabase as unknown as RpcClient;

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
    !result.runtime ||
    typeof result.runtime !== "object" ||
    Array.isArray(result.runtime)
  ) {
    throw new Error("Show runtime command returned inconsistent canonical evidence. Reload before retrying.");
  }
  return result as unknown as ShowRuntimeCommandResult;
}

export async function applyShowRuntimeChange(input: {
  showId: string;
  expectedRevision: number;
  phase: ShowModeManualPhase;
  scheduledStart: string | null;
  youtubeUrl: string;
  televoteRoundId: string | null;
  reason: string;
}) {
  const operationId = globalThis.crypto.randomUUID();
  const args = {
    p_show_id: input.showId,
    p_expected_revision: input.expectedRevision,
    p_phase: input.phase,
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
  if (result.showId !== input.showId || result.revision !== input.expectedRevision + 1) {
    throw new Error("Show runtime command returned stale or cross-show evidence. Reload before retrying.");
  }
  return result;
}
