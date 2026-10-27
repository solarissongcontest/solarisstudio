import { supabase } from "@/integrations/supabase/client";
import {
  beginSolarisAuthTransition,
  runSolarisAuthMutation,
  StaleSolarisAuthTransitionError,
} from "@/lib/auth-transition-authority";

type ReauthenticationMessages = {
  missingPassword: string;
  unavailable: string;
};

async function clearLocalSession() {
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) throw error;
}

/**
 * Refreshes password authentication for the already-verified current account
 * without allowing an older reauthentication request to reinstall authority
 * after a newer sign-in/sign-out/account transition.
 */
export async function reauthenticateCurrentSolarisAccount(
  password: string,
  messages: ReauthenticationMessages,
): Promise<void> {
  if (!password) throw new Error(messages.missingPassword);

  const transition = beginSolarisAuthTransition();
  const { data: current, error: currentError } = await supabase.auth.getUser();
  if (currentError) throw currentError;
  const user = current.user;
  if (!user?.id || !user.email) throw new Error(messages.unavailable);

  const originalUserId = user.id;
  const originalEmail = user.email;

  await runSolarisAuthMutation(
    transition,
    async () => {
      // The mutation may have waited behind another session-changing request.
      // Re-prove that the account we are about to reauthenticate is still the
      // active account before changing the SDK session.
      const { data: before, error: beforeError } = await supabase.auth.getUser();
      if (beforeError) throw beforeError;
      if (
        !before.user ||
        before.user.id !== originalUserId ||
        before.user.email !== originalEmail
      ) {
        throw new StaleSolarisAuthTransitionError();
      }

      const { data: signedIn, error: signInError } = await supabase.auth.signInWithPassword({
        email: originalEmail,
        password,
      });
      if (signInError) throw signInError;
      if (!signedIn.user || signedIn.user.id !== originalUserId) {
        await clearLocalSession();
        throw new Error("Fresh authentication returned a different Solaris account.");
      }

      const { data: verified, error: verifyError } = await supabase.auth.getUser();
      if (verifyError || !verified.user || verified.user.id !== originalUserId) {
        await clearLocalSession();
        throw verifyError ?? new Error("Solaris could not verify the freshly authenticated account.");
      }
    },
    async () => {
      // A newer transition is queued behind this one. Remove the stale session
      // locally before that newer transition is allowed to install its session.
      await clearLocalSession();
    },
  );
}
