import { supabase as typedSupabase } from "@/integrations/supabase/client";

const supabase = typedSupabase as any;

export type CountryAccountAccessStatus = "active" | "suspended";

export type CountryAccountAccessPreview = {
  riskClass: "R2";
  userId: string;
  countryId: string;
  countryName: string;
  currentStatus: CountryAccountAccessStatus;
  currentSuspensionReason: string | null;
  currentUpdatedAt: string;
  expectedVersion: string;
  targetStatus: CountryAccountAccessStatus;
  sessionPolicy: "preserve_authenticated_session";
  sessionPolicyDetail: string;
  consequence: string;
  blockers: string[];
  serverTime: string;
};

export type CountryAccountAccessResult = {
  ok: boolean;
  riskClass: "R2";
  command: "delegation.suspend" | "delegation.restore";
  operationId: string;
  receiptId: string;
  userId: string;
  countryId: string;
  countryName: string;
  previousStatus: CountryAccountAccessStatus;
  status: CountryAccountAccessStatus;
  previousVersion: string;
  version: string;
  sessionPolicy: "preserve_authenticated_session";
  serverTime: string;
};

function requireId(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

export async function loadCountryAccountAccessPreview(input: {
  userId: string;
  targetStatus: CountryAccountAccessStatus;
}): Promise<CountryAccountAccessPreview> {
  const userId = requireId(input.userId, "Country account");
  const { data, error } = await supabase.rpc("studio2_country_account_access_preview", {
    p_user_id: userId,
    p_target_status: input.targetStatus,
  });
  if (error) throw error;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Country-account access preview returned invalid data.");
  }

  const preview = data as CountryAccountAccessPreview;
  if (preview.userId !== userId || preview.targetStatus !== input.targetStatus) {
    throw new Error("Country-account access preview returned a different subject or target state.");
  }
  if (!preview.expectedVersion || !Array.isArray(preview.blockers)) {
    throw new Error("Country-account access preview is missing version or blocker evidence.");
  }
  return preview;
}

export async function applyCountryAccountAccess(input: {
  userId: string;
  targetStatus: CountryAccountAccessStatus;
  reason?: string | null;
  expectedVersion: string;
  operationId: string;
  idempotencyKey: string;
}): Promise<CountryAccountAccessResult> {
  const userId = requireId(input.userId, "Country account");
  const operationId = requireId(input.operationId, "Operation id");
  const idempotencyKey = requireId(input.idempotencyKey, "Idempotency key");
  if (!input.expectedVersion.trim()) throw new Error("Reviewed country-account version is required.");

  const { data, error } = await supabase.rpc("studio2_apply_country_account_access", {
    p_user_id: userId,
    p_target_status: input.targetStatus,
    p_reason: input.reason ?? null,
    p_expected_updated_at: input.expectedVersion,
    p_operation_id: operationId,
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw error;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Country-account access command returned invalid data.");
  }

  const result = data as CountryAccountAccessResult;
  if (
    !result.ok ||
    result.operationId !== operationId ||
    result.receiptId !== operationId ||
    result.userId !== userId ||
    result.status !== input.targetStatus
  ) {
    throw new Error("Country-account access command returned contradictory receipt evidence.");
  }
  return result;
}
