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

export async function setSolarisPassword(password: string) {
  return invokeCountryAuth<PasswordUpdatePayload>({ action: "set-password", password });
}

export async function adminSetSolarisPassword(userId: string, password: string) {
  return invokeFunction<PasswordUpdatePayload>("admin-country-password", { userId, password });
}
