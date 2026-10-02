import { KeyRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Panel } from "@/components/AppShell";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { setSolarisPassword } from "@/lib/country-auth";

export function MySolarisPasswordPanel() {
  const { isAppMode } = useSolarisApp();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);

    if (newPassword.length < 6) {
      setMessage("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage("The passwords do not match.");
      return;
    }

    setBusy(true);
    const savePromise = setSolarisPassword(newPassword);

    toast.promise(savePromise, {
      id: "mysolaris-password-change",
      loading: "Checking & updating password…",
      success: "Password changed successfully.",
      error: (error) => error instanceof Error ? error.message : "Password could not be changed.",
    });

    try {
      await savePromise;
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      // Sonner owns transient mutation failures; validation stays inline above.
    } finally {
      setBusy(false);
    }
  };

  if (isAppMode) {
    return (
      <section aria-labelledby="app-account-security">
        <div className="solaris-app-section-heading">
          <p>Security</p>
          <h2 id="app-account-security">Password</h2>
        </div>
        <div className="solaris-app-grouped-list">
          <button
            type="button"
            onClick={() => {
              setIsOpen((current) => !current);
              setMessage(null);
            }}
            className="solaris-app-list-row w-full"
            aria-expanded={isOpen}
          >
            <span className="solaris-app-list-icon"><KeyRound className="size-4" aria-hidden="true" /></span>
            <span className="min-w-0 text-left">
              <span className="block text-sm font-semibold">Change password</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Use a password you do not use anywhere else.
              </span>
            </span>
            <span className="text-muted-foreground" aria-hidden="true">{isOpen ? "−" : "›"}</span>
          </button>
          {isOpen ? (
            <form onSubmit={submit} className="border-t border-border/60 p-3">
              <div className="grid gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">New password</span>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    autoComplete="new-password"
                    className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-base outline-none ring-primary/50 focus:ring-2"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Confirm new password</span>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-base outline-none ring-primary/50 focus:ring-2"
                  />
                </label>
              </div>
              <button
                type="submit"
                disabled={busy}
                className="mt-3 min-h-11 w-full rounded-xl bg-aurora px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {busy ? "Checking & updating…" : "Save new password"}
              </button>
              {message ? (
                <p className="mt-3 rounded-xl bg-surface px-3 py-2 text-sm text-muted-foreground" aria-live="polite">{message}</p>
              ) : null}
            </form>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <Panel
      title="Account & security"
      description="Manage the password for your Solaris Studio country account"
      actions={
        <button
          type="button"
          onClick={() => {
            setIsOpen((current) => !current);
            setMessage(null);
          }}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-xs font-semibold transition-[background-color,border-color,transform] duration-150 ease-out hover:border-primary/25 hover:bg-surface-strong active:scale-[0.98] motion-reduce:active:scale-100"
          aria-expanded={isOpen}
        >
          <KeyRound className="size-3.5 text-primary" />
          {isOpen ? "Close" : "Change password"}
        </button>
      }
    >
      {isOpen ? (
        <form onSubmit={submit} className="max-w-xl space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                New password
              </span>
              <input
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/50 focus:ring-2"
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
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/50 focus:ring-2"
              />
            </label>
          </div>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Use a password you do not use anywhere else. Solaris also blocks passwords found in known data breaches.
          </p>

          <button
            type="submit"
            disabled={busy}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-aurora px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy ? "Checking & updating…" : "Save new password"}
          </button>

          {message ? (
            <p className="rounded-xl bg-surface px-3 py-2 text-sm text-muted-foreground" aria-live="polite">
              {message}
            </p>
          ) : null}
        </form>
      ) : (
        <p className="text-sm leading-relaxed text-muted-foreground">
          Change your password here whenever you need to. You stay signed in after the change.
        </p>
      )}
    </Panel>
  );
}
