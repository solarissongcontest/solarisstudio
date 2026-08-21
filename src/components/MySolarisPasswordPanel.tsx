import { KeyRound } from "lucide-react";
import { useState } from "react";

import { Panel } from "@/components/AppShell";
import { setSolarisPassword } from "@/lib/country-auth";

export function MySolarisPasswordPanel() {
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
    try {
      await setSolarisPassword(newPassword);
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Password changed successfully.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Password could not be changed.");
    } finally {
      setBusy(false);
    }
  };

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
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-xs font-semibold transition hover:border-primary/25 hover:bg-surface-strong"
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
