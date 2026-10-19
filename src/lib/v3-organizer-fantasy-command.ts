import { supabase } from "@/integrations/supabase/client";

export type V3OrganizerFantasyEntry = {
  countryId: string;
  cost: number;
  eligible: boolean;
};

export type V3OrganizerFantasyGame = {
  id: string;
  editionId: string;
  showId: string;
  name: string;
  opensAt: string;
  locksAt: string;
  status: string;
  rosterSize: number;
  budget: number;
  captainMultiplier: number;
  scoringVersion: string;
  configVersion: number;
  updatedAt: string;
};

export type V3OrganizerFantasyProjection = {
  editionId: string;
  showId?: string;
  gameId?: string;
  stateVersion: number;
  serverTime: string;
  game: V3OrganizerFantasyGame | null;
  entries: V3OrganizerFantasyEntry[];
};

export type V3SaveFantasyGameInput = {
  editionId: string;
  showId: string;
  gameId: string | null;
  expectedConfigVersion: number;
  name: string;
  opensAt: string;
  locksAt: string;
  rosterSize: number;
  budget: number;
  captainMultiplier: number;
  entries: V3OrganizerFantasyEntry[];
};

export type V3FantasyConfigCommandResult = {
  status: "processing" | "succeeded" | "failed" | "uncertain";
  operationId: string;
  correlationId?: string;
  replayed?: boolean;
  result?: {
    ok?: boolean;
    gameId?: string;
    editionId?: string;
    showId?: string;
    state?: string;
    stateVersion?: number;
    eventId?: string;
    operationId?: string;
    serverTime?: string;
  };
  error?: { code?: string; metadata?: Record<string, unknown> } | null;
};

export async function getV3OrganizerFantasyGame(
  editionId: string,
  gameId: string | null = null,
): Promise<V3OrganizerFantasyProjection> {
  const { data, error } = await (supabase as any).rpc("v3_organizer_fantasy_game", {
    p_edition_id: editionId,
    p_game_id: gameId,
  });
  if (error) throw error;
  if (!data || data.editionId !== editionId) {
    throw new Error("Fantasy projection crossed Organizer edition scope.");
  }
  if (gameId && data.gameId !== gameId) {
    throw new Error("Fantasy projection returned the wrong game subject.");
  }
  return data as V3OrganizerFantasyProjection;
}

export function createV3FantasyConfigOperationId(): string {
  if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") {
    throw new Error("Secure operation identity is unavailable in this browser.");
  }
  return crypto.randomUUID();
}

export async function saveV3FantasyGameConfig(
  input: V3SaveFantasyGameInput,
  operationId = createV3FantasyConfigOperationId(),
): Promise<V3FantasyConfigCommandResult> {
  const { data, error } = await (supabase as any).rpc("v3_save_fantasy_game_config", {
    p_edition_id: input.editionId,
    p_show_id: input.showId,
    p_game_id: input.gameId,
    p_expected_config_version: input.expectedConfigVersion,
    p_name: input.name,
    p_opens_at: input.opensAt,
    p_locks_at: input.locksAt,
    p_roster_size: input.rosterSize,
    p_budget: input.budget,
    p_captain_multiplier: input.captainMultiplier,
    p_entries: input.entries.map((entry) => ({
      countryId: entry.countryId,
      cost: entry.cost,
      eligible: entry.eligible,
    })),
    p_operation_id: operationId,
    p_idempotency_key: operationId,
    p_correlation_id: operationId,
  });

  if (!error) return data as V3FantasyConfigCommandResult;

  const { data: reconciled, error: reconcileError } = await (supabase as any).rpc(
    "studio2_reconcile_operation",
    { p_operation_id: operationId },
  );
  const recovery = reconciled as V3FantasyConfigCommandResult | null;
  if (!reconcileError && recovery?.status === "succeeded") return recovery;

  throw error;
}
