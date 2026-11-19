import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useFanSession } from "@/lib/prediction-data";

/**
 * Early-release Me is intentionally not the full MySolaris command dashboard.
 * It permits login/logout and recovery navigation, never loading mutable
 * delegation, voting, notification or publication surfaces before cutover.
 */
export function PublicEarlyAccessMe() {
  const session = useFanSession();
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const isSignedIn = Boolean(session.data?.id);

  const signOut = async () => {
    setError(null);
    setSigningOut(true);
    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
      window.location.assign("/me");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign out failed.");
      setSigningOut(false);
    }
  };

  return (
    <AppShell>
      <main className="mx-auto max-w-2xl px-4 py-8" data-public-early-access-me="true">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Your Solaris</p>
        <h1 className="mt-2 text-3xl font-black">Me</h1>
        {session.isLoading ? (
          <p className="mt-5" role="status">Checking your account…</p>
        ) : isSignedIn ? (
          <section className="mt-6 rounded-2xl border border-border bg-surface p-5">
            <h2 className="font-semibold">You're signed in</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Your account session is active. Country dashboards and other editing tools
              will open after their own release checks. Existing secure Confirmation
              editing links remain available now.
            </p>
            <button type="button" onClick={() => void signOut()} disabled={signingOut}
              className="mt-5 min-h-11 rounded-xl border border-border px-4 text-sm font-semibold disabled:opacity-60">
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
            {error ? <p role="alert" className="mt-3 text-sm text-destructive">{error}</p> : null}
          </section>
        ) : (
          <section className="mt-6 rounded-2xl border border-border bg-surface p-5">
            <h2 className="font-semibold">Your Solaris account</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Sign in with your country account or create an account for an unclaimed country.
            </p>
            <a href="/auth" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">
              Sign in or register
            </a>
          </section>
        )}
        <section className="mt-5 rounded-2xl border border-border bg-surface p-5">
          <h2 className="font-semibold">Confirmation Editing</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            If you already have a secure Confirmation edit link, open it to update the
            existing response. No new Confirmation or official vote is opened here.
          </p>
          <a href="/confirmations/recover" className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">
            Recover an existing edit link
          </a>
        </section>
      </main>
    </AppShell>
  );
}
