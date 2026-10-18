import { createClient } from "@supabase/supabase-js";

import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { noteSupabaseResponse } from "@/lib/supabase-service-restriction";

const supabase = typedSupabase as any;

export type AccountSessionRpcResult = {
  data: unknown;
  error: unknown;
};

type SessionRevocationInput = {
  sessionHandle: string;
  operationId: string;
  idempotencyKey: string;
};

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createTrackedSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    if (
      isNewSupabaseApiKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }
    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers }).then((response) => {
      noteSupabaseResponse(response);
      return response;
    });
  };
}

function createPasswordVerificationClient() {
  const url = import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Solaris authentication is not configured.");

  return createClient(url, key, {
    global: { fetch: createTrackedSupabaseFetch(key) },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function revocationArgs(input: SessionRevocationInput) {
  return {
    p_session_handle: input.sessionHandle,
    p_operation_id: input.operationId,
    p_idempotency_key: input.idempotencyKey,
  };
}

export async function fetchAccountSessionProjection(): Promise<AccountSessionRpcResult> {
  const { data, error } = await supabase.rpc("v3_my_sessions");
  return { data, error };
}

export async function revokeAccountSessionRpc(
  input: SessionRevocationInput,
): Promise<AccountSessionRpcResult> {
  const { data, error } = await supabase.rpc("v3_revoke_session", revocationArgs(input));
  return { data, error };
}

/**
 * Retry a reviewed session-revocation operation under a fresh password session
 * without replacing the browser's canonical Solaris session.
 *
 * signInWithPassword creates an Auth session. Running it on the persistent app
 * client would replace the browser session and leave an extra server session.
 * The isolated client therefore owns the short-lived verification session,
 * invokes the same idempotent RPC, and explicitly revokes that verification
 * session before returning.
 */
export async function revokeAccountSessionWithPasswordRpc(
  input: SessionRevocationInput,
  password: string,
): Promise<AccountSessionRpcResult> {
  if (!password) throw new Error("Enter your current Solaris password.");

  const { data: current, error: currentError } = await typedSupabase.auth.getUser();
  if (currentError) throw currentError;
  const user = current.user;
  if (!user?.id || !user.email) {
    throw new Error("This Solaris account cannot be reauthenticated with a password.");
  }

  const verifier = createPasswordVerificationClient();
  let verificationSessionCreated = false;
  let operationResult: AccountSessionRpcResult | null = null;
  let operationError: unknown = null;

  try {
    const { data: signedIn, error: signInError } = await verifier.auth.signInWithPassword({
      email: user.email,
      password,
    });
    if (signInError) throw signInError;
    if (!signedIn.user || !signedIn.session || signedIn.user.id !== user.id) {
      throw new Error("Solaris could not verify the current account identity.");
    }
    verificationSessionCreated = true;

    const { data, error } = await verifier.rpc("v3_revoke_session", revocationArgs(input));
    operationResult = { data, error };
  } catch (error) {
    operationError = error;
  } finally {
    if (verificationSessionCreated) {
      const { error: signOutError } = await verifier.auth.signOut({ scope: "local" });
      if (signOutError && operationError == null) operationError = signOutError;
    }
  }

  if (operationError) throw operationError;
  if (!operationResult) throw new Error("Solaris could not complete fresh authentication.");
  return operationResult;
}
