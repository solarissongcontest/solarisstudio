import { useQuery } from "@tanstack/react-query";
import { AtSign, KeyRound, Mail, UserRound } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import {
  getSolarisAccountProfile,
  setSolarisPassword,
  setSolarisRecoveryEmail,
} from "@/lib/country-auth";
import { V3StatusChip, V3Surface } from "./V3Foundation";

export function V3AccountSecurityPanel() {
  const profile = useQuery({
    queryKey: ["mysolaris-account-profile"],
    queryFn: getSolarisAccountProfile,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const [email, setEmail] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailState, setEmailState] = useState<"idle" | "saved" | "error">("idle");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);

  useEffect(() => {
    setEmail(profile.data?.email ?? "");
  }, [profile.data?.email]);

  if (profile.isLoading) {
    return (
      <V3Surface>
        <p role="status" aria-live="polite" className="text-sm text-[var(--v3-text-secondary)]">
          Loading account security…
        </p>
      </V3Surface>
    );
  }

  if (profile.isError || !profile.data) {
    return (
      <V3Surface>
        <p className="text-sm font-semibold">Account security unavailable</p>
        <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">
          Solaris could not verify the current protected account profile. Recovery and password controls are unavailable until that server state can be read.
        </p>
      </V3Surface>
    );
  }

  const saveEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!normalized || emailBusy) return;
    setEmailBusy(true);
    setEmailState("idle");
    try {
      await setSolarisRecoveryEmail(normalized);
      await profile.refetch();
      setEmailState("saved");
    } catch {
      setEmailState("error");
    } finally {
      setEmailBusy(false);
    }
  };

  const savePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordSaved(false);
    setPasswordError(null);
    if (newPassword.length < 6) {
      setPasswordError("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("The passwords do not match.");
      return;
    }
    if (passwordBusy) return;
    setPasswordBusy(true);
    try {
      await setSolarisPassword(newPassword);
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSaved(true);
    } catch {
      setPasswordError("Solaris could not confirm the password change. Your current password state remains authoritative.");
    } finally {
      setPasswordBusy(false);
    }
  };

  return (
    <div className="grid gap-3" data-v3-account-security-state="ready">
      <V3Surface level="raised">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Solaris identity</p>
            <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">
              Personal account identity and recovery information. Delegation identity is managed separately.
            </p>
          </div>
          {profile.data.status ? (
            <V3StatusChip tone={profile.data.status === "active" ? "success" : "danger"}>
              {profile.data.status === "active" ? "Active" : "Suspended"}
            </V3StatusChip>
          ) : null}
        </div>

        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="flex min-w-0 items-start gap-3 rounded-xl border border-[var(--v3-border-subtle)] bg-white/[0.02] p-3">
            <AtSign className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <dt className="text-xs text-[var(--v3-text-secondary)]">Solaris username</dt>
              <dd className="mt-1 truncate text-sm font-semibold">
                {profile.data.instagramUsername ? `@${profile.data.instagramUsername}` : "Not available"}
              </dd>
            </div>
          </div>
          <div className="flex min-w-0 items-start gap-3 rounded-xl border border-[var(--v3-border-subtle)] bg-white/[0.02] p-3">
            <UserRound className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <dt className="text-xs text-[var(--v3-text-secondary)]">Name or nickname</dt>
              <dd className="mt-1 truncate text-sm font-semibold">{profile.data.displayName || "Not available"}</dd>
            </div>
          </div>
        </dl>
      </V3Surface>

      <V3Surface>
        <form onSubmit={(event) => void saveEmail(event)}>
          <div className="flex items-start gap-3">
            <Mail className="mt-0.5 size-5 shrink-0 text-[var(--v3-text-secondary)]" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold">Recovery email</p>
              <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">
                Used only for account recovery. It is not exposed on public country, Wiki or fan-profile surfaces.
              </p>
            </div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setEmailState("idle");
              }}
              className="min-h-11 rounded-xl border border-[var(--v3-border-subtle)] bg-white/[0.025] px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-white/45"
            />
            <button
              type="submit"
              disabled={emailBusy || !email.trim() || email.trim().toLowerCase() === (profile.data.email ?? "").toLowerCase()}
              className="min-h-11 rounded-xl bg-[var(--v3-accent)] px-4 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              {emailBusy ? "Saving…" : profile.data.hasRecoveryEmail ? "Change email" : "Add email"}
            </button>
          </div>
          {emailState === "saved" ? (
            <p role="status" aria-live="polite" className="mt-2 text-xs text-[var(--v3-text-secondary)]">Recovery email saved.</p>
          ) : emailState === "error" ? (
            <p role="alert" className="mt-2 rounded-xl border border-red-300/25 bg-red-400/10 px-3 py-2 text-xs">
              Solaris could not confirm the recovery-email change. No local success state was kept.
            </p>
          ) : null}
        </form>
      </V3Surface>

      <V3Surface>
        <form onSubmit={(event) => void savePassword(event)}>
          <div className="flex items-start gap-3">
            <KeyRound className="mt-0.5 size-5 shrink-0 text-[var(--v3-text-secondary)]" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold">Change password</p>
              <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">
                Uses Solaris's protected password-update flow. Use a password you do not reuse elsewhere.
              </p>
            </div>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-xs font-semibold text-[var(--v3-text-secondary)]">
              New password
              <input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => {
                  setNewPassword(event.target.value);
                  setPasswordSaved(false);
                  setPasswordError(null);
                }}
                className="min-h-11 rounded-xl border border-[var(--v3-border-subtle)] bg-white/[0.025] px-3 text-base text-[var(--v3-text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-white/45"
              />
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-[var(--v3-text-secondary)]">
              Confirm new password
              <input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                  setPasswordSaved(false);
                  setPasswordError(null);
                }}
                className="min-h-11 rounded-xl border border-[var(--v3-border-subtle)] bg-white/[0.025] px-3 text-base text-[var(--v3-text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-white/45"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={passwordBusy}
            className="mt-3 min-h-11 rounded-xl bg-[var(--v3-accent)] px-4 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            {passwordBusy ? "Updating…" : "Save new password"}
          </button>
          {passwordError ? (
            <p role="alert" className="mt-3 rounded-xl border border-red-300/25 bg-red-400/10 px-3 py-2 text-xs leading-5">{passwordError}</p>
          ) : passwordSaved ? (
            <p role="status" aria-live="polite" className="mt-3 text-xs text-[var(--v3-text-secondary)]">Password changed successfully.</p>
          ) : null}
        </form>
      </V3Surface>
    </div>
  );
}
