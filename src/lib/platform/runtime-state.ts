import { supabase } from "@/integrations/supabase/client";

import type { EditionPhase, EditionRuntimeState } from "./edition-state";

// The Supabase schema types are generated and must not be hand-edited. Keep the
// narrow cast here until the platform-foundations migration is applied and the
// generated database types are refreshed.
const platformDb = supabase as any;

export type PlatformEvent = {
  id: string;
  edition_id: string | null;
  event_type: string;
  actor_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  source: string;
  payload: Record<string, unknown>;
  occurred_at: string;
};

export type PlatformFeatureFlag = {
  key: string;
  description: string;
  enabled_by_default: boolean;
  created_at: string;
  updated_at: string;
};

function throwPlatformError(operation: string, error: unknown): never {
  const message =
    typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message)
      : String(error ?? "Unknown error");

  throw new Error(`${operation} failed: ${message}`);
}

export async function getEditionRuntimeState(
  editionId: string,
): Promise<EditionRuntimeState | null> {
  const { data, error } = await platformDb
    .from("edition_runtime_state")
    .select("*")
    .eq("edition_id", editionId)
    .maybeSingle();

  if (error) throwPlatformError("Loading edition runtime state", error);
  return (data ?? null) as EditionRuntimeState | null;
}

export async function initializeEditionRuntimeState(
  editionId: string,
  phase: EditionPhase = "planning",
  reason?: string,
): Promise<EditionRuntimeState> {
  const { data, error } = await platformDb.rpc("initialize_edition_runtime_state", {
    p_edition_id: editionId,
    p_phase: phase,
    p_reason: reason ?? null,
  });

  if (error) throwPlatformError("Initializing edition runtime state", error);
  return data as EditionRuntimeState;
}

export async function transitionEditionRuntimeState(
  editionId: string,
  targetPhase: EditionPhase,
  reason?: string,
): Promise<EditionRuntimeState> {
  const { data, error } = await platformDb.rpc("transition_edition_runtime_state", {
    p_edition_id: editionId,
    p_target_phase: targetPhase,
    p_reason: reason ?? null,
  });

  if (error) throwPlatformError("Transitioning edition runtime state", error);
  return data as EditionRuntimeState;
}

export async function listEditionPlatformEvents(
  editionId: string,
  limit = 100,
): Promise<PlatformEvent[]> {
  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 500));
  const { data, error } = await platformDb
    .from("platform_events")
    .select("*")
    .eq("edition_id", editionId)
    .order("occurred_at", { ascending: false })
    .limit(safeLimit);

  if (error) throwPlatformError("Loading platform events", error);
  return (data ?? []) as PlatformEvent[];
}

export async function isPlatformFeatureEnabled(
  flagKey: string,
  editionId?: string | null,
): Promise<boolean> {
  const { data, error } = await platformDb.rpc("platform_feature_enabled", {
    p_flag_key: flagKey,
    p_edition_id: editionId ?? null,
  });

  if (error) throwPlatformError(`Checking feature flag ${flagKey}`, error);
  return data === true;
}

export async function listPlatformFeatureFlags(): Promise<PlatformFeatureFlag[]> {
  const { data, error } = await platformDb
    .from("platform_feature_flags")
    .select("*")
    .order("key", { ascending: true });

  if (error) throwPlatformError("Loading platform feature flags", error);
  return (data ?? []) as PlatformFeatureFlag[];
}
