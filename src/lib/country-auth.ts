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

type PendingCredentialOperation = {
  operationId: string;
  idempotencyKey: string;
  countryId: string;
  accountUpdatedAt: string;
  createdAt: string;
};

const CREDENTIAL_OPERATION_MAX_AGE_MS = 30 * 60 * 1000;

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

function credentialOperationStorageKey(userId: string) {
  return `solaris:admin-country-credential:${userId}`;
}

function sessionStorageOrNull(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function isPendingCredentialOperation(value: unknown): value is PendingCredentialOperation {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PendingCredentialOperation>;
  return (
    typeof candidate.operationId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate.operationId) &&
    typeof candidate.idempotencyKey === "string" &&
    /^[0-9a-f]{64}$/.test(candidate.idempotencyKey) &&
    typeof candidate.countryId === "string" &&
    typeof candidate.accountUpdatedAt === "string" &&
    typeof candidate.createdAt === "string"
  );
}

function randomHex(byteCount: number) {
  const bytes = new Uint8Array(byteCount);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function createCredentialOperation(countryId: string, accountUpdatedAt: string): PendingCredentialOperation {
  return {
    operationId: crypto.randomUUID(),
    idempotencyKey: randomHex(32),
    countryId,
    accountUpdatedAt,
    createdAt: new Date().toISOString(),
  };
}

function readCredentialOperation(userId: string): PendingCredentialOperation | null {
  try {
    const raw = sessionStorageOrNull()?.getItem(credentialOperationStorageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isPendingCredentialOperation(parsed)) return null;
    const age = Date.now() - Date.parse(parsed.createdAt);
    if (!Number.isFinite(age) || age < 0 || age > CREDENTIAL_OPERATION_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCredentialOperation(userId: string, operation: PendingCredentialOperation | null) {
  try {
    const storage = sessionStorageOrNull();
    if (!storage) return;
    const key = credentialOperationStorageKey(userId);
    if (operation) storage.setItem(key, JSON.stringify(operation));
    else storage.removeItem(key);
  } catch {
    // Best effort. A same-page invocation can still be retried by the caller.
  }
}

async function resolveCountryCredentialOperation(userId: string) {
  const { data, error } = await supabase
    .from("country_accounts")
    .select("country_id,updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data?.country_id || !data.updated_at) {
    throw new Error("The reviewed country account could not be verified. Reload it before retrying.");
  }

  const existing = readCredentialOperation(userId);
  if (
    existing &&
    existing.countryId === data.country_id &&
    existing.accountUpdatedAt === data.updated_at
  ) {
    return existing;
  }

  const next = createCredentialOperation(data.country_id, data.updated_at);
  writeCredentialOperation(userId, next);
  return next;
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

export async function adminSetSolarisPassword(userId: string, password: string) {
  const operation = await resolveCountryCredentialOperation(userId);
  const reason = `Organizer credential replacement for country ${operation.countryId}`;

  try {
    const result = await invokeFunction<CountryCredentialReplacementReceipt>(
      "admin-country-password",
      {
        userId,
        expectedCountryId: operation.countryId,
        expectedAccountUpdatedAt: operation.accountUpdatedAt,
        password,
        reason,
        operationId: operation.operationId,
        idempotencyKey: operation.idempotencyKey,
      },
    );
    writeCredentialOperation(userId, null);
    return result;
  } catch (error) {
    // Preserve the exact operation identity after an uncertain dependency or
    // network outcome. The server rejects semantic mismatch if a later retry
    // attempts to reuse it for different credential material.
    throw error;
  }
}
