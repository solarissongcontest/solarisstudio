import { useRef } from "react";

import { supabase } from "@/integrations/supabase/client";

/**
 * Maintains one operation identity across an uncertain/lost response. Changing
 * the reviewed semantic input starts a new operation, never reuses the old key.
 * Call clear() only after receiving the canonical success receipt.
 */
export function useV3IntegrityCaseCommand() {
  const pending = useRef<{ fingerprint: string; operationId: string } | null>(null);

  async function execute<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
    const version = args.p_expected_version;
    if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 1) {
      throw new Error("The authoritative Integrity version is unavailable. Refresh the case before changing it.");
    }
    const fingerprint = JSON.stringify([name, args]);
    if (!pending.current || pending.current.fingerprint !== fingerprint) {
      pending.current = { fingerprint, operationId: crypto.randomUUID() };
    }
    const operationId = pending.current.operationId;
    const { data, error } = await (supabase as any).rpc(name, {
      ...args,
      p_operation_id: operationId,
      p_idempotency_key: operationId,
    });
    if (error) throw new Error(error.message);
    return data as T;
  }

  function clear() {
    pending.current = null;
  }

  return { execute, clear };
}
