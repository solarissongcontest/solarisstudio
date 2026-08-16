import { requireMergedTelevotingAdminServer } from "@/integrations/televoting/admin-session.server";
import { televotingAdmin } from "@/integrations/televoting/client.server";

export type MergedAuditRow = {
  id: string;
  actor_admin_id: string | null;
  actor_username: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  old_values: unknown;
  new_values: unknown;
  reason: string | null;
  created_at: string;
};

export async function listMergedAuditLogServer(filters: {
  action?: string | null;
  actor?: string | null;
  targetType?: string | null;
  limit?: number;
}) {
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
  return (data ?? []) as MergedAuditRow[];
}
