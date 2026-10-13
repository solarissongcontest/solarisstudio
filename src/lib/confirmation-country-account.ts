import type {
  ConfirmationReviewEntry,
  ConfirmationReviewNationalFinal,
} from "@/components/ConfirmationReviewStatus";
import { supabase } from "@/integrations/supabase/client";

const confirmations = supabase as any;

export type CountryConfirmationResponse = {
  submission_id: string;
  round_id: string;
  round_name: string;
  edition_id: string;
  edition_name: string;
  edition_number: number;
  country: string;
  participating?: boolean | null;
  submitted_at: string;
  updated_at: string;
  selection_method?: string | null;
  entry_unknown?: boolean | null;
  reveal_date_type?: string | null;
  reveal_exact_date?: string | null;
  reveal_approximate_text?: string | null;
  nf_date_type?: string | null;
  nf_exact_date?: string | null;
  nf_result_date_type?: string | null;
  nf_result_exact_date?: string | null;
  internal_entry?: ConfirmationReviewEntry | null;
  national_final?: ConfirmationReviewNationalFinal | null;
  can_edit: boolean;
  reason: "open" | "editing_closed" | "locked" | string;
};

export type CountryConfirmationRequirement = {
  id: string;
  edition_id: string;
  country_id: string;
  generation: number;
  status: "required" | "satisfied" | "waived" | "invalidated";
  reason: string;
  valid_from: string;
  resolved_by_submission_id: string | null;
  resolved_at: string | null;
  created_at: string;
};

export type CountryConfirmationAccess = {
  authenticated: boolean;
  country: {
    country_id: string;
    name: string;
    short_code: string;
  } | null;
  responses: CountryConfirmationResponse[];
  requirements: CountryConfirmationRequirement[];
};

export type CountryConfirmationDraftResult = {
  found: boolean;
  payload?: unknown;
  revision: number;
  updated_at?: string | null;
  country_id?: string;
};

export type CountryConfirmationDraftSaveResult = {
  ok: boolean;
  conflict: boolean;
  revision: number;
  saved_at?: string | null;
  payload?: unknown;
  updated_at?: string | null;
  country_id?: string;
};

export async function getCountryConfirmationAccess(): Promise<CountryConfirmationAccess> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    return { authenticated: false, country: null, responses: [], requirements: [] };
  }

  const [accessResult, requirementsResult] = await Promise.all([
    confirmations.rpc("public_country_account_confirmation_access"),
    confirmations.rpc("public_country_account_confirmation_requirements"),
  ]);

  if (accessResult.error) throw accessResult.error;
  if (requirementsResult.error) throw requirementsResult.error;

  const result = (accessResult.data ?? {}) as Partial<CountryConfirmationAccess>;
  return {
    authenticated: result.authenticated === true,
    country: result.country ?? null,
    responses: Array.isArray(result.responses) ? result.responses : [],
    requirements: Array.isArray(requirementsResult.data)
      ? (requirementsResult.data as CountryConfirmationRequirement[])
      : [],
  };
}

/**
 * Country-account drafts are intentionally bound to auth.uid() in Postgres,
 * not to a browser-provided country or session id. That gives signed-in
 * delegations real cross-device continuity without weakening anonymous drafts.
 */
export async function loadCountryAccountConfirmationDraft(
  roundId: string,
): Promise<CountryConfirmationDraftResult> {
  const { data, error } = await confirmations.rpc(
    "v3_load_account_confirmation_draft",
    { _round_id: roundId },
  );
  if (error) throw error;

  const result = (data ?? {}) as Partial<CountryConfirmationDraftResult>;
  return {
    found: result.found === true,
    payload: result.payload,
    revision: Number.isInteger(result.revision) ? Number(result.revision) : 0,
    updated_at: result.updated_at ?? null,
    country_id: typeof result.country_id === "string" ? result.country_id : undefined,
  };
}

export async function saveCountryAccountConfirmationDraft(input: {
  roundId: string;
  payload: Record<string, unknown>;
  expectedRevision: number;
}): Promise<CountryConfirmationDraftSaveResult> {
  const { data, error } = await confirmations.rpc(
    "v3_save_account_confirmation_draft",
    {
      _round_id: input.roundId,
      _payload: input.payload,
      _expected_revision: input.expectedRevision,
    },
  );
  if (error) throw error;

  const result = (data ?? {}) as Partial<CountryConfirmationDraftSaveResult>;
  return {
    ok: result.ok === true,
    conflict: result.conflict === true,
    revision: Number.isInteger(result.revision) ? Number(result.revision) : 0,
    saved_at: result.saved_at ?? null,
    payload: result.payload,
    updated_at: result.updated_at ?? null,
    country_id: typeof result.country_id === "string" ? result.country_id : undefined,
  };
}

export async function deleteCountryAccountConfirmationDraft(roundId: string) {
  const { data, error } = await confirmations.rpc(
    "v3_delete_account_confirmation_draft",
    { _round_id: roundId },
  );
  if (error) throw error;

  const result = (data ?? {}) as { ok?: boolean; deleted?: boolean };
  return {
    ok: result.ok === true,
    deleted: result.deleted === true,
  };
}

export async function createCountryAccountConfirmationEditToken(roundId: string) {
  const { data, error } = await confirmations.rpc("public_create_country_account_edit_token", {
    _round_id: roundId,
  });
  if (error) throw error;

  const result = (data ?? {}) as {
    ok?: boolean;
    reason?: string;
    token?: string;
    expires_at?: string;
  };

  if (!result.ok || !result.token) {
    return {
      ok: false as const,
      reason: result.reason ?? "unknown",
      token: null,
      expiresAt: null,
    };
  }

  return {
    ok: true as const,
    reason: "ok",
    token: result.token,
    expiresAt: result.expires_at ?? null,
  };
}
