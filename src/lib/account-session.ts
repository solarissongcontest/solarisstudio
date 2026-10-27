import { supabase } from "@/integrations/supabase/client";
import {
  beginSolarisAuthTransition,
  runSolarisAuthMutation,
} from "@/lib/auth-transition-authority";

type SignOutBoundaryListener = () => void;

const signOutBoundaryListeners = new Set<SignOutBoundaryListener>();

/**
 * Derived client cleanup signal for the current tab. This never decides whether
 * a session is valid; canonical authority remains Supabase Auth + the server
 * active-session boundary.
 */
export function subscribeSolarisSignOutBoundary(listener: SignOutBoundaryListener) {
  signOutBoundaryListeners.add(listener);
  return () => signOutBoundaryListeners.delete(listener);
}

function publishSolarisSignOutBoundary() {
  for (const listener of [...signOutBoundaryListeners]) listener();
}

/**
 * Canonical public/account session exit used by presentation surfaces.
 * Global Auth sign-out establishes the authoritative transition first. The
 * local cleanup signal then synchronously purges account-scoped presentation
 * state before this helper resolves. Other tabs continue to follow Supabase's
 * own auth-state propagation; their protected requests are server-authoritative.
 */
export async function signOutSolarisAccount() {
  const transition = beginSolarisAuthTransition();
  await runSolarisAuthMutation(transition, async () => {
    const { error } = await supabase.auth.signOut({ scope: "global" });
    if (error) throw error;
  });
  publishSolarisSignOutBoundary();
}
