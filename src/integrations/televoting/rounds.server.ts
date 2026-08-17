import { requireMergedTelevotingAdminServer } from "@/integrations/televoting/admin-session.server";
import { televotingAdmin } from "@/integrations/televoting/client.server";
import {
  ensureCanonicalTelevotingEditionsServer,
  syncMergedRoundFromSolarisServer,
} from "@/integrations/televoting/solaris-sync.server";

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
  values: { targetType?: string; targetId?: string; oldValues?: unknown; newValues?: unknown },
) {
  await televotingAdmin.from("admin_audit_log").insert({
    actor_admin_id: actor.id,
    actor_username: actor.username,
    action,
    target_type: values.targetType ?? null,
    target_id: values.targetId ?? null,
    old_values: values.oldValues ?? null,
    new_values: values.newValues ?? null,
  });
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

export async function createMergedTelevotingRoundServer(data: { editionId: string; name: string }) {
  const actor = await requireMergedTelevotingAdminServer();
  const canonicalEditions = await ensureCanonicalTelevotingEditionsServer();
  const edition = canonicalEditions.find((candidate) => candidate.id === data.editionId);
  if (!edition) throw new Error("Choose a canonical Solaris edition");

  const { data: row, error } = await televotingAdmin
    .from("rounds")
    .insert({ edition_id: edition.id, name: data.name, status: "draft" })
    .select("id,name")
    .single();
  if (error) throw new Error(error.message);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const solaris = supabaseAdmin as any;
  const now = new Date().toISOString();
  const { error: bindingError } = await solaris.from("televoting_round_bindings").upsert(
    {
      remote_round_id: row.id,
      remote_edition_id: edition.id,
      edition_id: edition.solaris_id,
      show_id: null,
      source_mode: "edition",
      last_synced_at: null,
      frozen_at: null,
      updated_at: now,
    },
    { onConflict: "remote_round_id" },
  );
  if (bindingError) throw new Error(bindingError.message);

  let syncWarning: string | null = null;
  try {
    await syncMergedRoundFromSolarisServer({
      roundId: row.id,
      sourceMode: "edition",
      showId: null,
    });
  } catch (caught) {
    // Keep the newly-created draft bound even when an edition does not yet have
    // enough confirmed participants to form a valid voting round. Future
    // confirmation changes will retry it automatically.
    syncWarning = caught instanceof Error ? caught.message : "Canonical line-up could not be populated yet";
  }

  await audit(actor, "create_round", {
    targetType: "round",
    targetId: row.id,
    newValues: {
      name: data.name,
      edition_id: edition.id,
      solaris_edition_id: edition.solaris_id,
      edition_number: edition.edition_number,
      canonical_source: "edition",
      canonical_sync_warning: syncWarning,
    },
  });
  return { ...row, sync_warning: syncWarning };
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

export async function setMergedTelevotingRoundStatusServer(data: { id: string; status: "draft" | "open" | "closed" }) {
  const actor = await requireMergedTelevotingAdminServer();

  if (data.status === "open") {
    const { count, error: countError } = await televotingAdmin
      .from("round_entries")
      .select("id", { count: "exact", head: true })
      .eq("round_id", data.id);
    if (countError) throw new Error(countError.message);
    const entryCount = count ?? 0;
    if (entryCount < 2 || entryCount > 50) {
      throw new Error(`Round must have between 2 and 50 entries (has ${entryCount})`);
    }
  }

  const patch: { status: "draft" | "open" | "closed"; opened_at?: string; closed_at?: string } = {
    status: data.status,
  };
  if (data.status === "open") patch.opened_at = new Date().toISOString();
  if (data.status === "closed") patch.closed_at = new Date().toISOString();

  const { data: before } = await televotingAdmin.from("rounds").select("status").eq("id", data.id).maybeSingle();
  const { error } = await televotingAdmin.from("rounds").update(patch).eq("id", data.id);
  if (error) {
    if (error.code === "23505") throw new Error("Another round is already open. Close it first.");
    throw new Error(error.message);
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const solaris = supabaseAdmin as any;
  if (data.status === "open") {
    await solaris
      .from("televoting_round_bindings")
      .update({ frozen_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("remote_round_id", data.id);
  } else if (data.status === "draft") {
    await solaris
      .from("televoting_round_bindings")
      .update({ frozen_at: null, updated_at: new Date().toISOString() })
      .eq("remote_round_id", data.id);
  }

  await audit(actor, `round_${data.status}`, {
    targetType: "round",
    targetId: data.id,
    oldValues: before,
    newValues: { status: data.status },
  });
  return { ok: true };
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