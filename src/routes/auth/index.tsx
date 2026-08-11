import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { lovable } from "@/integrations/lovable/index";
import { supabase } from "@/integrations/supabase/client";
import {
  getCurrentAccountAccess,
  useAvailableCountryClaims,
} from "@/lib/country-account";

export const Route = createFileRoute("/auth/")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => {
    const redirect = typeof search.redirect === "string" ? search.redirect : undefined;
    return redirect ? { redirect } : {};
  },
  head: () => ({
    meta: [
      { title: "Sign in — Solaris Studio" },
      {
        name: "description",
        content: "Sign in to your Solaris account or register an unclaimed Terra Solaris country.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { redirect } = Route.useSearch();
  const safeRedirect =
    redirect?.startsWith("/") && !redirect.startsWith("//") ? redirect : null;

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [countryId, setCountryId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { data: claims, isLoading: claimsLoading } = useAvailableCountryClaims();

  const destinationFor = async (userId: string) => {
    const access = await getCurrentAccountAccess(userId);
    if (safeRedirect && (!safeRedirect.startsWith("/admin") || access.isOrganizer)) {
      return safeRedirect;
    }
    if (access.isOrganizer) return "/admin";
    return "/country-hub";
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMsg(null);

    try {
      if (mode === "signin") {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.assign(await destinationFor(data.user.id));
        return;
      }

      if (!countryId) {
        setMsg("Choose the country this account will own.");
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            account_type: "country",
            country_id: countryId,
          },
          emailRedirectTo: `${window.location.origin}/country-hub`,
        },
      });
      if (error) throw error;

      if (data.session && data.user) {
        window.location.assign("/country-hub");
        return;
      }

      setMode("signin");
      setMsg("Account created. Sign in to open your country account.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong.";
      setMsg(
        message.toLowerCase().includes("country") && message.toLowerCase().includes("account")
          ? "That country already has an account. Choose another unclaimed country."
          : message,
      );
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setMsg(null);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}${safeRedirect ?? "/"}`,
    });
    if (result.error) {
      setMsg("Google sign-in failed. Please try again.");
      return;
    }
    if (result.redirected) return;
    window.location.assign(safeRedirect ?? "/");
  };

  const signupUnavailable = mode === "signup" && claims?.schemaReady === false;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Account access"
        title={mode === "signin" ? "Sign in" : "Create a country account"}
        description={
          mode === "signin"
            ? "Country accounts keep your entries, Terra Solaris profile and personal Solaris activity together. Organizer Studio remains separate."
            : "Choose one unclaimed Terra Solaris country. Each country can have only one account, and no organizer approval is needed after registration."
        }
      />

      <div className="mx-auto max-w-md">
        <Panel title={mode === "signin" ? "Account" : "Register your country"}>
          <form onSubmit={submit} className="space-y-3">
            {mode === "signup" && (
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                  Country
                </span>
                <select
                  value={countryId}
                  onChange={(event) => setCountryId(event.target.value)}
                  required
                  disabled={claimsLoading || signupUnavailable}
                  className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm disabled:opacity-60"
                >
                  <option value="">
                    {claimsLoading ? "Loading countries…" : "Choose an unclaimed country…"}
                  </option>
                  {(claims?.countries ?? []).map((country) => (
                    <option key={country.id} value={country.id}>
                      {country.name} ({country.short_code})
                    </option>
                  ))}
                </select>
                {claims?.schemaReady && !claims.countries.length && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Every country currently has an account.
                  </p>
                )}
                {signupUnavailable && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Country account registration is temporarily unavailable.
                  </p>
                )}
              </label>
            )}

            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email"
              autoComplete="email"
              className="w-full rounded-xl bg-surface px-3 py-2.5 text-sm outline-none ring-primary/50 focus:ring-2"
            />
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              className="w-full rounded-xl bg-surface px-3 py-2.5 text-sm outline-none ring-primary/50 focus:ring-2"
            />
            <button
              type="submit"
              disabled={busy || signupUnavailable}
              className="bg-aurora w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create country account"}
            </button>
          </form>

          {mode === "signin" && (
            <>
              <div className="my-4 flex items-center gap-3 text-[11px] uppercase tracking-widest text-muted-foreground">
                <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
              </div>
              <button
                type="button"
                onClick={google}
                className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-medium hover:bg-surface-strong"
              >
                Continue with Google
              </button>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                New Google users can claim an unclaimed country after signing in.
              </p>
            </>
          )}

          {msg && <p className="mt-4 text-sm text-muted-foreground">{msg}</p>}

          <button
            type="button"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setMsg(null);
            }}
            className="mt-4 w-full text-xs text-muted-foreground hover:text-foreground"
          >
            {mode === "signin"
              ? "No country account yet? Create one"
              : "Already have an account? Sign in"}
          </button>
        </Panel>
      </div>
    </AppShell>
  );
}
