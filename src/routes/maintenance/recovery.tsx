import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { supabase } from "@/integrations/supabase/client";
import { fetchAdminRulebookReleases } from "@/lib/rules-governance";
import { prepareGovernedV42Draft } from "@/lib/ssc-rules/v42-governed-import";
import {
  GLOBAL_MAINTENANCE_MODE,
  MAINTENANCE_PLATFORM_PREFLIGHT_PATH,
} from "@/lib/maintenance";
import type { PlatformExitPreflightReceipt } from "@/lib/platform-exit-preflight.functions";
import {
  applyPlatformModeChange,
  loadPlatformOperationalSnapshot,
  previewPlatformModeChange,
  reauthenticatePlatformR3,
  type PlatformModeChangePreview,
  type PlatformOperationalSnapshot,
} from "@/lib/platform-operational-mode";

/**
 * Minimal, explicitly authorized recovery UI, independent of Organizer's
 * disabled normal mutation transports during emergency maintenance.
 * The full rules manager and normal write surface remain blocked.
 */
export const Route = createFileRoute("/maintenance/recovery")({
  head: () => ({
    meta: [
      { title: "Protected platform recovery — Solaris Studio" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: MaintenanceRecoveryPage,
});

type PendingRecovery = {
  actorId: string;
  preview: PlatformModeChangePreview;
  preflight: PlatformExitPreflightReceipt;
  reason: string;
};

function errorText(value: unknown) {
  return value instanceof Error ? value.message : "The recovery operation could not be completed.";
}

function MaintenanceRecoveryPage() {
  const [actorId, setActorId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [reauthPassword, setReauthPassword] = useState("");
  const [reason, setReason] = useState("");
  const [snapshot, setSnapshot] = useState<PlatformOperationalSnapshot | null>(null);
  const [preflight, setPreflight] = useState<PlatformExitPreflightReceipt | null>(null);
  const [pending, setPending] = useState<PendingRecovery | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [draftProgress, setDraftProgress] = useState<number | null>(null);
  const [draftPrepared, setDraftPrepared] = useState(false);
  const actorRef = useRef<string | null>(null);
  actorRef.current = actorId;

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      setActorId(null);
      setSnapshot(null);
      return;
    }
    setActorId(data.user.id);
    const next = await loadPlatformOperationalSnapshot();
    if (actorRef.current && actorRef.current !== data.user.id) {
      setPending(null);
      setPreflight(null);
      setReauthPassword("");
    }
    setSnapshot(next);
  }, []);

  useEffect(() => {
    let active = true;
    if (!GLOBAL_MAINTENANCE_MODE) return;
    void supabase.auth.getUser().then(async ({ data, error }) => {
      if (!active || error || !data.user) return;
      setActorId(data.user.id);
      try {
        const next = await loadPlatformOperationalSnapshot();
        if (active) setSnapshot(next);
      } catch (err) {
        if (active) setMessage(errorText(err));
      }
    });
    return () => { active = false; };
  }, []);

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setPending(null);
    setPreflight(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: loginPassword,
      });
      if (error) throw error;
      if (!data.user) throw new Error("Organizer authentication failed.");
      setLoginPassword("");
      setReauthPassword("");
      setActorId(data.user.id);
      setSnapshot(await loadPlatformOperationalSnapshot());
    } catch (err) {
      setMessage(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const runSafetyChecks = async () => {
    if (!actorId || !snapshot || snapshot.mode !== "read_only" || reason.trim().length < 5) return;
    setBusy(true);
    setMessage(null);
    setPending(null);
    setPreflight(null);
    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user || user.data.user.id !== actorId) {
        throw new Error("Organizer identity changed. Sign in again.");
      }
      const preview = await previewPlatformModeChange({
        targetMode: "degraded",
        affectedServices: snapshot.affectedServices,
        message: snapshot.message,
        incidentReference: snapshot.incidentReference,
      });
      if (preview.currentMode !== "read_only" || preview.targetMode !== "degraded" ||
          !preview.requiresRecoveryStep || preview.expectedVersion !== snapshot.version) {
        throw new Error("Live platform mode changed. Refresh before reviewing recovery.");
      }
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;
      if (!accessToken) throw new Error("Your Solaris session expired. Sign in again.");
      const response = await fetch(MAINTENANCE_PLATFORM_PREFLIGHT_PATH, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ targetMode: "degraded" }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          typeof payload?.message === "string"
            ? payload.message
            : "Protected recovery preflight could not be run.",
        );
      }
      const receipt = payload?.receipt as PlatformExitPreflightReceipt | undefined;
      if (!receipt || !receipt.id || receipt.currentMode !== "read_only" ||
          receipt.targetMode !== "degraded" || receipt.platformVersion !== preview.expectedVersion) {
        throw new Error("Recovery preflight was not bound to the current platform state.");
      }
      setPreflight(receipt);
      if (receipt.ready && Date.parse(receipt.expiresAt) > Date.now()) {
        setPending({ actorId, preview, preflight: receipt, reason: reason.trim() });
      } else {
        setMessage("Recovery is blocked. Resolve every critical failure before running the preflight again.");
      }
    } catch (err) {
      setMessage(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const applyRecovery = async () => {
    if (!pending || !actorId || !reauthPassword) return;
    setBusy(true);
    setMessage(null);
    try {
      const { data: user, error: authError } = await supabase.auth.getUser();
      if (authError || user.user?.id !== pending.actorId || actorId !== pending.actorId) {
        throw new Error("Organizer account changed. Recovery review must be repeated.");
      }
      if (!pending.preflight.ready || Date.parse(pending.preflight.expiresAt) <= Date.now()) {
        throw new Error("Recovery preflight expired or is blocked. Run the checks again.");
      }
      const live = await loadPlatformOperationalSnapshot();
      if (live.mode !== "read_only" || live.version !== pending.preview.expectedVersion) {
        throw new Error("Platform mode changed. Refresh and repeat the preflight.");
      }
      // This is the existing canonical R3 password flow, not a privileged SQL
      // session. The database independently checks freshness, actor, version,
      // receipt, capability and current health again at the actual mutation.
      await reauthenticatePlatformR3(reauthPassword);
      const receipt = await applyPlatformModeChange({
        preview: pending.preview,
        reason: pending.reason,
        affectedServices: pending.preview.affectedServices,
        message: pending.preview.message,
        incidentReference: pending.preview.incidentReference,
        exitPreflightId: pending.preflight.id,
      });
      if (receipt.mode !== "degraded") throw new Error("Recovery did not return Degraded mode.");
      setPending(null);
      setPreflight(null);
      setReauthPassword("");
      setCompleted(true);
      await refresh();
      setMessage(
        "The separate emergency Worker maintenance gate remains active. Canonical mode is Degraded. An authorized organizer may now prepare the v4.2 draft below, without publishing it.",
      );
    } catch (err) {
      setMessage(errorText(err));
    } finally {
      setReauthPassword("");
      setBusy(false);
    }
  };

  // Draft-only: the backend rules.edit RPCs and the canonical Degraded
  // operational mode must independently allow every write. The Worker remains
  // in global maintenance, no release publication RPC is exposed here.
  const prepareV42Draft = async () => {
    if (!actorId || snapshot?.mode !== "degraded" || busy) return;
    setBusy(true);
    setMessage(null);
    setDraftProgress(0);
    setDraftPrepared(false);
    try {
      const initialUser = await supabase.auth.getUser();
      if (initialUser.error || initialUser.data.user?.id !== actorId) {
        throw new Error("Your Solaris Organizer session changed. Sign in again.");
      }
      const state = await loadPlatformOperationalSnapshot();
      if (state.mode !== "degraded") {
        throw new Error("Solaris is not in Degraded mode. Rulebook draft writes remain blocked.");
      }

      const releases = await fetchAdminRulebookReleases();
      const assertActor = async () => {
        if (actorRef.current !== actorId) {
          throw new Error("Organizer account changed during import. Resume with the correct account.");
        }
        const session = await supabase.auth.getSession();
        if (session.data.session?.user.id !== actorId) {
          throw new Error("Organizer session expired or changed. Import stopped safely.");
        }
      };
      const result = await prepareGovernedV42Draft({
        releases,
        assertActor,
        rpc: async (name, args) => {
          await assertActor();
          // The official admin RPC verifies rules.edit on the caller. Never
          // use postgres, service_role, direct-table writes, or impersonation.
          const { data, error } = await (supabase as any).rpc(name, args);
          if (error) throw new Error(error.message);
          return data;
        },
        onProgress: ({ imported }) => setDraftProgress(imported),
      });
      setDraftPrepared(true);
      setMessage(
        `Unpublished v4.2 draft prepared: ${result.imported} new changes, ${result.unchanged} existing edits retained out of ${result.total} rules. TSBC policy review and official publication are still required.`,
      );
    } catch (err) {
      setMessage(
        `Draft import stopped: ${errorText(err)}. Any completed rule changes remain in the draft and can be resumed after reviewing the issue.`,
      );
    } finally {
      setDraftProgress(null);
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#080e1c] px-4 py-8 text-slate-100 sm:py-14">
      <div className="mx-auto max-w-2xl space-y-5">
        <Link to="/" className="text-sm font-semibold text-sky-200 underline">
          Solaris Studio maintenance
        </Link>
        <header>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-sky-200">Emergency system operations</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Protected platform recovery</h1>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            This page restores an eligible Read-only system to Degraded only after
            authenticated organizer review, cross-service safety checks and fresh
            password authorization. It cannot publish rules or turn off Worker maintenance.
          </p>
        </header>

        {message ? (
          <div role="status" className="rounded-xl border border-amber-300/30 bg-amber-200/10 p-4 text-sm leading-6">
            {message}
          </div>
        ) : null}

        {!GLOBAL_MAINTENANCE_MODE ? (
          <p>The emergency maintenance gate is off. Use Organizer → System Operations.</p>
        ) : !actorId ? (
          <form onSubmit={(event) => void signIn(event)} className="space-y-4 rounded-2xl border border-white/15 bg-white/5 p-5">
            <h2 className="font-bold">Sign in as a Solaris Organizer</h2>
            <label className="block text-sm">
              Organizer email
              <input type="email" required autoComplete="username" value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-2 min-h-11 w-full rounded-lg border border-white/20 bg-black/30 px-3" />
            </label>
            <label className="block text-sm">
              Password
              <input type="password" required autoComplete="current-password" value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                className="mt-2 min-h-11 w-full rounded-lg border border-white/20 bg-black/30 px-3" />
            </label>
            <button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-sky-200 px-4 font-semibold text-slate-950 disabled:opacity-50">
              {busy ? "Checking credentials…" : "Sign in and inspect state"}
            </button>
          </form>
        ) : (
          <section className="space-y-4 rounded-2xl border border-white/15 bg-white/5 p-5">
            <div>
              <h2 className="font-bold">Canonical platform state</h2>
              <p className="mt-2 text-sm text-slate-300">
                {snapshot ? `${snapshot.mode} · version ${snapshot.version}` : "State not yet verified"}
              </p>
              {snapshot?.reason ? <p className="mt-1 text-xs text-slate-400">{snapshot.reason}</p> : null}
            </div>
            <button type="button" disabled={busy} onClick={() => void refresh()}
              className="min-h-10 rounded-lg border border-white/20 px-4 text-sm font-semibold disabled:opacity-50">
              Refresh live state
            </button>

            {snapshot?.mode === "read_only" && !completed ? (
              <>
                <label className="block text-sm">
                  Required recovery reason
                  <textarea rows={3} value={reason} onChange={(event) => {
                    setReason(event.target.value);
                    setPending(null);
                    setPreflight(null);
                    setReauthPassword("");
                  }} placeholder="Explain the verified incident recovery and why Degraded mode is appropriate."
                  className="mt-2 w-full rounded-lg border border-white/20 bg-black/30 p-3" />
                </label>
                <button type="button" disabled={busy || reason.trim().length < 5}
                  onClick={() => void runSafetyChecks()}
                  className="min-h-11 rounded-xl border border-sky-200/40 bg-sky-200/10 px-4 font-semibold text-sky-100 disabled:opacity-50">
                  {busy ? "Verifying service safety…" : "Run protected recovery preflight"}
                </button>
              </>
            ) : null}

            {preflight ? (
              <div className="space-y-2 border-t border-white/10 pt-4 text-sm">
                <h3 className="font-bold">Preflight · {preflight.ready ? "ready" : "blocked"}</h3>
                <p className="text-xs text-slate-400">Expires {preflight.expiresAt}</p>
                <ul className="space-y-2">
                  {Object.entries(preflight.checks).map(([key, check]) => (
                    <li key={key} className="rounded-lg border border-white/10 px-3 py-2">
                      <span className="font-semibold">{check.pass ? "✓" : "✕"} {key.replaceAll("_", " ")}</span>
                      <span className="block text-xs text-slate-300">{check.detail}</span>
                    </li>
                  ))}
                </ul>
                {preflight.criticalFailures.length ? (
                  <p className="text-amber-200">
                    Critical blockers: {preflight.criticalFailures.join(", ")}
                  </p>
                ) : null}
              </div>
            ) : null}

            {pending ? (
              <div className="space-y-3 rounded-xl border border-amber-200/30 p-4">
                <h3 className="font-bold">Confirm R3 recovery: Read-only → Degraded</h3>
                <p className="text-sm text-slate-300">Reason: {pending.reason}</p>
                <p className="text-sm text-slate-300">Platform version: {pending.preview.expectedVersion}</p>
                <label className="block text-sm">
                  Re-enter your Solaris password to authorize this protected mode change
                  <input type="password" autoComplete="current-password" value={reauthPassword}
                    onChange={(event) => setReauthPassword(event.target.value)}
                    className="mt-2 min-h-11 w-full rounded-lg border border-white/20 bg-black/30 px-3" />
                </label>
                <button type="button" disabled={busy || !reauthPassword}
                  onClick={() => void applyRecovery()}
                  className="min-h-11 rounded-xl bg-amber-200 px-4 font-bold text-slate-950 disabled:opacity-50">
                  {busy ? "Authorizing recovery…" : "Confirm Degraded recovery"}
                </button>
              </div>
            ) : null}

            {snapshot?.mode === "degraded" ? (
              <div className="space-y-3 rounded-xl border border-sky-200/25 bg-sky-200/5 p-4">
                <h3 className="font-bold">Prepare SSC Regulations v4.2 draft</h3>
                <p className="text-sm leading-6 text-slate-300">
                  This is an organizer-only, <strong>draft-only</strong> import of all
                  113 proposed changes into the existing Rules Manager database.
                  Each write uses the standard rules.edit authorization. Existing
                  organizer edits are preserved. No publication occurs here.
                </p>
                <button
                  type="button"
                  disabled={busy || draftPrepared}
                  onClick={() => void prepareV42Draft()}
                  className="min-h-11 rounded-xl bg-sky-200 px-4 font-bold text-slate-950 disabled:opacity-50"
                >
                  {busy && draftProgress !== null
                    ? `Preparing draft · ${draftProgress}/113`
                    : draftPrepared
                      ? "v4.2 draft prepared"
                      : "Prepare v4.2 draft (unpublished)"}
                </button>
                <p className="text-xs text-slate-400">
                  The SSC owner/TSBC approval is recorded. Independent meaning
                  and readability review, negative-score Results verification,
                  and the normal authorized publication workflow remain required.
                </p>
                <a href="/rules/v4-2-preview" className="text-sm font-semibold text-sky-200 underline">
                  Read the public draft preview
                </a>
              </div>
            ) : null}

            {snapshot && snapshot.mode !== "read_only" ? (
              <p className="text-sm text-slate-300">
                This emergency lane only supports Read-only → Degraded. Other
                transitions remain in Organizer System Operations.
              </p>
            ) : null}
          </section>
        )}
        <p className="text-xs leading-5 text-slate-400">
          All ordinary writes remain blocked by the emergency circuit breaker.
          The server records a short-lived actor-bound receipt and checks service
          readiness again when a mode change is requested. No hidden bypass or
          automatic official rulebook publication is performed.
        </p>
      </div>
    </main>
  );
}
