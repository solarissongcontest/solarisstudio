import { supabase } from "@/integrations/supabase/client";

/**
 * A network error after a committed S2 publication is NOT evidence of failure.
 * The existing actor-owned S2 receipt is the only recovery authority. We never
 * retry with a fresh operation or infer success from a missing response.
 */
export async function recoverWorldOfficialOperationEnvelope(
  initial: { data: unknown; error: { message?: string } | null },
  operationId: string,
  expectedCommand: string,
): Promise<unknown> {
  if (!initial.error) return initial.data;
  let recovery: { data: unknown; error: unknown };
  try {
    recovery = await (supabase as any).rpc("studio2_reconcile_operation", {
      p_operation_id: operationId,
    });
  } catch {
    throw new Error(initial.error.message || "Official operation could not be confirmed.");
  }

  const row = recovery.data !== null && typeof recovery.data === "object" &&
    !Array.isArray(recovery.data) ? recovery.data as Record<string, unknown> : null;
  const result = row?.result !== null && typeof row?.result === "object" &&
    !Array.isArray(row?.result) ? row?.result as Record<string, unknown> : null;

  if (!recovery.error && row?.status === "succeeded" &&
      row?.command === expectedCommand &&
      row?.operationId === operationId &&
      result?.operationId === operationId) {
    return { ...row, replayed: true };
  }
  throw new Error(initial.error.message || "Official operation could not be confirmed.");
}
