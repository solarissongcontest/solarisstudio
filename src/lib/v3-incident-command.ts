import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { createOrganisationCommand } from "@/lib/organisation-operation-contract";
import { normalizeSystemReceipt } from "@/lib/system-receipt";
import type { SystemJsonValue, SystemReceipt } from "@/lib/system-operation-contract";

const supabase = typedSupabase as any;

export type V3IncidentAction =
  | "create"
  | "update"
  | "acknowledge"
  | "declare_crisis"
  | "timeline_note"
  | "transition";

export type V3IncidentStatus =
  | "detected"
  | "investigating"
  | "mitigating"
  | "monitoring"
  | "resolved";

export type V3IncidentCommandInput = {
  editionId: string;
  incidentId?: string | null;
  action: V3IncidentAction;
  expectedVersion?: number | null;
  payload?: Record<string, unknown>;
  reason?: string | null;
};

export type V3IncidentCommandPreflight = {
  editionId: string;
  incidentId: string | null;
  action: V3IncidentAction;
  riskClass: "R1" | "R2" | "R3";
  requiredCapability: string;
  reasonRequired: boolean;
  expectedVersion: number | null;
  current: Record<string, unknown> | null;
  consequences: string[];
  serverTime: string;
};

export type V3IncidentProjection = {
  editionId: string;
  incidents: Array<Record<string, unknown> & { id: string; version: number }>;
  timeline: Array<Record<string, unknown> & { id: string; incidentId: string }>;
  limit: number;
  serverTime: string;
};

function riskFor(input: V3IncidentCommandInput): "R1" | "R2" | "R3" {
  if (input.action === "declare_crisis") return "R3";
  if (input.action === "transition") {
    const to = String(input.payload?.to ?? "");
    if (to === "resolved") return "R3";
    // Reopen risk is revalidated server-side from canonical current state. The
    // client may conservatively classify ordinary transitions as R2; the server
    // remains authoritative and requires fresh auth for an actual reopen.
    return "R2";
  }
  return "R1";
}

export async function loadIncidentCommandProjection(
  editionId: string,
  options?: { incidentId?: string | null; limit?: number },
): Promise<V3IncidentProjection> {
  const { data, error } = await supabase.rpc("studio2_incident_command_projection", {
    p_edition_id: editionId,
    p_incident_id: options?.incidentId ?? null,
    p_limit: options?.limit ?? 100,
  });
  if (error) throw error;
  return data as V3IncidentProjection;
}

export async function preflightIncidentCommand(
  input: V3IncidentCommandInput,
): Promise<V3IncidentCommandPreflight> {
  const { data, error } = await supabase.rpc("studio2_incident_command_preflight", {
    p_edition_id: input.editionId,
    p_incident_id: input.incidentId ?? null,
    p_action: input.action,
    p_payload: input.payload ?? {},
  });
  if (error) throw error;
  return data as V3IncidentCommandPreflight;
}

/**
 * Apply an Incident Command operation using stable operation identity. The
 * mutation is never blindly retried after a transport failure: we reconcile the
 * original operation id once and surface the original error if no committed
 * success can be proven.
 */
export async function applyIncidentCommandV3(
  input: V3IncidentCommandInput,
): Promise<SystemReceipt<SystemJsonValue>> {
  const command = createOrganisationCommand({
    command: `incident.${input.action}`,
    riskClass: riskFor(input),
    scope: {
      editionId: input.editionId,
      entityId: input.incidentId ?? undefined,
    },
    expectedVersion: input.expectedVersion ?? undefined,
    reason: input.reason?.trim() || undefined,
    payload: {
      editionId: input.editionId,
      incidentId: input.incidentId ?? null,
      action: input.action,
      expectedVersion: input.expectedVersion ?? null,
      payload: input.payload ?? {},
      reason: input.reason?.trim() || null,
    },
  });

  const mutation = await supabase.rpc("studio2_apply_incident_command_v3", {
    p_edition_id: input.editionId,
    p_incident_id: input.incidentId ?? null,
    p_action: input.action,
    p_expected_version: input.expectedVersion ?? null,
    p_payload: input.payload ?? {},
    p_reason: input.reason?.trim() || null,
    p_operation_id: command.operationId,
    p_idempotency_key: command.idempotencyKey,
    p_correlation_id: command.correlationId,
  });

  if (!mutation.error) {
    const receipt = normalizeSystemReceipt(mutation.data);
    if (!receipt || receipt.operationId !== command.operationId || receipt.status !== "succeeded") {
      throw new Error("Incident Command returned an invalid operation receipt.");
    }
    return receipt;
  }

  const reconciliation = await supabase.rpc("studio2_reconcile_operation", {
    p_operation_id: command.operationId,
  });
  if (!reconciliation.error) {
    const receipt = normalizeSystemReceipt(reconciliation.data);
    if (receipt?.operationId === command.operationId && receipt.status === "succeeded") {
      return receipt;
    }
  }

  throw mutation.error;
}
