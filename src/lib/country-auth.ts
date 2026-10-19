import { supabase } from "@/integrations/supabase/client";

type SessionPayload = {
  accessToken: string;
  refreshToken: string;
  userId: string;
};

type RecoveryPayload = {
  ok: boolean;
  recoveryAvailable: boolean;
};

type PasswordUpdatePayload = {
  ok: boolean;
};

export type CountryCredentialReplacementReceipt = {
  ok: true;
  changed: true;
  riskClass: "R3";
  targetUserId: string;
  countryId: string;
  operationId: string;
  receiptId: string;
  sessionPolicy: "revoke_all";
  revokedSessionCount: number;
  completedAt: string;
  replayed: boolean;
};

export type SolarisAccountProfile = {
  instagramUsername: string | null;
  displayName: string | null;
  email: string | null;
  hasRecoveryEmail: boolean;
  countryId: string | null;
  status: "active" | "suspended" | null;
};

type EmailUpdatePayload = {
  ok: boolean;
  email: string;
};

type FunctionError = Error & { context?: Response };

async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (!error) return data as T;

  let message = error.message || "Authentication request failed.";
  const response = (error as FunctionError).context;
  if (response) {
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) message = payload.error;
    } catch {
      // Keep the function client's fallback message when the response has no JSON body.
    }
  }
  throw new Error(message);
}

async function invokeCountryAuth<T>(body: Record<string, unknown>): Promise<T> {
  return invokeFunction<T>("country-auth", body);
}

async function installSession(payload: SessionPayload) {
  const { data, error } = await supabase.auth.setSession({
    access_token: payload.accessToken,
    refresh_token: payload.refreshToken,
  });
  if (error || !data.session) throw error ?? new Error("Could not start your Solaris Studio session.");
  return payload.userId;
}

export async function signInSolarisAccount(identifier: string, password: string) {
  const payload = await invokeCountryAuth<SessionPayload>({
    action: "signin",
    identifier,
    password,
  });
  return installSession(payload);
}

export async function createCountryAccount(input: {
  countryId: string;
  instagramUsername: string;
  displayName: string;
  password: string;
  email?: string;
}) {
  const payload = await invokeCountryAuth<SessionPayload>({
    action: "signup",
    ...input,
  });
  return installSession(payload);
}

export async function requestSolarisPasswordRecovery(identifier: string) {
  return invokeCountryAuth<RecoveryPayload>({ action: "recover", identifier });
}

export async function getSolarisAccountProfile() {
  return invokeCountryAuth<SolarisAccountProfile>({ action: "profile" });
}

export async function setSolarisRecoveryEmail(email: string) {
  return invokeCountryAuth<EmailUpdatePayload>({ action: "set-email", email });
}

export async function setSolarisPassword(password: string) {
  return invokeCountryAuth<PasswordUpdatePayload>({ action: "set-password", password });
}

export async function reauthenticateCountryCredentialR3(password: string): Promise<void> {
  if (!password) {
    throw new Error("Enter your current Solaris password to authorize this R3 credential change.");
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    throw new Error("Your Organizer session has expired. Sign in again before replacing credentials.");
  }
  const email = userData.user.email;
  if (!email) {
    throw new Error("This Organizer account cannot perform password reauthentication without an email address.");
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error("Your current Solaris password was not accepted.");
  }
}

export async function adminSetSolarisPassword(input: {
  userId: string;
  countryId: string;
  accountUpdatedAt: string;
  password: string;
  reason: string;
  operationId: string;
  idempotencyKey: string;
}): Promise<CountryCredentialReplacementReceipt> {
  return invokeFunction<CountryCredentialReplacementReceipt>("admin-country-password", {
    userId: input.userId,
    expectedCountryId: input.countryId,
    expectedAccountUpdatedAt: input.accountUpdatedAt,
    password: input.password,
    reason: input.reason,
    operationId: input.operationId,
    idempotencyKey: input.idempotencyKey,
  });
}
