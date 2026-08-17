import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSolarisOrganizerServer } from "@/integrations/supabase/organizer.server";

export type AdminAuditEvent = {
  action: string;
  tableName: string;
  recordId?: string | null;
  editionId?: string | null;
  countryId?: string | null;
  beforeData?: unknown;
  afterData?: unknown;
};

/**
 * Writes an organizer mutation to Solaris' canonical audit trail.
 *
 * Call this only after the mutation succeeds. Audit failures are surfaced to
 * the organizer rather than silently discarded because HOD attribution and
 * integrity-model configuration are themselves integrity-sensitive data.
 */
export async function writeAdminAuditServer(event: AdminAuditEvent) {
  const organizer = await requireSolarisOrganizerServer();
  const db = supabaseAdmin as any;
  const { error } = await db.from("admin_audit_log").insert({
    actor_id: organizer.id,
    action: event.action,
    table_name: event.tableName,
    record_id: event.recordId ?? null,
    edition_id: event.editionId ?? null,
    country_id: event.countryId ?? null,
    before_data: event.beforeData ?? null,
    after_data: event.afterData ?? null,
  });
  if (error) throw new Error(`Mutation succeeded but audit logging failed: ${error.message}`);
}
