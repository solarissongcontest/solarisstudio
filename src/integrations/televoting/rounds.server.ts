import { requireMergedTelevotingAdminServer } from "@/integrations/televoting/admin-session.server";
import { televotingAdmin } from "@/integrations/televoting/client.server";
import {
  ensureCanonicalTelevotingEditionsServer,
  syncMergedRoundFromSolarisServer,
} from "@/integrations/televoting/solaris-sync.server";
import type { MergedRoundStatusPreview } from "@/integrations/televoting/rounds.functions";

export type MergedAdminRoundServer = {
  id: string;
  edition_id: string;
  name: string;
  status: "draft" | "open" | "closed";
  opened_at: string | null;
  closed_at: string | null;
  participant_mode: string;
  self_voting_mode: string;
  version: number;
  entry_count: number;
};

/**
 * Legacy all-edition loader retained for compatibility only. Unlike the old
 * implementation it is strictly read-only: entering a workspace must never be
 * an implicit Televote catalog or line-up mutation authority.
 */
export async function getMergedTelevotingRoundsServer() {
  await requireMergedTelevotingAdminServer();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;

  const [solarisResult, linksResult, remoteEditionsResult, roundsResult, entriesResult, versionsResult] =
    await Promise.all([
      db
        .from("editions")
        .select("id,name,edition_number,status")
        .not("edition_number", "is", null)
        .order("edition_number", { ascending: false }),
      db
        .from("integration_links")
        .select("solaris_id,remote_id")
        .eq("service", "televoting")
        .eq("entity_type", "edition"),
      televotingAdmin
        .from("editions")
        .select("id,name,is_active,is_archived,created_at"),
      televotingAdmin
        .from("rounds")
        .select("id,edition_id,name,status,opened_at,closed_at,participant_mode,self_voting_mode")
        .order("created_at", { ascending: true }),
      televotingAdmin.from("round_entries").select("round_id"),
      db.from("studio2_televote_round_versions").select("round_id,version"),
    ]);

  for (const result of [solarisResult, linksResult, remoteEditionsResult, roundsResult, entriesResult, versionsResult]) {
    if (result.error) throw new Error(result.error.message);
  }

  const remoteById = new Map((remoteEditionsResult.data ?? []).map((row: any) => [String(row.id), row]));
  const remoteBySolaris = new Map<string, string>((linksResult.data ?? []).map((row: any): [string, string] => [String(row.solaris_id), String(row.remote_id)]));
  const counts = new Map<string, number>();
  for (const entry of entriesResult.data ?? []) {
    counts.set(String(entry.round_id), (counts.get(String(entry.round_id)) ?? 0) + 1);
  }
  const versions = new Map((versionsResult.data ?? []).map((row: any) => [String(row.round_id), Number(row.version ?? 0)]));

  const roundRows = (roundsResult.data ?? []).map((round: any) => ({
    ...round,
    status: round.status as "draft" | "open" | "closed",
    participant_mode: String(round.participant_mode ?? "countries"),
    self_voting_mode: String(round.self_voting_mode ?? "country_match"),
    version: versions.get(String(round.id)) ?? 0,
    entry_count: counts.get(String(round.id)) ?? 0,
  }));

  return (solarisResult.data ?? []).flatMap((edition: any) => {
    const remoteId = remoteBySolaris.get(String(edition.id));
    if (!remoteId) return [];
    const remote = remoteById.get(remoteId) as any;
    if (!remote) return [];
    return [{
      id: remoteId,
      solaris_id: String(edition.id),
      name: String(edition.name),
      edition_number: Number(edition.edition_number),
      is_active: remote.is_active === true,
      is_archived: remote.is_archived === true,
      rounds: roundRows.filter((round: any) => String(round.edition_id) === remoteId),
    }];
  });
}

export async function createMergedTelevotingRoundServer(data: {
  editionId: string;
  name: string;
  operationId: string;
  idempotencyKey: string;
}) {
  await requireMergedTelevotingAdminServer();

  // Catalog reconciliation is allowed here because this is an explicit
  // Organizer mutation. Read paths above deliberately never invoke it.
  const canonicalEditions = await ensureCanonicalTelevotingEditionsServer();
  const edition = canonicalEditions.find((candidate) => candidate.id === data.editionId);
  if (!edition) throw new Error("Choose a canonical Solaris edition");

  const { data: rawResult, error } = await televotingAdmin.rpc("v3_create_round", {
    p_remote_edition_id: edition.id,
    p_name: data.name,
    p_operation_id: data.operationId,
    p_idempotency_key: data.idempotencyKey,
    p_correlation_id: data.operationId,
  });
  if (error) throw new Error(error.message);
  const result = (rawResult ?? {}) as Record<string, unknown>;
  const roundId = String(result.id ?? "");
  if (!roundId) throw new Error("Canonical Televote round command returned no round id");

  let syncWarning: string | null = null;
  try {
    await syncMergedRoundFromSolarisServer({
      roundId,
      sourceMode: "edition",
      showId: null,
    });
  } catch (caught) {
    // A newly-created draft remains valid when the canonical edition does not
    // yet have enough confirmed participants. Explicit repair/sync can retry.
    syncWarning = caught instanceof Error ? caught.message : "Canonical line-up could not be populated yet";
  }

  return {
    ...result,
    id: roundId,
    name: String(result.name ?? data.name),
    sync_warning: syncWarning,
  };
}

export async function renameMergedTelevotingRoundServer(data: {
  id: string;
  name: string;
  expectedRoundVersion: number;
  operationId: string;
  idempotencyKey: string;
}) {
  await requireMergedTelevotingAdminServer();
  const { data: result, error } = await televotingAdmin.rpc("v3_rename_round", {
    p_round_id: data.id,
    p_name: data.name,
    p_expected_round_version: data.expectedRoundVersion,
    p_operation_id: data.operationId,
    p_idempotency_key: data.idempotencyKey,
    p_correlation_id: data.operationId,
  });
  if (error) throw new Error(error.message);
  return result;
}

export async function previewMergedTelevotingRoundStatusServer(data: {
  id: string;
  status: "draft" | "open" | "closed";
}): Promise<MergedRoundStatusPreview> {
  await requireMergedTelevotingAdminServer();
  const { data: preview, error } = await televotingAdmin.rpc(
    "studio2_round_status_change_preview",
    {
      p_round_id: data.id,
      p_status: data.status,
    },
  );
  if (error) throw new Error(error.message);
  return preview as MergedRoundStatusPreview;
}

export async function setMergedTelevotingRoundStatusServer(data: {
  id: string;
  status: "draft" | "open" | "closed";
  operationId: string;
  idempotencyKey: string;
  expectedGlobalVersion: number;
  expectedRoundVersion: number;
}) {
  await requireMergedTelevotingAdminServer();
  const { data: receipt, error } = await televotingAdmin.rpc(
    "studio2_apply_round_status_change",
    {
      p_round_id: data.id,
      p_status: data.status,
      p_operation_id: data.operationId,
      p_idempotency_key: data.idempotencyKey,
      p_expected_global_version: data.expectedGlobalVersion,
      p_expected_round_version: data.expectedRoundVersion,
    },
  );
  if (error) throw new Error(error.message);
  return receipt;
}

export async function deleteMergedTelevotingRoundServer(data: {
  id: string;
  expectedRoundVersion: number;
  operationId: string;
  idempotencyKey: string;
}) {
  await requireMergedTelevotingAdminServer();
  const { data: result, error } = await televotingAdmin.rpc("v3_delete_draft_round", {
    p_round_id: data.id,
    p_expected_round_version: data.expectedRoundVersion,
    p_operation_id: data.operationId,
    p_idempotency_key: data.idempotencyKey,
    p_correlation_id: data.operationId,
  });
  if (error) throw new Error(error.message);
  return result;
}
