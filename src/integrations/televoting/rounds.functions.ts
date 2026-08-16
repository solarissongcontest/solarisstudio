import { createServerFn } from "@tanstack/react-start";

import { requireMergedTelevotingAdmin } from "@/integrations/televoting/admin-auth.functions";
import { televotingAdmin } from "@/integrations/televoting/client.server";

export type MergedAdminRound = {
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

export type MergedAdminEdition = {
  id: string;
  name: string;
  is_active: boolean;
  is_archived: boolean;
  rounds: MergedAdminRound[];
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

export const getMergedTelevotingRounds = createServerFn({ method: "GET" }).handler(async () => {
  await requireMergedTelevotingAdmin();

  const [{ data: editions, error: editionError }, { data: rounds, error: roundError }, { data: entries, error: entryError }] = await Promise.all([
    televotingAdmin.from("editions").select("id,name,is_active,is_archived").order("created_at", { ascending: false }),
    televotingAdmin.from("rounds").select("id,edition_id,name,status,opened_at,closed_at,participant_mode,self_voting_mode").order("created_at", { ascending: true }),
    televotingAdmin.from("round_entries").select("round_id"),
  ]);

  if (editionError) throw new Error(editionError.message);
  if (roundError) throw new Error(roundError.message);
  if (entryError) throw new Error(entryError.message);

  const counts = new Map<string, number>();
  for (const entry of entries ?? []) counts.set(entry.round_id, (counts.get(entry.round_id) ?? 0) + 1);

  const roundRows = (rounds ?? []).map((round) => ({
    ...round,
    status: round.status as MergedAdminRound["status"],
    participant_mode: String(round.participant_mode ?? "countries"),
    self_voting_mode: String(round.self_voting_mode ?? "country_match"),
    entry_count: counts.get(round.id) ?? 0,
  }));

  return (editions ?? []).map((edition) => ({
    ...edition,
    rounds: roundRows.filter((round) => round.edition_id === edition.id),
  })) as MergedAdminEdition[];
});

export const createMergedTelevotingRound = createServerFn({ method: "POST" })
  .inputValidator((data: { editionId: string; name: string }) => {
    const name = String(data?.name ?? "").trim();
    if (!data?.editionId) throw new Error("Missing edition");
    if (!name) throw new Error("Round name required");
    return { editionId: data.editionId, name };
  })
  .handler(async ({ data }) => {
    const actor = await requireMergedTelevotingAdmin();
    const { data: row, error } = await televotingAdmin
      .from("rounds")
      .insert({ edition_id: data.editionId, name: data.name, status: "draft" })
      .select("id,name")
      .single();
    if (error) throw new Error(error.message);
    await audit(actor, "create_round", { targetType: "round", targetId: row.id, newValues: { name: data.name, edition_id: data.editionId } });
    return row;
  });

export const renameMergedTelevotingRound = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; name: string }) => {
    const name = String(data?.name ?? "").trim();
    if (!data?.id) throw new Error("Missing round");
    if (!name) throw new Error("Round name required");
    return { id: data.id, name };
  })
  .handler(async ({ data }) => {
    const actor = await requireMergedTelevotingAdmin();
    const { data: before } = await televotingAdmin.from("rounds").select("name").eq("id", data.id).maybeSingle();
    const { error } = await televotingAdmin.from("rounds").update({ name: data.name }).eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(actor, "rename_round", { targetType: "round", targetId: data.id, oldValues: before, newValues: { name: data.name } });
    return { ok: true };
  });

export const setMergedTelevotingRoundStatus = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; status: "draft" | "open" | "closed" }) => {
    if (!data?.id) throw new Error("Missing round");
    if (!["draft", "open", "closed"].includes(data.status)) throw new Error("Invalid status");
    return data;
  })
  .handler(async ({ data }) => {
    const actor = await requireMergedTelevotingAdmin();

    if (data.status === "open") {
      const { count, error: countError } = await televotingAdmin
        .from("round_entries")
        .select("id", { count: "exact", head: true })
        .eq("round_id", data.id);
      if (countError) throw new Error(countError.message);
      const entryCount = count ?? 0;
      if (entryCount < 2 || entryCount > 50) throw new Error(`Round must have between 2 and 50 entries (has ${entryCount})`);
    }

    const patch: Record<string, string> = { status: data.status };
    if (data.status === "open") patch.opened_at = new Date().toISOString();
    if (data.status === "closed") patch.closed_at = new Date().toISOString();

    const { data: before } = await televotingAdmin.from("rounds").select("status").eq("id", data.id).maybeSingle();
    const { error } = await televotingAdmin.from("rounds").update(patch).eq("id", data.id);
    if (error) {
      if (error.code === "23505") throw new Error("Another round is already open. Close it first.");
      throw new Error(error.message);
    }

    await audit(actor, `round_${data.status}`, { targetType: "round", targetId: data.id, oldValues: before, newValues: { status: data.status } });
    return { ok: true };
  });

export const deleteMergedTelevotingRound = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("Missing round");
    return data;
  })
  .handler(async ({ data }) => {
    const actor = await requireMergedTelevotingAdmin();
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
    await audit(actor, "delete_round", { targetType: "round", targetId: data.id, oldValues: before });
    return { ok: true };
  });
