import { createSolarisAuthenticatedClientServer } from "@/integrations/supabase/organizer.server";
import { createSystemError, toSystemError } from "@/lib/system-error";
import type { SystemError, SystemJsonValue, SystemReceipt } from "@/lib/system-operation-contract";
import { normalizeSystemReceipt } from "@/lib/system-receipt";

export { normalizeSystemReceipt } from "@/lib/system-receipt";

export type SystemReconciliationResult<TResult extends SystemJsonValue = SystemJsonValue> =
  | { ok: true; receipt: SystemReceipt<TResult> }
  | { ok: false; error: SystemError };

type ReconciliationClient = {
  rpc: (
    name: "studio2_reconcile_operation",
    parameters: { p_operation_id: string },
  ) => Promise<{ data: unknown; error: unknown }>;
};

type ReconciliationDependencies = {
  createClient: () => ReconciliationClient;
};

const defaultReconciliationDependencies: ReconciliationDependencies = {
  createClient: () => createSolarisAuthenticatedClientServer() as unknown as ReconciliationClient,
};

export async function reconcileSystemOperationServer<
  TResult extends SystemJsonValue = SystemJsonValue,
>(
  operationId: string,
  dependencies: ReconciliationDependencies = defaultReconciliationDependencies,
): Promise<SystemReconciliationResult<TResult>> {
  try {
    const client = dependencies.createClient();
    const { data, error } = await client.rpc("studio2_reconcile_operation", {
      p_operation_id: operationId,
    });

    if (error) return { ok: false, error: toSystemError(error) };
    const receipt = normalizeSystemReceipt<TResult>(data);
    if (!receipt) return { ok: false, error: createSystemError("DATABASE") };
    return { ok: true, receipt };
  } catch (error) {
    return { ok: false, error: toSystemError(error) };
  }
}
