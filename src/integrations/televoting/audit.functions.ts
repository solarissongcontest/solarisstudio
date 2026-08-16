import { createServerFn } from "@tanstack/react-start";
import type { AuditJson } from "@/integrations/televoting/audit.server";

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

export const listMergedAuditLog = createServerFn({ method: "POST" })
  .inputValidator((data: {
    action?: string | null;
    actor?: string | null;
    targetType?: string | null;
    limit?: number;
  } = {}) => ({
    action: data.action?.trim() || null,
    actor: data.actor?.trim() || null,
    targetType: data.targetType?.trim() || null,
    limit: Number.isFinite(data.limit) ? Math.max(1, Math.min(Number(data.limit), 1000)) : 500,
  }))
  .handler(async ({ data }): Promise<MergedAuditRow[]> => {
    const { listMergedAuditLogServer } = await import(
      "@/integrations/televoting/audit.server"
    );
    const rows = await listMergedAuditLogServer(data);
    return rows;
  });
