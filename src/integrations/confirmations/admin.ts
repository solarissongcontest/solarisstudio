import { confirmationsSupabase } from "@/integrations/confirmations/client";
import { hasSolarisOrganizerAccess } from "@/integrations/supabase/access";
import { supabase as solarisSupabase } from "@/integrations/supabase/client";

export type ConfirmationRound = {
  id: string;
  edition_id: string;
  name: string;
  status: "draft" | "open" | "closed" | "auto_closed";
  editing_enabled: boolean;
  opens_at: string | null;
  closes_at: string | null;
  response_limit: number | null;
  response_count: number;
  created_at: string;
};

export type ConfirmationEdition = {
  id: string;
  name: string;
  edition_number: number;
  description: string | null;
  status: "draft" | "active" | "finished";
  editing_enabled: boolean;
  created_at: string;
  response_count: number;
  rounds: ConfirmationRound[];
};

export type ConfirmationRoundStatusPreview = {
  riskClass: "R2";
  roundId: string;
  roundName: string;
  editionId: string;
  requestedStatus: "open" | "closed";
  currentStatus: ConfirmationRound["status"];
  expectedVersion: number;
  responseCount: number;
  responseLimit: number | null;
  opensAt: string | null;
  closesAt: string | null;
  requiredRequirementCount: number;
  satisfiedRequirementCount: number;
  waivedRequirementCount: number;
  invalidatedRequirementCount: number;
  expiredClosingTimeWillBeCleared: boolean;
  futureOpeningTimeWillBecomeNow: boolean;
  alreadyApplied: boolean;
  blockers: string[];
};

export type ConfirmationCalendarRow = {
  id: string;
  country: string;
  participating: boolean;
  selection_method: string | null;
  reveal_date_type: string | null;
  reveal_exact_date: string | null;
  reveal_approximate_text: string | null;
  nf_date_type: string | null;
  nf_exact_date: string | null;
  nf_approximate_text: string | null;
  nf_result_date_type: string | null;
  nf_result_exact_date: string | null;
  nf_result_approximate_text: string | null;
  edition_id: string;
  round_id: string;
  edition_name: string | null;
  edition_number: number | null;
  round_name: string | null;
  nf_name: string | null;
};

export type ConfirmationRecoveryCode = {
  id: string;
  country: string;
  instagram_username: string;
  recovery_code: string | null;
  submitted_at: string;
  round_id: string;
  round_name: string;
  edition_id: string;
  edition_name: string;
  edition_number: number;
};

export type ConfirmationRequirement = {
  id: string;
  editionId: string;
  countryId: string;
  countryName: string;
  countryCode: string;
  generation: number;
  status: "required" | "satisfied" | "waived" | "invalidated";
  reason: string;
  validFrom: string;
  resolvedBySubmissionId: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function requireConfirmationsAdmin() {
  const { data: userData, error: userError } = await solarisSupabase.auth.getUser();
  if (userError) throw userError;

  const user = userData.user;
  if (!user) return null;

  return (await hasSolarisOrganizerAccess(user.id)) ? user : null;
}

export async function loadConfirmationEditions(): Promise<ConfirmationEdition[]> {
  const { data, error } = await confirmationsSupabase.rpc("admin_confirmation_editions");
  if (error) throw error;
  return Array.isArray(data) ? (data as unknown as ConfirmationEdition[]) : [];
}

export async function saveConfirmationEdition(payload: {
  id?: string;
  name: string;
  edition_number: number;
  description?: string;
  status: ConfirmationEdition["status"];
  editing_enabled: boolean;
}) {
  const { data, error } = await confirmationsSupabase.rpc("admin_confirmation_save_edition", {
    _payload: payload,
  });
  if (error) throw error;
  return data as string;
}

export async function deleteConfirmationEdition(id: string) {
  const { data, error } = await confirmationsSupabase.rpc("admin_confirmation_delete_edition", {
    _id: id,
  });
  if (error) throw error;
  return data === true;
}

export async function setConfirmationEditionEditing(id: string, enabled: boolean) {
  const { data, error } = await confirmationsSupabase.rpc("admin_confirmation_set_edition_editing", {
    _id: id,
    _enabled: enabled,
  });
  if (error) throw error;
  return data === true;
}

export async function saveConfirmationRound(payload: {
  id?: string;
  edition_id: string;
  name: string;
  opens_at: string | null;
  closes_at: string | null;
  response_limit: number | null;
  editing_enabled: boolean;
}) {
  const { data, error } = await confirmationsSupabase.rpc("admin_confirmation_save_round", {
    _payload: payload,
  });
  if (error) throw error;
  return data as string;
}

export async function deleteConfirmationRound(id: string) {
  const { data, error } = await confirmationsSupabase.rpc("admin_confirmation_delete_round", {
    _id: id,
  });
  if (error) throw error;
  return data === true;
}

export async function previewConfirmationRoundStatus(input: {
  roundId: string;
  status: "open" | "closed";
}): Promise<ConfirmationRoundStatusPreview> {
  const { data, error } = await confirmationsSupabase.rpc(
    "admin_confirmation_round_status_preview",
    {
      p_round_id: input.roundId,
      p_status: input.status,
    },
  );
  if (error) throw error;
  return data as unknown as ConfirmationRoundStatusPreview;
}

export async function applyConfirmationRoundStatus(input: {
  roundId: string;
  status: "open" | "closed";
  operationId: string;
  idempotencyKey: string;
  expectedVersion: number;
}) {
  const { data, error } = await confirmationsSupabase.rpc(
    "admin_confirmation_apply_round_status",
    {
      p_round_id: input.roundId,
      p_status: input.status,
      p_operation_id: input.operationId,
      p_idempotency_key: input.idempotencyKey,
      p_expected_version: input.expectedVersion,
    },
  );
  if (error) throw error;
  return data as unknown as {
    ok: boolean;
    changed: boolean;
    riskClass: "R2";
    roundId: string;
    previousStatus: ConfirmationRound["status"];
    status: "open" | "closed";
    version: number;
    operationId: string;
  };
}

export async function setConfirmationRoundEditing(id: string, enabled: boolean) {
  const { data, error } = await confirmationsSupabase.rpc("admin_confirmation_set_round_editing", {
    _id: id,
    _enabled: enabled,
  });
  if (error) throw error;
  return data === true;
}

export async function loadConfirmationCalendar(
  editionId?: string,
  roundId?: string,
): Promise<ConfirmationCalendarRow[]> {
  const { data, error } = await confirmationsSupabase.rpc("admin_confirmation_calendar", {
    _edition_id: editionId || null,
    _round_id: roundId || null,
  });
  if (error) throw error;
  return Array.isArray(data) ? (data as unknown as ConfirmationCalendarRow[]) : [];
}

export async function loadConfirmationRequirements(
  editionId: string,
): Promise<ConfirmationRequirement[]> {
  const { data, error } = await confirmationsSupabase.rpc("admin_confirmation_requirements", {
    p_edition_id: editionId,
  });
  if (error) throw error;
  return Array.isArray(data) ? (data as unknown as ConfirmationRequirement[]) : [];
}

export async function ensureConfirmationRequirements(
  editionId: string,
  countryIds?: string[],
) {
  const { data, error } = await confirmationsSupabase.rpc(
    "admin_confirmation_ensure_requirements",
    {
      p_edition_id: editionId,
      p_country_ids: countryIds?.length ? countryIds : null,
    },
  );
  if (error) throw error;
  return data as { ok: boolean; editionId: string; created: number };
}

export async function reconfirmConfirmationRequirement(input: {
  requirementId: string;
  reason: string;
  operationId: string;
  idempotencyKey: string;
}) {
  const { data, error } = await confirmationsSupabase.rpc(
    "admin_confirmation_reconfirm",
    {
      p_requirement_id: input.requirementId,
      p_reason: input.reason,
      p_operation_id: input.operationId,
      p_idempotency_key: input.idempotencyKey,
    },
  );
  if (error) throw error;
  return data as {
    ok: boolean;
    operationId: string;
    previousRequirementId: string;
    requirementId: string;
    generation: number;
  };
}

export async function waiveConfirmationRequirement(input: {
  requirementId: string;
  reason: string;
  operationId: string;
  idempotencyKey: string;
}) {
  const { data, error } = await confirmationsSupabase.rpc(
    "admin_confirmation_waive_requirement",
    {
      p_requirement_id: input.requirementId,
      p_reason: input.reason,
      p_operation_id: input.operationId,
      p_idempotency_key: input.idempotencyKey,
    },
  );
  if (error) throw error;
  return data as {
    ok: boolean;
    operationId: string;
    requirementId: string;
    status: "waived";
  };
}

export async function loadConfirmationRecoveryCodes(): Promise<ConfirmationRecoveryCode[]> {
  const { data, error } = await confirmationsSupabase.rpc("admin_confirmation_recovery_codes");
  if (error) throw error;
  return Array.isArray(data) ? (data as unknown as ConfirmationRecoveryCode[]) : [];
}
