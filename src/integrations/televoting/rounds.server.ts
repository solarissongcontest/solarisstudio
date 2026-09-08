import { requireMergedTelevotingAdminServer } from "@/integrations/televoting/admin-session.server";
import { televotingAdmin } from "@/integrations/televoting/client.server";
import { syncMergedRoundFromSolarisServer } from "@/integrations/televoting/solaris-sync.server";

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

type SelectedEditionProjection = {
  id: string;
  solaris_id: string;
  name: string;
  edition_number: number;
  is_active: boolean;
  is_archived: boolean;
};

async function solarisDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function resolveSelectedEditionProjectionServer(
  solarisEditionId: string,
): Promise<SelectedEditionProjection> {
  const db = await solarisDb();

  const [{ data: edition, error: editionError }, { data: link, error: linkError }] = await Promise.all([
    db
      .from("editions")
      .select("id,name,edition_number,status")
      .eq("id", solarisEditionId)
      .maybeSingle(),
    db
      .from("integration_links")
      .select("remote_id")
      .eq("service", "televoting")
      .eq("entity_type", "edition")
      .eq("solaris_id", solarisEditionId)
      .maybeSingle(),
  ]);

  if (editionError) throw new Error(editionError.message);
  if (!edition) throw new Error("Selected Solaris edition was not found");
  if (linkError) throw new Error(linkError.message);

  const editionNumber = Number(edition.edition_number);
  if (!Number.isInteger(editionNumber)) throw new Error("Selected Solaris edition has no edition number");

  let remote: any = null;
  if (link?.remote_id) {
    const linked = await televotingAdmin
      .from("editions")
      .select("id,name,is_active,is_archived")
      .eq("id", link.remote_id)
      .maybeSingle();
    if (linked.error) throw new Error(linked.error.message);
    remote = linked.data;
  }

  if (!remote) {
    const byName = await televotingAdmin
      .from("editions")
      .select("id,name,is_active,is_archived")
      .eq("name", edition.name)
      .limit(1);
    if (byName.error) throw new Error(byName.error.message);
    remote = byName.data?.[0] ?? null;
  }

  const isActive = edition.status === "active";
  const isArchived = edition.status === "completed" || edition.status === "finished";

  if (!remote) {
    const created = await televotingAdmin
      .from("editions")
      .insert({ name: edition.name, is_active: isActive, is_archived: isArchived })
      .select("id,name,is_active,is_archived")
      .single();
    if (created.error) throw new Error(created.error.message);
    remote = created.data;
  }

  if (!link?.remote_id || link.remote_id !== remote.id) {
    const now = new Date().toISOString();
    const linked = await db.from("integration_links").upsert(
      {
        service: "televoting",
        entity_type: "edition",
        solaris_id: solarisEditionId,
        remote_id: remote.id,
        edition_id: solarisEditionId,
        sync_status: "linked",
        metadata: { edition_number: editionNumber },
        last_synced_at: now,
        updated_at: now,
      },
      { onConflict: "service,entity_type,remote_id" },
    );
    if (linked.error) throw new Error(linked.error.message);
  }

  return {
    id: String(remote.id),
    solaris_id: String(edition.id),
    name: String(edition.name),
    edition_number: editionNumber,
    is_active: isActive,
    is_archived: isArchived,
  };
}

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

export async function getMergedTelevotingRoundsServer(solarisEditionId: string) {
  await requireMergedTelevotingAdminServer();
  const edition = await resolveSelectedEditionProjectionServer(solarisEditionId);

  // Reads must stay reads. Do not reconcile every historical edition or auto-sync
  // draft line-ups merely because an organizer opened this page. Those fan-out
  // operations can exceed Cloudflare Worker's per-invocation subrequest limit.
  const roundsResult = await televotingAdmin
    .from("rounds")
    .select("id,edition_id,name,status,opened_at,closed_at,participant_mode,self_voting_mode")
    .eq("edition_id", edition.id)
    .order("created_at", { ascending: true });
  if (roundsResult.error) throw new Error(roundsResult.error.message);

  const roundIds = (roundsResult.data ?? []).map((round) => round.id);
  let entryRows: Array<{ round_id: string }> = [];
  if (roundIds.length) {
    const entriesResult = await televotingAdmin
      .from("round_entries")
      .select("round_id")
      .in("round_id", roundIds);
    if (entriesResult.error) throw new Error(entriesResult.error.message);
    entryRows = entriesResult.data ?? [];
  }

  const counts = new Map<string, number>();
  for (const entry of entryRows) {
    counts.set(entry.round_id, (counts.get(entry.round_id) ?? 0) + 1);
  }

  const rounds = (roundsResult.data ?? []).map((round) => ({
    ...round,
    status: round.status as "draft" | "open" | "closed",
    participant_mode: String(round.participant_mode ?? "countries"),
    self_voting_mode: String(round.self_voting_mode ?? "country_match"),
    entry_count: counts.get(round.id) ?? 0,
  }));

  return { ...edition, rounds };
}

export async function createMergedTelevotingRoundServer(data: { solarisEditionId: string; name: string }) {
  const actor = await requireMergedTelevotingAdminServer();
  const edition = await resolveSelectedEditionProjectionServer(data.solarisEditionId);

  const { data: row, error } = await televotingAdmin
    .from("rounds")
    .insert({ edition_id: edition.id, name: data.name, status: "draft" })
    .select("id,name")
    .single();
  if (error) throw new Error(error.message);

  const db = await solarisDb();
  const now = new Date().toISOString();
  const { error: bindingError } = await db.from("televoting_round_bindings").upsert(
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

  const db = await solarisDb();
  if (data.status === "open") {
    await db
      .from("televoting_round_bindings")
      .update({ frozen_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("remote_round_id", data.id);
  } else if (data.status === "draft") {
    await db
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

  const db = await solarisDb();
  await db
    .from("televoting_round_bindings")
    .delete()
    .eq("remote_round_id", data.id);

  await audit(actor, "delete_round", { targetType: "round", targetId: data.id, oldValues: before });
  return { ok: true };
}
