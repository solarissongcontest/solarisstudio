import { requireMergedTelevotingAdminServer } from "@/integrations/televoting/admin-session.server";
import { televotingAdmin } from "@/integrations/televoting/client.server";
import { syncMergedRoundFromSolarisServer } from "@/integrations/televoting/solaris-sync.server";

export type TelevotingAutoSyncSummary = {
  editionId: string;
  synced: string[];
  skipped: Array<{ roundId: string; reason: string }>;
  failed: Array<{ roundId: string; error: string }>;
};

function errorMessage(value: unknown) {
  return value instanceof Error ? value.message : String(value ?? "Unknown error");
}

async function recordAutoSyncEvent(
  db: any,
  data: {
    editionId: string;
    roundId: string;
    status: "completed" | "failed";
    sourceMode?: string | null;
    showId?: string | null;
    error?: string | null;
  },
) {
  const now = new Date().toISOString();
  const { error } = await db.from("integration_events").insert({
    service: "televoting",
    event_type: data.status === "completed" ? "round.lineup.autosynced" : "round.lineup.autosync_failed",
    entity_type: "edition",
    entity_id: data.editionId,
    remote_id: data.roundId,
    payload: {
      source_mode: data.sourceMode ?? null,
      show_id: data.showId ?? null,
    },
    status: data.status,
    attempts: 1,
    last_error: data.error ?? null,
    completed_at: data.status === "completed" ? now : null,
    updated_at: now,
  });

  if (error) console.error("[Televoting auto-sync] Could not record integration event", error);
}

/**
 * Refresh every already-bound Televoting round for an edition that is still a
 * mutable draft. Open, closed and frozen rounds are deliberately never changed
 * automatically, so submitted ballots and historical results remain immutable.
 */
export async function autoSyncDraftTelevotingRoundsForEditionServer(
  editionId: string,
): Promise<TelevotingAutoSyncSummary> {
  await requireMergedTelevotingAdminServer();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;

  const summary: TelevotingAutoSyncSummary = {
    editionId,
    synced: [],
    skipped: [],
    failed: [],
  };

  const { data: bindings, error: bindingError } = await db
    .from("televoting_round_bindings")
    .select("remote_round_id,source_mode,show_id,frozen_at")
    .eq("edition_id", editionId);
  if (bindingError) throw new Error(bindingError.message);
  if (!bindings?.length) return summary;

  const roundIds = bindings.map((binding: any) => String(binding.remote_round_id));
  const { data: rounds, error: roundError } = await televotingAdmin
    .from("rounds")
    .select("id,status")
    .in("id", roundIds);
  if (roundError) throw new Error(roundError.message);

  const statusByRound = new Map<string, string>(
    (rounds ?? []).map((round) => [String(round.id), String(round.status)]),
  );

  for (const binding of bindings) {
    const roundId = String(binding.remote_round_id);
    const status = statusByRound.get(roundId);

    if (!status) {
      summary.skipped.push({ roundId, reason: "remote_round_missing" });
      continue;
    }
    if (binding.frozen_at) {
      summary.skipped.push({ roundId, reason: "frozen" });
      continue;
    }
    if (status !== "draft") {
      summary.skipped.push({ roundId, reason: `status_${status}` });
      continue;
    }

    try {
      await syncMergedRoundFromSolarisServer({
        roundId,
        sourceMode: binding.source_mode === "show" ? "show" : "edition",
        showId: binding.show_id ?? null,
      });
      summary.synced.push(roundId);
      await recordAutoSyncEvent(db, {
        editionId,
        roundId,
        status: "completed",
        sourceMode: binding.source_mode,
        showId: binding.show_id,
      });
    } catch (caught) {
      const message = errorMessage(caught);
      summary.failed.push({ roundId, error: message });
      await recordAutoSyncEvent(db, {
        editionId,
        roundId,
        status: "failed",
        sourceMode: binding.source_mode,
        showId: binding.show_id,
        error: message,
      });
    }
  }

  return summary;
}
