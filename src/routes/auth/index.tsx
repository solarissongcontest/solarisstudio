import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import {
  createCountryAccount,
  requestSolarisPasswordRecovery,
  signInSolarisAccount,
} from "@/lib/country-auth";
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
        content: "Sign in to Solaris Studio or register an unclaimed Terra Solaris country.",
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
  const [identifier, setIdentifier] = useState("");
  const [instagramUsername, setInstagramUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
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
        const userId = await signInSolarisAccount(identifier, password);
        window.location.assign(await destinationFor(userId));
        return;
      }

      if (!countryId) {
        setMsg("Choose the country this account will own.");
        return;
      }

      const userId = await createCountryAccount({
        countryId,
        instagramUsername,
        displayName,
        password,
        email: email.trim() || undefined,
      });
      window.location.assign(await destinationFor(userId));
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const recoverPassword = async () => {
    const login = identifier.trim();
    if (!login) {
      setMsg("Enter your Instagram username or admin email first.");
      return;
    }

    setBusy(true);
    setMsg(null);
    try {
      const result = await requestSolarisPasswordRecovery(login);
      setMsg(
        result.recoveryAvailable
          ? "If that account has a recovery email, a password reset link has been sent."
          : "This country account does not have a recovery email. Contact an organizer to regain access.",
      );
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "Password recovery could not be started.");
    } finally {
      setBusy(false);
    }
  };

  const signupUnavailable = mode === "signup" && claims?.schemaReady === false;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Account access"
        title={mode === "signin" ? "Sign in" : "Create a country account"}
        description={
          mode === "signin"
            ? "Country accounts sign in with their Instagram username. Organizer accounts use their email address."
            : "Your Instagram handle becomes your Solaris Studio username. Email is optional and is used only for account recovery."
        }
      />

      <div className="mx-auto max-w-md">
        <Panel title={mode === "signin" ? "Account" : "Register your country"}>
          <form onSubmit={submit} className="space-y-3">
            {mode === "signup" ? (
              <>
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
                  {claims?.schemaReady && !claims.countries.length ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Every country currently has an account.
                    </p>
                  ) : null}
                  {signupUnavailable ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Country account registration is temporarily unavailable.
                    </p>
                  ) : null}
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                    Instagram username
                  </span>
                  <input
                    type="text"
                    required
                    maxLength={31}
                    value={instagramUsername}
                    onChange={(event) => setInstagramUsername(event.target.value)}
                    placeholder="@yourusername"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    className="w-full rounded-xl bg-surface px-3 py-2.5 text-sm outline-none ring-primary/50 focus:ring-2"
                  />
                  <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                    This is also your Solaris Studio username. You can type it with or without @ when signing in.
                  </p>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                    Name or nickname
                  </span>
                  <input
                    type="text"
                    required
                    maxLength={80}
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="What should Solaris call you?"
                    autoComplete="name"
                    className="w-full rounded-xl bg-surface px-3 py-2.5 text-sm outline-none ring-primary/50 focus:ring-2"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                    Recovery email <span className="font-normal">(optional)</span>
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="Email for password recovery"
                    autoComplete="email"
                    className="w-full rounded-xl bg-surface px-3 py-2.5 text-sm outline-none ring-primary/50 focus:ring-2"
                  />
                  <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                    Not needed to create a country account. Add one if you want to be able to reset a forgotten password yourself.
                  </p>
                </label>
              </>
            ) : (
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                  Instagram username or admin email
                </span>
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  placeholder="@username or admin@email.com"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="w-full rounded-xl bg-surface px-3 py-2.5 text-sm outline-none ring-primary/50 focus:ring-2"
                />
              </label>
            )}

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                Password
              </span>
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
            </label>

            <button
              type="submit"
              disabled={busy || signupUnavailable}
              className="bg-aurora w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create country account"}
            </button>
          </form>

          {mode === "signin" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void recoverPassword()}
              className="mt-3 w-full text-xs text-muted-foreground hover:text-foreground disabled:opacity-60"
            >
              Forgot password?
            </button>
          ) : null}

          {msg ? <p className="mt-4 text-sm text-muted-foreground">{msg}</p> : null}

          <button
            type="button"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setMsg(null);
              setPassword("");
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
