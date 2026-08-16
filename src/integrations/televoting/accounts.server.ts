import { televotingAdmin } from "@/integrations/televoting/client.server";
import { requireMergedTelevotingAdminServer } from "@/integrations/televoting/admin-session.server";

export type MergedAdminAccount = {
  id: string;
  username: string;
  is_super_admin: boolean;
  disabled: boolean;
  last_login_at: string | null;
  created_at: string;
  created_by: string | null;
  created_by_username: string | null;
};

async function requireSuperAdmin() {
  const admin = await requireMergedTelevotingAdminServer();
  if (!admin.is_super_admin) throw new Error("Super Admin required");
  return admin;
}

async function audit(
  actor: { id: string; username: string },
  action: string,
  opts: { targetId?: string; oldValues?: unknown; newValues?: unknown; reason?: string } = {},
) {
  await televotingAdmin.from("admin_audit_log").insert({
    actor_admin_id: actor.id,
    actor_username: actor.username,
    action,
    target_type: "admin_account",
    target_id: opts.targetId ?? null,
    old_values: opts.oldValues ?? null,
    new_values: opts.newValues ?? null,
    reason: opts.reason ?? null,
  });
}

export async function listMergedAdminAccountsServer(): Promise<MergedAdminAccount[]> {
  await requireSuperAdmin();
  const { data, error } = await televotingAdmin
    .from("admin_accounts")
    .select("id,username,is_super_admin,disabled,last_login_at,created_at,created_by")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const names = new Map(rows.map((row) => [row.id, row.username]));
  return rows.map((row) => ({
    ...row,
    created_by_username: row.created_by ? names.get(row.created_by) ?? null : null,
  })) as MergedAdminAccount[];
}

export async function createMergedAdminAccountServer(data: { username: string; password: string }) {
  const actor = await requireSuperAdmin();
  const { data: hash, error: hashError } = await televotingAdmin.rpc("admin_hash_password", {
    _password: data.password,
  });
  if (hashError) throw new Error(hashError.message);

  const { data: inserted, error } = await televotingAdmin
    .from("admin_accounts")
    .insert({
      username: data.username,
      password_hash: hash as string,
      is_super_admin: false,
      disabled: false,
      created_by: actor.id,
    })
    .select("id,username")
    .single();
  if (error) throw new Error(error.message);
  await audit(actor, "create_admin", { targetId: inserted.id, newValues: { username: inserted.username } });
  return inserted;
}

export async function renameMergedAdminAccountServer(data: { id: string; username: string }) {
  const actor = await requireSuperAdmin();
  const { data: before } = await televotingAdmin.from("admin_accounts").select("id,username").eq("id", data.id).maybeSingle();
  const { error } = await televotingAdmin.from("admin_accounts").update({ username: data.username }).eq("id", data.id);
  if (error) throw new Error(error.message);
  await audit(actor, "rename_admin", { targetId: data.id, oldValues: before, newValues: { username: data.username } });
  return { ok: true };
}

export async function resetMergedAdminPasswordServer(data: { id: string; password: string }) {
  const actor = await requireSuperAdmin();
  const { data: hash, error: hashError } = await televotingAdmin.rpc("admin_hash_password", {
    _password: data.password,
  });
  if (hashError) throw new Error(hashError.message);
  const { error } = await televotingAdmin.from("admin_accounts").update({ password_hash: hash as string }).eq("id", data.id);
  if (error) throw new Error(error.message);
  await televotingAdmin.from("admin_sessions").delete().eq("admin_id", data.id);
  await audit(actor, "reset_password", { targetId: data.id });
  return { ok: true };
}

export async function setMergedAdminDisabledServer(data: { id: string; disabled: boolean }) {
  const actor = await requireSuperAdmin();
  if (actor.id === data.id && data.disabled) throw new Error("You cannot disable your own account");
  const { data: target } = await televotingAdmin.from("admin_accounts").select("id,username,is_super_admin,disabled").eq("id", data.id).maybeSingle();
  if (!target) throw new Error("Admin account not found");
  if (target.is_super_admin) throw new Error("The Super Admin account cannot be disabled here");
  const { error } = await televotingAdmin.from("admin_accounts").update({ disabled: data.disabled }).eq("id", data.id);
  if (error) throw new Error(error.message);
  if (data.disabled) await televotingAdmin.from("admin_sessions").delete().eq("admin_id", data.id);
  await audit(actor, data.disabled ? "disable_admin" : "enable_admin", {
    targetId: data.id,
    oldValues: { disabled: target.disabled },
    newValues: { disabled: data.disabled },
  });
  return { ok: true };
}

export async function deleteMergedAdminAccountServer(data: { id: string; reason?: string }) {
  const actor = await requireSuperAdmin();
  if (actor.id === data.id) throw new Error("You cannot delete your own account");
  const { data: target } = await televotingAdmin.from("admin_accounts").select("id,username,is_super_admin").eq("id", data.id).maybeSingle();
  if (!target) throw new Error("Admin account not found");
  if (target.is_super_admin) throw new Error("The Super Admin account cannot be deleted");
  await televotingAdmin.from("admin_sessions").delete().eq("admin_id", data.id);
  const { error } = await televotingAdmin.from("admin_accounts").delete().eq("id", data.id);
  if (error) throw new Error(error.message);
  await audit(actor, "delete_admin", { targetId: data.id, oldValues: target, reason: data.reason });
  return { ok: true };
}
