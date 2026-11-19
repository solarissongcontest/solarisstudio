import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

type AccountState = "loading" | "signed-in" | "signed-out" | "error";

/**
 * Independently rendered early-release account screen. It must never require
 * AppShell, private country access queries, notifications or voting/dashboard
 * components, any of which can be unavailable while maintenance is active.
 *
 * Render useful SSR HTML before the first browser effect. If auth restoration
 * fails, the visitor receives a visible recovery path, never an empty page.
 */
export function PublicEarlyAccessMe() {
  const [accountState, setAccountState] = useState<AccountState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let active = true;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) {
        setAccountState(session?.user ? "signed-in" : "signed-out");
        setError(null);
      }
    });

    void supabase.auth.getSession()
      .then(({ data, error: sessionError }) => {
        if (!active) return;
        if (sessionError) {
          setAccountState("error");
          setError("Your session could not be restored. Try signing in again.");
          return;
        }
        setAccountState(data.session?.user ? "signed-in" : "signed-out");
      })
      .catch(() => {
        if (!active) return;
        setAccountState("error");
        setError("Your session could not be restored. Try signing in again.");
      });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    setError(null);
    setSigningOut(true);
    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
      window.location.replace("/me");
    } catch {
      setError("Sign out failed. Please try again.");
      setSigningOut(false);
    }
  };

  return (
    <div
      className="relative z-10 min-h-dvh bg-background text-foreground"
      data-public-early-access-me="true"
    >
      <header className="border-b border-border/70 bg-surface/80">
        <nav aria-label="Solaris account navigation" className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4">
          <a className="text-sm font-black tracking-tight" href="/">Solaris Studio</a>
          <a className="inline-flex min-h-11 items-center text-sm font-semibold text-primary" href="/explore">Explore</a>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-2xl px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Your Solaris</p>
        <h1 className="mt-2 text-3xl font-black">Me</h1>

        <section className="mt-6 rounded-2xl border border-border bg-surface p-5" aria-live="polite">
          {accountState === "loading" ? (
            <>
              <h2 className="font-semibold">Opening your account</h2>
              <p role="status" className="mt-2 text-sm text-muted-foreground">Checking your signed-in session…</p>
              <a href="/auth" className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold underline">
                Sign in manually
              </a>
            </>
          ) : accountState === "signed-in" ? (
            <>
              <h2 className="font-semibold">You're signed in</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Your Solaris Studio account is active. The full country dashboard
                and official voting are not part of this early release. You can
                continue exploring published content and edit an existing
                Confirmation using your secure link.
              </p>
              <button type="button" onClick={() => void signOut()} disabled={signingOut}
                className="mt-5 min-h-11 rounded-xl border border-border px-4 text-sm font-semibold disabled:opacity-60">
                {signingOut ? "Signing out…" : "Sign out"}
              </button>
            </>
          ) : (
            <>
              <h2 className="font-semibold">{accountState === "error" ? "Session unavailable" : "Sign in to Solaris Studio"}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {accountState === "error" ? "Your account couldn't be loaded on this device." : "Open your country account or register an available country."}
              </p>
              <a href="/auth" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">
                Sign in or register
              </a>
            </>
          )}
          {error ? <p role="alert" className="mt-3 text-sm text-destructive">{error}</p> : null}
        </section>

        <section className="mt-5 rounded-2xl border border-border bg-surface p-5">
          <h2 className="font-semibold">Confirmation Editing</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Existing secure Confirmation editing links remain available.
            Official Jury Voting is not open.
          </p>
          <a href="/confirmations/recover" className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">
            Recover an existing edit link
          </a>
        </section>
      </main>
    </div>
  );
}
