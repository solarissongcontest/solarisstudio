import { supabase } from "@/integrations/supabase/client";
import {
  beginSolarisAuthTransition,
  runSolarisAuthMutation,
  type SolarisAuthTransition,
} from "@/lib/auth-transition-authority";

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

async function clearInstalledStaleSession() {
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) throw error;
}

async function installSession(payload: SessionPayload, transition: SolarisAuthTransition) {
  return runSolarisAuthMutation(
    transition,
    async () => {
      const { data, error } = await supabase.auth.setSession({
        access_token: payload.accessToken,
        refresh_token: payload.refreshToken,
      });
      if (error || !data.session) {
        throw error ?? new Error("Could not start your Solaris Studio session.");
      }

      if (data.session.user.id !== payload.userId) {
        await clearInstalledStaleSession();
        throw new Error("Solaris returned an authentication session for a different account.");
      }

      // setSession proves SDK installation, while getUser revalidates the user
      // against the Auth server before we let routing consume the identity.
      const { data: verified, error: verifyError } = await supabase.auth.getUser();
      if (verifyError || !verified.user || verified.user.id !== payload.userId) {
        await clearInstalledStaleSession();
        throw verifyError ?? new Error("Solaris could not verify the authenticated account.");
      }

      return verified.user.id;
    },
    async () => {
      // The newer transition is queued behind this mutation, so local cleanup
      // can safely remove the stale session without signing out other devices.
      await clearInstalledStaleSession();
    },
  );
}

export async function signInSolarisAccount(identifier: string, password: string) {
  const transition = beginSolarisAuthTransition();
  const payload = await invokeCountryAuth<SessionPayload>({
    action: "signin",
    identifier,
    password,
  });
  return installSession(payload, transition);
}

export async function createCountryAccount(input: {
  countryId: string;
  instagramUsername: string;
  displayName: string;
  password: string;
  email?: string;
}) {
  const transition = beginSolarisAuthTransition();
  const payload = await invokeCountryAuth<SessionPayload>({
    action: "signup",
    ...input,
  });
  return installSession(payload, transition);
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
  return invokeFunction<PasswordUpdatePayload>("admin-country-password", { userId, password });
}
