import { supabase as typedSupabase } from "@/integrations/supabase/client";

const supabase = typedSupabase as any;

export type AccountSessionRpcResult = {
  data: unknown;
  error: unknown;
};

export async function fetchAccountSessionProjection(): Promise<AccountSessionRpcResult> {
  const { data, error } = await supabase.rpc("v3_my_sessions");
  return { data, error };
}

export async function revokeAccountSessionRpc(input: {
  sessionHandle: string;
  operationId: string;
  idempotencyKey: string;
}): Promise<AccountSessionRpcResult> {
  const { data, error } = await supabase.rpc("v3_revoke_session", {
    p_session_handle: input.sessionHandle,
    p_operation_id: input.operationId,
    p_idempotency_key: input.idempotencyKey,
  });
  return { data, error };
}

export async function reauthenticateAccountWithPassword(password: string): Promise<void> {
  if (!password) throw new Error("Enter your current Solaris password.");

  const { data: current, error: currentError } = await typedSupabase.auth.getUser();
  if (currentError) throw currentError;
  const user = current.user;
  if (!user?.id || !user.email) {
    throw new Error("This Solaris account cannot be reauthenticated with a password.");
  }

  const originalUserId = user.id;
  const { data: signedIn, error: signInError } = await typedSupabase.auth.signInWithPassword({
    email: user.email,
    password,
  });
  if (signInError) throw signInError;
  if (!signedIn.user || signedIn.user.id !== originalUserId) {
    throw new Error("Solaris could not verify the current account identity.");
  }
}
