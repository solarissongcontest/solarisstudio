import { requireMergedTelevotingAdminServer } from "@/integrations/televoting/admin-session.server";
import { televotingAdmin } from "@/integrations/televoting/client.server";

export type AuditJson =
  | string
  | number
  | boolean
  | null
  | AuditJson[]
  | { [key: string]: AuditJson };

export type MergedAuditRow = {
  id: string;
  actor_admin_id: string | null;
  actor_username: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  old_values: AuditJson | null;
  new_values: AuditJson | null;
  reason: string | null;
  created_at: string;
};

export async function listMergedAuditLogServer(filters: {
  action?: string | null;
  actor?: string | null;
  targetType?: string | null;
  limit?: number;
}): Promise<MergedAuditRow[]> {
  await requireMergedTelevotingAdminServer();

  let query = televotingAdmin
    .from("admin_audit_log")
    .select("id,actor_admin_id,actor_username,action,target_type,target_id,old_values,new_values,reason,created_at")
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(filters.limit ?? 500, 1000)));

  if (filters.action) query = query.eq("action", filters.action);
  if (filters.actor) query = query.ilike("actor_username", `%${filters.actor}%`);
  if (filters.targetType) query = query.eq("target_type", filters.targetType);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: String(row.id),
    actor_admin_id: row.actor_admin_id == null ? null : String(row.actor_admin_id),
    actor_username: row.actor_username == null ? null : String(row.actor_username),
    action: String(row.action ?? "unknown"),
    target_type: row.target_type == null ? null : String(row.target_type),
    target_id: row.target_id == null ? null : String(row.target_id),
    old_values: (row.old_values ?? null) as AuditJson | null,
    new_values: (row.new_values ?? null) as AuditJson | null,
    reason: row.reason == null ? null : String(row.reason),
    created_at: String(row.created_at),
  }));
}
