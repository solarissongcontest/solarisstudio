import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentAccountAccess } from "@/lib/country-account";

export const Route = createFileRoute("/auth/reset")({
  head: () => ({
    meta: [
      { title: "Reset password — Solaris Studio" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (mounted && data.session) setReady(true);
    });

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);

    if (password.length < 6) {
      setMessage("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("The passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const { data, error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      const access = await getCurrentAccountAccess(data.user.id);
      window.location.assign(access.isOrganizer ? "/admin" : "/country-hub");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Password could not be changed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="Account recovery"
        title="Choose a new password"
        description="The recovery link signs you in temporarily so Solaris Studio can replace your password securely."
      />

      <div className="mx-auto max-w-md">
        <Panel title="Reset password">
          {ready ? (
            <form onSubmit={submit} className="space-y-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                  New password
                </span>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  className="w-full rounded-xl bg-surface px-3 py-2.5 text-sm outline-none ring-primary/50 focus:ring-2"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                  Confirm new password
                </span>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  className="w-full rounded-xl bg-surface px-3 py-2.5 text-sm outline-none ring-primary/50 focus:ring-2"
                />
              </label>

              <button
                type="submit"
                disabled={busy}
                className="bg-aurora w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {busy ? "Updating…" : "Set new password"}
              </button>
            </form>
          ) : (
            <p className="text-sm leading-relaxed text-muted-foreground">
              Open this page from the password-recovery link sent to your email. If the link has expired, request a new one from the sign-in page.
            </p>
          )}

          {message ? <p className="mt-4 text-sm text-muted-foreground">{message}</p> : null}
        </Panel>
      </div>
    </AppShell>
  );
}
