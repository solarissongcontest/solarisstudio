import { KeyRound } from "lucide-react";
import { useEffect, useState } from "react";

import { AdminStatus } from "@/components/admin/AdminUI";
import { adminSetSolarisPassword } from "@/lib/country-auth";
import type { AdminCountryAccount } from "@/lib/country-account";

export function AdminCountryPasswordPanel({ account }: { account: AdminCountryAccount }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setPassword("");
    setConfirmPassword("");
    setMessage(null);
    setSuccess(false);
  }, [account.user_id]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setSuccess(false);

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
      await adminSetSolarisPassword(account.user_id, password);
      setPassword("");
      setConfirmPassword("");
      setSuccess(true);
      setMessage(`Password changed for ${account.country_name}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Password could not be changed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <KeyRound className="size-4 text-sky-100" />
            <p className="text-sm font-semibold text-foreground">Change account password</p>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Set a new password for this country account. The owner can use it immediately on the Solaris Studio sign-in page.
          </p>
        </div>
        <AdminStatus tone="neutral">Admin only</AdminStatus>
      </div>

      <form onSubmit={submit} className="mt-4 space-y-3">
        <label className="block">
          <span className="admin-section-label">New password</span>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30"
          />
        </label>

        <label className="block">
          <span className="admin-section-label">Confirm new password</span>
          <input
            type="password"
            required
            minLength={6}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
            className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30"
          />
        </label>

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Weak or known breached passwords are blocked by the server. Country accounts cannot use this admin override themselves.
        </p>

        <button type="submit" disabled={busy} className="admin-action-primary w-full">
          <KeyRound className="size-4" /> {busy ? "Changing password…" : "Change password"}
        </button>

        {message ? (
          <div
            aria-live="polite"
            className={`rounded-xl border p-3 text-sm ${
              success
                ? "border-emerald-200/15 bg-emerald-200/[0.045] text-emerald-50"
                : "border-rose-200/15 bg-rose-200/[0.045] text-rose-50"
            }`}
          >
            {message}
          </div>
        ) : null}
      </form>
    </div>
  );
}
