import { supabase } from "@/integrations/supabase/client";

export type CountryAccountStatusCommand = {
  userId: string;
  countryId: string;
  status: "active" | "suspended";
  reason?: string;
  expectedUpdatedAt: string;
  operationId: string;
  idempotencyKey: string;
};

export type CountryAccountStatusReceipt = {
  ok: true;
  userId: string;
  countryId: string;
  status: "active" | "suspended";
  updatedAt: string;
  operationId: string;
  receiptId: string;
  replayed: boolean;
};

export class CountryAccountStatusOutcomeUnknownError extends Error {
  constructor() {
    super("Account change has no confirmed receipt. Reconcile the original operation before trying another change.");
    this.name = "CountryAccountStatusOutcomeUnknownError";
  }
}

export async function executeCountryAccountStatus(command: CountryAccountStatusCommand) {
  if (!Number.isFinite(Date.parse(command.expectedUpdatedAt))) {
    throw new Error("Reload the account before reviewing its access state.");
  }
  const client = supabase as unknown as {
    rpc(name: string, args: Record<string, unknown>): Promise<{
      data: unknown;
      error: { code?: string; message: string; status?: number } | null;
    }>;
  };
  const args = {
    p_user_id: command.userId,
    p_status: command.status,
    p_reason: command.reason ?? null,
    p_expected_updated_at: command.expectedUpdatedAt,
    p_operation_id: command.operationId,
    p_idempotency_key: command.idempotencyKey,
  };
  let result = await client.rpc("v3_set_country_account_status", args);
  // Preserve the original operation and microsecond CAS token on an ambiguous
  // transport retry. Never manufacture a fresh status-change intent here.
  if (result.error && !result.error.code) result = await client.rpc("v3_set_country_account_status", args);
  if (result.error) throw Object.assign(new Error(result.error.message), result.error);
  const value = result.data as Partial<CountryAccountStatusReceipt> | null;
  if (value?.ok !== true || value.userId !== command.userId || value.countryId !== command.countryId ||
      value.status !== command.status || value.operationId !== command.operationId ||
      value.receiptId !== command.operationId || typeof value.replayed !== "boolean" ||
      typeof value.updatedAt !== "string" || !Number.isFinite(Date.parse(value.updatedAt))) {
    throw new CountryAccountStatusOutcomeUnknownError();
  }
  return value as CountryAccountStatusReceipt;
}
