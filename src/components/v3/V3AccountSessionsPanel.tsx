import { Clock3, KeyRound, Laptop, ShieldCheck, Smartphone, X } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

import { useMySolaris } from "@/components/mysolaris/MySolarisContext";
import { formatEventDateTime } from "@/lib/public-time";
import {
  createV3SessionRevocationAttempt,
  isV3AccountFreshAuthRequired,
  revokeV3AccountSessionWithPassword,
  type V3AccountSession,
  type V3SessionRevocationAttempt,
  type V3SessionRevocationResult,
  useRevokeV3AccountSession,
  useV3AccountSessions,
} from "@/lib/v3-account-sessions";
import { V3StatusChip, V3Surface } from "./V3Foundation";

function formatTimestamp(value: string | null) {
  if (!value) return "Activity time unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Activity time unavailable";
  return formatEventDateTime(date, { locale: "en-GB" });
}

function deviceIcon(deviceLabel: string) {
  const lower = deviceLabel.toLowerCase();
  return lower.includes("iphone") || lower.includes("ipad") || lower.includes("android")
    ? Smartphone
    : Laptop;
}

function SessionRow({
  session,
  busy,
  locked,
  onRevoke,
}: {
  session: V3AccountSession;
  busy: boolean;
  locked: boolean;
  onRevoke: (session: V3AccountSession) => void;
}) {
  const DeviceIcon = deviceIcon(session.deviceLabel);
  return (
    <div
      className="flex items-start gap-3 border-b border-[var(--v3-border-subtle)] py-4 last:border-b-0"
      data-v3-account-session={session.current ? "current" : "other"}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/[0.05] text-[var(--v3-text-secondary)]">
        <DeviceIcon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold">
            {session.deviceLabel} · {session.browserLabel}
          </p>
          {session.current ? <V3StatusChip tone="success">Current device</V3StatusChip> : null}
          {session.aal ? <V3StatusChip tone="neutral">{session.aal.toUpperCase()}</V3StatusChip> : null}
        </div>
        <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-[var(--v3-text-secondary)]">
          <Clock3 className="size-3.5" aria-hidden="true" />
          Last active {formatTimestamp(session.lastActiveAt)}
        </p>
        <p className="mt-1 text-[11px] text-[var(--v3-text-tertiary)]">
          Signed in {formatTimestamp(session.createdAt)}
        </p>
      </div>
      {!session.current ? (
        <button
          type="button"
          disabled={busy || locked}
          onClick={() => onRevoke(session)}
          className="inline-flex min-h-10 shrink-0 items-center rounded-xl border border-red-300/25 bg-red-400/[0.07] px-3 text-xs font-semibold text-red-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Revoking…" : locked ? "Finish verification" : "Revoke"}
        </button>
      ) : null}
    </div>
  );
}

export function V3AccountSessionsPanel() {
  const workspace = useMySolaris();
  const viewerId = workspace.user?.id ?? null;
  const sessionsQuery = useV3AccountSessions(viewerId);
  const revokeSession = useRevokeV3AccountSession(viewerId);
  const [attempt, setAttempt] = useState<V3SessionRevocationAttempt | null>(null);
  const [password, setPassword] = useState("");
  const [needsFreshAuth, setNeedsFreshAuth] = useState(false);
  const [reauthenticating, setReauthenticating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const currentSession = useMemo(
    () => sessionsQuery.data?.sessions.find((session) => session.current) ?? null,
    [sessionsQuery.data?.sessions],
  );

  const finishSuccessfulRevocation = (result: V3SessionRevocationResult) => {
    setMessage(
      result.alreadyRevoked || result.replayed
        ? "That session was already revoked. Solaris reconciled the existing operation receipt."
        : "Session revoked. It can no longer continue as an active Solaris session.",
    );
    setAttempt(null);
    setNeedsFreshAuth(false);
    setPassword("");
  };

  const reconcileAttempt = async (pending: V3SessionRevocationAttempt) => {
    const refreshed = await sessionsQuery.refetch();
    const stillActive = refreshed.data?.sessions.some(
      (session) => session.sessionHandle === pending.sessionHandle,
    );
    if (refreshed.data?.schemaReady && stillActive === false) {
      setMessage("That session is no longer active. Solaris reconciled the server state after the interrupted request.");
      setAttempt(null);
      setNeedsFreshAuth(false);
      setPassword("");
      return true;
    }
    return false;
  };

  const executeRevocation = async (pending: V3SessionRevocationAttempt) => {
    setErrorMessage(null);
    setMessage(null);
    try {
      const result = await revokeSession.mutateAsync(pending);
      finishSuccessfulRevocation(result);
    } catch (error) {
      if (isV3AccountFreshAuthRequired(error)) {
        setNeedsFreshAuth(true);
        setErrorMessage("Re-enter your current Solaris password to authorize this session revocation.");
        return;
      }
      try {
        if (await reconcileAttempt(pending)) return;
      } catch {
        // The original failure remains authoritative when reconciliation itself is unavailable.
      }
      setErrorMessage("Solaris could not confirm that this session was revoked. The session remains shown until the server confirms otherwise.");
    }
  };

  const beginRevocation = (session: V3AccountSession) => {
    // Once a reviewed target reaches the password challenge, do not allow a
    // second device click to silently replace that target underneath the form.
    if (
      session.current ||
      revokeSession.isPending ||
      reauthenticating ||
      needsFreshAuth ||
      attempt
    ) return;
    const pending = createV3SessionRevocationAttempt(session.sessionHandle);
    setAttempt(pending);
    setPassword("");
    setMessage(null);
    setErrorMessage(null);

    if (currentSession?.freshAuth?.fresh === true) {
      void executeRevocation(pending);
    } else {
      setNeedsFreshAuth(true);
    }
  };

  const verifyAndRevoke = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!attempt || !password || reauthenticating) return;
    setReauthenticating(true);
    setErrorMessage(null);
    setMessage(null);
    try {
      // Password verification uses an isolated, non-persistent Auth client and
      // sends this exact reviewed operation under that short-lived fresh session.
      // The canonical browser session is never replaced by the challenge.
      const result = await revokeV3AccountSessionWithPassword(attempt, password);
      finishSuccessfulRevocation(result);
      await sessionsQuery.refetch();
    } catch (error) {
      try {
        if (await reconcileAttempt(attempt)) return;
      } catch {
        // Preserve the fresh-auth failure when reconciliation is unavailable.
      }
      const candidate = error as { message?: string };
      setErrorMessage(candidate.message || "Solaris could not verify your password. No session was revoked.");
    } finally {
      setReauthenticating(false);
    }
  };

  const cancelFreshAuth = () => {
    if (reauthenticating || revokeSession.isPending) return;
    setAttempt(null);
    setPassword("");
    setNeedsFreshAuth(false);
    setErrorMessage(null);
  };

  if (sessionsQuery.isLoading) {
    return (
      <V3Surface>
        <div className="flex items-center gap-3" data-v3-account-sessions-state="loading">
          <Laptop className="size-5 text-[var(--v3-text-secondary)]" aria-hidden="true" />
          <p className="text-sm text-[var(--v3-text-secondary)]" role="status" aria-live="polite">
            Loading active sessions…
          </p>
        </div>
      </V3Surface>
    );
  }

  if (sessionsQuery.data?.schemaReady === false) {
    return (
      <V3Surface>
        <div className="flex items-start gap-3" data-v3-account-sessions-state="unavailable">
          <Laptop className="mt-0.5 size-5 shrink-0 text-[var(--v3-text-secondary)]" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold">Session management is not available on this database yet</p>
            <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">
              Solaris will not substitute browser-local device guesses for authoritative authentication session state.
            </p>
          </div>
        </div>
      </V3Surface>
    );
  }

  if (sessionsQuery.isError || !sessionsQuery.data) {
    return (
      <V3Surface>
        <div data-v3-account-sessions-state="error">
          <p className="text-sm font-semibold" role="alert">Active sessions could not be verified</p>
          <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">
            No device list is shown when the server-authoritative projection cannot be verified.
          </p>
          <button
            type="button"
            onClick={() => void sessionsQuery.refetch()}
            className="mt-3 inline-flex min-h-10 items-center rounded-xl border border-[var(--v3-border-subtle)] px-3 text-xs font-semibold"
          >
            Try again
          </button>
        </div>
      </V3Surface>
    );
  }

  return (
    <div className="grid gap-3" data-v3-account-sessions-state="ready">
      {message ? (
        <p className="rounded-xl border border-emerald-300/20 bg-emerald-400/[0.08] px-3 py-2 text-xs leading-5" role="status" aria-live="polite">
          {message}
        </p>
      ) : null}
      {errorMessage ? (
        <p className="rounded-xl border border-red-300/25 bg-red-400/[0.08] px-3 py-2 text-xs leading-5" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <V3Surface level="raised">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--v3-border-subtle)] pb-3">
          <div>
            <p className="text-sm font-semibold">Active devices</p>
            <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">
              Device and browser labels come from Solaris authentication session state. Raw session IDs, IP addresses and tokens are never shown here.
            </p>
          </div>
          <V3StatusChip tone="neutral">{sessionsQuery.data.sessions.length} active</V3StatusChip>
        </div>

        <div>
          {sessionsQuery.data.sessions.map((session) => (
            <SessionRow
              key={session.sessionHandle}
              session={session}
              busy={revokeSession.isPending && attempt?.sessionHandle === session.sessionHandle}
              locked={needsFreshAuth || reauthenticating}
              onRevoke={beginRevocation}
            />
          ))}
        </div>
      </V3Surface>

      {needsFreshAuth && attempt ? (
        <V3Surface level="raised">
          <form onSubmit={(event) => void verifyAndRevoke(event)} className="grid gap-3" data-v3-account-session-reauth="">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/[0.05]">
                  <KeyRound className="size-4" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-semibold">Verify before revoking</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">
                    Revoking another session is a high-risk account action. Enter your current password; Solaris verifies it with a short-lived authentication session before retrying the same reviewed revocation operation.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={cancelFreshAuth}
                disabled={reauthenticating || revokeSession.isPending}
                className="v3-icon-button shrink-0"
                aria-label="Cancel session revocation"
              >
                <X className="size-4" />
              </button>
            </div>
            <label className="grid gap-1.5 text-xs font-semibold text-[var(--v3-text-secondary)]">
              Current password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                className="min-h-11 rounded-xl border border-[var(--v3-border-subtle)] bg-white/[0.025] px-3 text-base text-[var(--v3-text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-white/45"
              />
            </label>
            <button
              type="submit"
              disabled={!password || reauthenticating || revokeSession.isPending}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ShieldCheck className="size-4" aria-hidden="true" />
              {reauthenticating || revokeSession.isPending ? "Verifying…" : "Verify and revoke session"}
            </button>
          </form>
        </V3Surface>
      ) : null}

      {sessionsQuery.data.securityHistory.length ? (
        <V3Surface>
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-[var(--v3-text-secondary)]" aria-hidden="true" />
            <p className="text-sm font-semibold">Recent security history</p>
          </div>
          <div className="mt-3 grid gap-2">
            {sessionsQuery.data.securityHistory.slice(0, 5).map((event, index) => (
              <div key={`${event.sessionHandle}:${event.occurredAt ?? index}`} className="flex items-center justify-between gap-3 text-xs">
                <span className="text-[var(--v3-text-secondary)]">A session was revoked</span>
                <time className="shrink-0 text-[var(--v3-text-tertiary)]" dateTime={event.occurredAt ?? undefined}>{formatTimestamp(event.occurredAt)}</time>
              </div>
            ))}
          </div>
        </V3Surface>
      ) : null}
    </div>
  );
}
