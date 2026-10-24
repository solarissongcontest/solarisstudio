import { requireMergedTelevotingAdminServer } from "@/integrations/televoting/admin-session.server";
import { televotingAdmin } from "@/integrations/televoting/client.server";

export type MergedTelevotingEdition = {
  id: string;
  name: string;
  is_active: boolean;
  is_archived: boolean;
  created_at: string;
  round_count: number;
  vote_count: number;
};

async function audit(
  actor: { id: string; username: string },
  action: string,
  targetId: string,
  oldValues?: unknown,
  newValues?: unknown,
) {
  await televotingAdmin.from("admin_audit_log").insert({
    actor_admin_id: actor.id,
    actor_username: actor.username,
    action,
    target_type: "edition",
    target_id: targetId,
    old_values: oldValues ?? null,
    new_values: newValues ?? null,
  });
}

export async function listMergedTelevotingEditionsServer(): Promise<MergedTelevotingEdition[]> {
  await requireMergedTelevotingAdminServer();
  const [editionResult, roundResult, voteResult] = await Promise.all([
    televotingAdmin.from("editions").select("id,name,is_active,is_archived,created_at").order("created_at", { ascending: false }),
    televotingAdmin.from("rounds").select("id,edition_id"),
    televotingAdmin.from("vote_submissions").select("id,round_id"),
  ]);
  if (editionResult.error) throw new Error(editionResult.error.message);
  if (roundResult.error) throw new Error(roundResult.error.message);
  if (voteResult.error) throw new Error(voteResult.error.message);

  const roundsByEdition = new Map<string, string[]>();
  for (const round of roundResult.data ?? []) {
    const list = roundsByEdition.get(round.edition_id) ?? [];
    list.push(round.id);
    roundsByEdition.set(round.edition_id, list);
  }
  const voteCountByRound = new Map<string, number>();
  for (const vote of voteResult.data ?? []) {
    voteCountByRound.set(vote.round_id, (voteCountByRound.get(vote.round_id) ?? 0) + 1);
  }

  return (editionResult.data ?? []).map((edition) => {
    const roundIds = roundsByEdition.get(edition.id) ?? [];
    return {
      ...edition,
      round_count: roundIds.length,
      vote_count: roundIds.reduce((sum, roundId) => sum + (voteCountByRound.get(roundId) ?? 0), 0),
    };
  }) as MergedTelevotingEdition[];
}

export async function createMergedTelevotingEditionServer(name: string) {
  const actor = await requireMergedTelevotingAdminServer();
  const { data: row, error } = await televotingAdmin
    .from("editions")
    .insert({ name, is_active: false, is_archived: false })
    .select("id,name,is_active,is_archived,created_at")
    .single();
  if (error) throw new Error(error.message);
  await audit(actor, "create_edition", row.id, null, row);
  return row;
}

export async function renameMergedTelevotingEditionServer(data: { id: string; name: string }) {
  const actor = await requireMergedTelevotingAdminServer();
  const { data: before, error: readError } = await televotingAdmin.from("editions").select("name").eq("id", data.id).maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!before) throw new Error("Edition not found");
  const { error } = await televotingAdmin.from("editions").update({ name: data.name }).eq("id", data.id);
  if (error) throw new Error(error.message);
  await audit(actor, "rename_edition", data.id, before, { name: data.name });
  return { ok: true };
}

export async function activateMergedTelevotingEditionServer(id: string) {
  const actor = await requireMergedTelevotingAdminServer();
  const { data: target, error: readError } = await televotingAdmin.from("editions").select("id,name,is_active,is_archived").eq("id", id).maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!target) throw new Error("Edition not found");
  if (target.is_archived) throw new Error("Unarchive the edition before activating it");

  const { error: clearError } = await televotingAdmin.from("editions").update({ is_active: false }).neq("id", id);
  if (clearError) throw new Error(clearError.message);
  const { error } = await televotingAdmin.from("editions").update({ is_active: true }).eq("id", id);
  if (error) throw new Error(error.message);

  await audit(actor, "activate_edition", id, target, { ...target, is_active: true });
  return { ok: true };
}

export async function archiveMergedTelevotingEditionServer(data: { id: string; archived: boolean }) {
  const actor = await requireMergedTelevotingAdminServer();
  const { data: before, error: readError } = await televotingAdmin.from("editions").select("id,name,is_active,is_archived").eq("id", data.id).maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!before) throw new Error("Edition not found");
  if (data.archived && before.is_active) throw new Error("Activate another edition before archiving the active one");

  const { error } = await televotingAdmin.from("editions").update({ is_archived: data.archived }).eq("id", data.id);
  if (error) throw new Error(error.message);
  await audit(actor, data.archived ? "archive_edition" : "unarchive_edition", data.id, before, { ...before, is_archived: data.archived });
  return { ok: true };
}
