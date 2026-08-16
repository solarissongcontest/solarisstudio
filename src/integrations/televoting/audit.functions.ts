import { createServerFn } from "@tanstack/react-start";

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
  .handler(async ({ data }) => {
    const { listMergedAuditLogServer } = await import(
      "@/integrations/televoting/audit.server"
    );
    return listMergedAuditLogServer(data) as Promise<MergedAuditRow[]>;
  });
