import { requireSolarisCapabilityServer } from "@/integrations/supabase/capabilities.server";
import { requireMergedTelevotingAdminServer } from "@/integrations/televoting/admin-session.server";
import { televotingAdmin } from "@/integrations/televoting/client.server";
import {
  ensureCanonicalTelevotingEditionsServer,
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
  entry_count: number;
};

async function audit(
  actor: { id: string; username: string },
  action: string,
  values: { targetType?: string; targetId?: string; oldValues?: unknown; newValues?: unknown; auditId?: string },
) {
  const { error } = await televotingAdmin.from("admin_audit_log").insert({
    ...(values.auditId ? { id: values.auditId } : {}),
    actor_admin_id: actor.id,
    actor_username: actor.username,
    action,
    target_type: values.targetType ?? null,
    target_id: values.targetId ?? null,
    old_values: values.oldValues ?? null,
    new_values: values.newValues ?? null,
  });
  // A replay of a client-keyed creation must not produce duplicate audit rows.
  // Keep historical audit behaviour unchanged for other operations.
  if (values.auditId && error && error.code !== "23505") throw new Error(error.message);
}

export async function getMergedTelevotingRoundsServer() {
  await requireMergedTelevotingAdminServer();
  const canonicalEditions = await ensureCanonicalTelevotingEditionsServer();

  // Bound drafts are projections, not independent participant lists. Refresh
  // them whenever the organizer enters the Televoting rounds workspace so
  // direct Solaris Studio edits are picked up even when Confirmations was not
  // the writer that changed the canonical data.
  const { autoSyncDraftTelevotingRoundsForEditionServer } = await import(
    "@/integrations/televoting/auto-sync.server"
  );
  for (const edition of canonicalEditions) {
    try {
      await autoSyncDraftTelevotingRoundsForEditionServer(edition.solaris_id);
    } catch (caught) {
      console.error(
        `[Televoting] Could not refresh draft projections for SSC${edition.edition_number}`,
        caught,
      );
    }
  }

  const [roundsResult, entriesResult] = await Promise.all([
    televotingAdmin.from("rounds").select("id,edition_id,name,status,opened_at,closed_at,participant_mode,self_voting_mode").order("created_at", { ascending: true }),
    televotingAdmin.from("round_entries").select("round_id"),
  ]);

  if (roundsResult.error) throw new Error(roundsResult.error.message);
  if (entriesResult.error) throw new Error(entriesResult.error.message);

  const counts = new Map<string, number>();
  for (const entry of entriesResult.data ?? []) {
    counts.set(entry.round_id, (counts.get(entry.round_id) ?? 0) + 1);
  }

  const roundRows = (roundsResult.data ?? []).map((round) => ({
    ...round,
    status: round.status as "draft" | "open" | "closed",
    participant_mode: String(round.participant_mode ?? "countries"),
    self_voting_mode: String(round.self_voting_mode ?? "country_match"),
    entry_count: counts.get(round.id) ?? 0,
  }));

  return canonicalEditions.map((edition) => ({
    ...edition,
    rounds: roundRows.filter((round) => round.edition_id === edition.id),
  }));
}

export async function createMergedTelevotingRoundServer(data: {
  editionId: string;
  name: string;
  roundId: string;
}) {
  const actor = await requireMergedTelevotingAdminServer();
  await requireSolarisCapabilityServer("voting.manage", data.editionId);

  // The page already uses this exact-edition, read-only RPC. Never run the
  // catalogue-wide edition synchronizer just to create one draft: that loops
  // over historical editions and can exhaust Cloudflare Worker subrequests.
  const { data: rawOverview, error: overviewError } = await televotingAdmin.rpc(
    "admin_rounds_page_overview",
    { p_solaris_edition_id: data.editionId },
  );
  if (overviewError) throw new Error(overviewError.message);
  const overview = rawOverview as {
    linked?: boolean;
    edition?: { id?: string; solaris_id?: string; edition_number?: number } | null;
  } | null;
  const remoteEditionId = overview?.edition?.id;
  if (!overview?.linked || !remoteEditionId || overview.edition?.solaris_id !== data.editionId) {
    throw new Error("This Solaris edition is not linked to public voting. Link it before creating a round.");
  }

  // A stable client-generated UUID prevents duplicate drafts after an uncertain
  // Worker response. Replays may only recover the same unchanged draft.
  const { data: inserted, error: insertError } = await televotingAdmin
    .from("rounds")
    .insert({ id: data.roundId, edition_id: remoteEditionId, name: data.name, status: "draft" })
    .select("id,name")
    .single();
  const replay = insertError?.code === "23505";
  if (insertError && !replay) throw new Error(insertError.message);

  let row: { id: string; name: string } | null = inserted;
  if (replay) {
    const { data: existing, error: readError } = await televotingAdmin
      .from("rounds")
      .select("id,edition_id,name,status")
      .eq("id", data.roundId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!existing || existing.edition_id !== remoteEditionId || existing.name !== data.name || existing.status !== "draft") {
      throw new Error("This round creation can no longer be safely retried. Refresh the voting rounds.");
    }
    row = { id: existing.id, name: existing.name };
  }
  if (!row) throw new Error("Round creation returned no round. Refresh before retrying.");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const solaris = supabaseAdmin as any;
  let alreadyBound = false;
  if (replay) {
    const { data: binding, error: bindingReadError } = await solaris
      .from("televoting_round_bindings")
      .select("remote_edition_id,edition_id")
      .eq("remote_round_id", row.id)
      .maybeSingle();
    if (bindingReadError) throw new Error(bindingReadError.message);
    if (binding) {
      if (binding.remote_edition_id !== remoteEditionId || binding.edition_id !== data.editionId) {
        throw new Error("Existing round binding has a different edition. No changes were made.");
      }
      alreadyBound = true;
    }
  }

  if (!alreadyBound) {
    const now = new Date().toISOString();
    const { error: bindingError } = await solaris.from("televoting_round_bindings").upsert(
      {
        remote_round_id: row.id,
        remote_edition_id: remoteEditionId,
        edition_id: data.editionId,
        show_id: null,
        source_mode: "edition",
        last_synced_at: null,
        frozen_at: null,
        updated_at: now,
      },
      { onConflict: "remote_round_id" },
    );
    if (bindingError) throw new Error(bindingError.message);
  }

  // Line-up synchronization is a separate explicit Organizer action, after
  // selecting the appropriate edition/show source. Do not make draft creation
  // fan out into per-country/per-entry writes.
  await audit(actor, "create_round", {
    auditId: row.id,
    targetType: "round",
    targetId: row.id,
    newValues: {
      name: data.name,
      edition_id: remoteEditionId,
      solaris_edition_id: data.editionId,
      edition_number: overview.edition?.edition_number ?? null,
      canonical_source: "edition",
      lineup_requires_configuration: true,
    },
  });
  return { ...row, sync_warning: null };
}

export async function renameMergedTelevotingRoundServer(data: { id: string; name: string }) {
  const actor = await requireMergedTelevotingAdminServer();
  const { data: before } = await televotingAdmin.from("rounds").select("name").eq("id", data.id).maybeSingle();
  const { error } = await televotingAdmin.from("rounds").update({ name: data.name }).eq("id", data.id);
  if (error) throw new Error(error.message);
  await audit(actor, "rename_round", {
    targetType: "round",
    targetId: data.id,
    oldValues: before,
    newValues: { name: data.name },
  });
  return { ok: true };
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

export async function deleteMergedTelevotingRoundServer(data: { id: string }) {
  const actor = await requireMergedTelevotingAdminServer();
  const { data: before, error: readError } = await televotingAdmin
    .from("rounds")
    .select("id,name,status,edition_id")
    .eq("id", data.id)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!before) throw new Error("Round not found");
  if (before.status !== "draft") throw new Error("Only draft rounds can be deleted");

  const { error } = await televotingAdmin.from("rounds").delete().eq("id", data.id);
  if (error) throw new Error(error.message);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await (supabaseAdmin as any)
    .from("televoting_round_bindings")
    .delete()
    .eq("remote_round_id", data.id);

  await audit(actor, "delete_round", { targetType: "round", targetId: data.id, oldValues: before });
  return { ok: true };
}