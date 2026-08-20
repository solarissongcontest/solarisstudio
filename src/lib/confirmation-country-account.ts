import { confirmationsSupabase } from "@/integrations/confirmations/client";

const confirmations = confirmationsSupabase as any;

export type CountryConfirmationResponse = {
  submission_id: string;
  round_id: string;
  round_name: string;
  edition_id: string;
  edition_name: string;
  edition_number: number;
  country: string;
  submitted_at: string;
  updated_at: string;
  can_edit: boolean;
  reason: "open" | "editing_closed" | "locked" | string;
};

export type CountryConfirmationAccess = {
  authenticated: boolean;
  country: {
    country_id: string;
    name: string;
    short_code: string;
  } | null;
  responses: CountryConfirmationResponse[];
};

export async function getCountryConfirmationAccess(): Promise<CountryConfirmationAccess> {
  const { data, error } = await confirmations.rpc("public_country_account_confirmation_access");
  if (error) throw error;

  const result = (data ?? {}) as Partial<CountryConfirmationAccess>;
  return {
    authenticated: result.authenticated === true,
    country: result.country ?? null,
    responses: Array.isArray(result.responses) ? result.responses : [],
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
