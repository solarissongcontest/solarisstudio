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
  operationId?: string;
  receiptId?: string;
  userId?: string;
  countryId?: string;
  sessionPolicy?: "preserve_existing_sessions";
  sessionsRevoked?: boolean;
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

type AdminCredentialOperationInput = {
  userId: string;
  countryId: string;
  expectedUpdatedAt: string;
  password: string;
  operationId: string;
  idempotencyKey: string;
};

type AdminCountryAccountRow = {
  user_id: string;
  country_id: string;
  updated_at: string;
};

type PendingAdminCredentialOperation = AdminCredentialOperationInput & {
  retryFingerprint: string;
};

const pendingAdminCredentialOperations = new Map<string, PendingAdminCredentialOperation>();
const adminCredentialRetrySalt = crypto.randomUUID();

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

async function browserRetryFingerprint(userId: string, password: string) {
  const bytes = new TextEncoder().encode(`${adminCredentialRetrySalt}:${userId}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function resolveLegacyAdminCredentialOperation(
  userId: string,
  password: string,
): Promise<AdminCredentialOperationInput> {
  const retryFingerprint = await browserRetryFingerprint(userId, password);
  const pending = pendingAdminCredentialOperations.get(userId);
  if (pending?.retryFingerprint === retryFingerprint) {
    const { retryFingerprint: _ignored, ...input } = pending;
    return input;
  }

  const { data, error } = await (supabase as any).rpc("admin_country_accounts");
  if (error) throw error;
  const account = ((data ?? []) as AdminCountryAccountRow[]).find((row) => row.user_id === userId);
  if (!account) throw new Error("That country account no longer exists.");

  const operation: PendingAdminCredentialOperation = {
    userId,
    countryId: account.country_id,
    expectedUpdatedAt: account.updated_at,
    password,
    operationId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    retryFingerprint,
  };
  pendingAdminCredentialOperations.set(userId, operation);
  const { retryFingerprint: _ignored, ...input } = operation;
  return input;
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

export async function adminSetSolarisPassword(input: AdminCredentialOperationInput): Promise<PasswordUpdatePayload>;
export async function adminSetSolarisPassword(userId: string, password: string): Promise<PasswordUpdatePayload>;
export async function adminSetSolarisPassword(
  inputOrUserId: AdminCredentialOperationInput | string,
  legacyPassword?: string,
) {
  const legacyUserId = typeof inputOrUserId === "string" ? inputOrUserId : null;
  const input = typeof inputOrUserId === "string"
    ? await resolveLegacyAdminCredentialOperation(inputOrUserId, legacyPassword ?? "")
    : inputOrUserId;

  try {
    const result = await invokeFunction<PasswordUpdatePayload>("admin-country-password", input);
    if (legacyUserId) pendingAdminCredentialOperations.delete(legacyUserId);
    return result;
  } catch (error) {
    // Keep the exact operation identity after an uncertain transport failure.
    // A subsequent confirmation with the same password can safely reconcile or
    // retry the server-side idempotent credential assignment. A different
    // password gets a different salted in-memory retry fingerprint and a new
    // reviewed operation.
    throw error;
  }
}
