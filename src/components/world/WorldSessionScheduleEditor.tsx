import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarClock, CheckCircle2, ShieldCheck } from "lucide-react";

import { useFanSession } from "@/lib/prediction-data";
import {
  loadWorldSessionScheduleManage,
  newWorldSessionRescheduleOperation,
  rescheduleWorldSession,
  utcInputFromInstant,
  utcInstantFromInput,
  validateWorldSessionReschedule,
  type WorldSessionRescheduleReceipt,
  type WorldSessionVenue,
} from "@/lib/world-session-reschedule";

type Draft = {
  starts: string;
  ends: string;
  venueType: WorldSessionVenue;
  venueLabel: string;
  externalUrl: string;
};
type Pending = {
  description: string;
  run: () => Promise<WorldSessionRescheduleReceipt>;
};

const deterministic = (error: unknown) =>
  error !== null && typeof error === "object" && "code" in error &&
  ["40001","23514","42501","22023","25006"].includes(String(error.code));

function errorMessage(error: unknown): string {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return "The server response may be uncertain. Retry the exact original operation before preparing another schedule.";
  }
  switch (String(error.code)) {
    case "40001": return "This session changed on another device. Reload the official schedule before resubmitting.";
    case "23514": return "The meeting is no longer scheduled, or its institution is inactive.";
    case "42501": return "Your institutional scheduling authority could not be verified.";
    case "22023": return "Review the UTC dates, venue type and meeting URL.";
    case "25006": return "Institutional changes are currently disabled by the platform operating mode.";
    default: return "The official reschedule result could not be verified.";
  }
}

function localPreview(utcInput: string): string {
  try {
    const iso = utcInstantFromInput(utcInput);
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short",
    });
  } catch {
    return "Enter a valid UTC instant";
  }
}

export function WorldSessionScheduleEditor({ sessionId }: { sessionId: string }) {
  const queryClient = useQueryClient();
  const session = useFanSession();
  const actorId = session.data?.id ?? null;
  const schedule = useQuery({
    queryKey: ["world","session","schedule-manage",actorId,sessionId],
    queryFn: () => loadWorldSessionScheduleManage(sessionId),
    enabled: !!actorId,
    staleTime: 0,
    retry: false,
  });

  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const retry = useRef<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<WorldSessionRescheduleReceipt | null>(null);

  useEffect(() => {
    // A previously authorized actor must never leave private venue links in
    // another account's cache or an untrusted stale editor.
    void queryClient.removeQueries({ queryKey: ["world","session","schedule-manage"] });
    setDraft(null);
    setDirty(false);
    setPending(null);
    retry.current = null;
    setReceipt(null);
    setError(null);
  }, [actorId, queryClient]);

  useEffect(() => {
    if (schedule.isError) {
      void queryClient.removeQueries({
        queryKey: ["world","session","schedule-manage",actorId,sessionId],
      });
      setDraft(null);
      setDirty(false);
      setPending(null);
      retry.current = null;
    }
  }, [schedule.isError, actorId, sessionId, queryClient]);

  useEffect(() => {
    if (!schedule.data || dirty || schedule.isError) return;
    setDraft({
      starts: utcInputFromInstant(schedule.data.startsAt),
      ends: utcInputFromInstant(schedule.data.endsAt),
      venueType: schedule.data.venueType,
      venueLabel: schedule.data.venueLabel ?? "",
      externalUrl: schedule.data.externalUrl ?? "",
    });
  }, [dirty, schedule.data, schedule.isError]);

  const canEdit = schedule.data?.status === "scheduled";
  function change(partial: Partial<Draft>) {
    if (busy || retry.current || pending || !canEdit) return;
    setDraft((previous) => previous ? { ...previous, ...partial } : previous);
    setDirty(true);
    setReceipt(null);
    setError(null);
  }

  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !schedule.data || !canEdit || pending || busy || retry.current) return;
    let startsAt: string;
    let endsAt: string;
    try {
      startsAt = utcInstantFromInput(draft.starts);
      endsAt = utcInstantFromInput(draft.ends);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Enter complete UTC dates.");
      return;
    }
    const operation = newWorldSessionRescheduleOperation();
    const input = {
      sessionId, startsAt, endsAt,
      venueType: draft.venueType,
      venueLabel: draft.venueLabel,
      externalUrl: draft.externalUrl,
      expectedRevision: schedule.data.revision,
      operation,
    };
    const validation = validateWorldSessionReschedule(input);
    if (validation) {
      setError(validation);
      return;
    }
    setError(null);
    setPending({
      description: "Reschedule the official session from revision " +
        schedule.data.revision + " to " +
        new Date(startsAt).toLocaleString(undefined,{year:"numeric",month:"long",day:"numeric",hour:"2-digit",minute:"2-digit",timeZoneName:"short"}) +
        ", ending " +
        new Date(endsAt).toLocaleString(undefined,{year:"numeric",month:"long",day:"numeric",hour:"2-digit",minute:"2-digit",timeZoneName:"short"}) +
        ". The authoritative session, public schedule and audit event will update together.",
      run: () => rescheduleWorldSession(input),
    });
  }

  async function execute(operation: Pending) {
    if (busy) return;
    retry.current = operation;
    setBusy(true);
    setError(null);
    try {
      const verified = await operation.run();
      retry.current = null;
      setReceipt(verified);
      setPending(null);
      setDirty(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["world","session","schedule-manage",actorId,sessionId] }),
        queryClient.invalidateQueries({ queryKey: ["world","session","public",sessionId] }),
        queryClient.invalidateQueries({ queryKey: ["world","sessions"] }),
      ]);
    } catch (failure) {
      setPending(null);
      setError(errorMessage(failure));
      if (deterministic(failure)) {
        retry.current = null;
        await queryClient.invalidateQueries({
          queryKey: ["world","session","schedule-manage",actorId,sessionId],
        });
      }
    } finally {
      setBusy(false);
    }
  }

  return <main className="mx-auto w-full max-w-3xl space-y-7 px-4 pb-24 pt-6 sm:px-6">
    <header className="space-y-3 border-b border-border pb-6">
      <Link to="/world/sessions/$sessionId" params={{ sessionId }}
        className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">
        Return to the institutional session
      </Link>
      <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
        <CalendarClock className="size-7" aria-hidden="true"/> Session schedule
      </h1>
      <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
        Edit the official time and venue of a scheduled meeting. Times are
        entered in <strong>UTC</strong> and verified against the current session
        revision. The preview shows your device's local timezone.
      </p>
    </header>

    {session.isPending ? <p role="status">Resolving account session…</p> :
      !actorId ? <section role="status" className="space-y-2 border-b border-border pb-5">
        <h2 className="font-semibold">Institutional sign-in required</h2>
        <p className="text-sm text-muted-foreground">
          Only an authorized institutional officer can inspect private venue details.
        </p>
      </section> :
      schedule.isPending ? <p role="status">Verifying institutional scheduling authority…</p> :
      schedule.isError || !schedule.data || !draft ? <section role="alert" className="space-y-3">
        <h2 className="text-xl font-semibold">Official schedule unavailable</h2>
        <p className="text-sm text-muted-foreground">
          Access was denied, or the current institutional schedule could not be loaded.
        </p>
        <button type="button" className="min-h-11 rounded-xl border px-4 text-sm"
          onClick={() => void schedule.refetch()}>Retry authorized read</button>
      </section> : <>
        <section className="space-y-1 border-b border-border pb-4">
          <h2 className="text-xl font-semibold">{schedule.data.title}</h2>
          <p className="text-sm text-muted-foreground">
            State: {schedule.data.status} · Official revision {schedule.data.revision}
          </p>
        </section>
        {error && <p role="alert" className="rounded-xl border border-destructive/50 p-4 text-sm">{error}</p>}
        {receipt && <p role="status" className="flex flex-wrap items-center gap-2 text-sm">
          <ShieldCheck className="size-5" aria-hidden="true" />
          Verified official schedule receipt <code className="break-all">{receipt.operationId}</code>,
          revision {receipt.revision}.
        </p>}
        {retry.current && <section className="space-y-3 rounded-xl border p-4">
          <h3 className="font-semibold">Earlier operation may have committed</h3>
          <p className="text-sm">Do not create another schedule operation before reconciling this one.</p>
          <button type="button" disabled={busy} className="min-h-11 rounded-xl border px-4 text-sm"
            onClick={() => void execute(retry.current!)}>Retry the exact operation</button>
        </section>}
        {!canEdit && <p role="status" className="rounded-xl border p-4 text-sm">
          This session is no longer scheduled. Times and venues are immutable
          after opening, recess, conclusion or cancellation.
        </p>}
        <form className="space-y-5" onSubmit={prepare}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-2 text-sm font-semibold">
              <span>Start (UTC)</span>
              <input type="datetime-local" required value={draft.starts}
                disabled={!canEdit || busy || !!retry.current || !!pending}
                onChange={(event) => change({ starts: event.target.value })}
                className="min-h-11 w-full rounded-xl border bg-background px-3"/>
              <span className="block text-xs font-normal text-muted-foreground">
                Local: {localPreview(draft.starts)}
              </span>
            </label>
            <label className="block space-y-2 text-sm font-semibold">
              <span>End (UTC)</span>
              <input type="datetime-local" required value={draft.ends}
                disabled={!canEdit || busy || !!retry.current || !!pending}
                onChange={(event) => change({ ends: event.target.value })}
                className="min-h-11 w-full rounded-xl border bg-background px-3"/>
              <span className="block text-xs font-normal text-muted-foreground">
                Local: {localPreview(draft.ends)}
              </span>
            </label>
          </div>
          <label className="block space-y-2 text-sm font-semibold">
            <span>Venue type</span>
            <select value={draft.venueType}
              disabled={!canEdit || busy || !!retry.current || !!pending}
              onChange={(event) => change({ venueType: event.target.value as WorldSessionVenue })}
              className="min-h-11 w-full rounded-xl border bg-background px-3">
              <option value="online">Online</option>
              <option value="external">External platform</option>
              <option value="physical">Physical</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </label>
          <label className="block space-y-2 text-sm font-semibold">
            <span>Venue label</span>
            <input type="text" maxLength={180} value={draft.venueLabel}
              disabled={!canEdit || busy || !!retry.current || !!pending}
              onChange={(event) => change({ venueLabel: event.target.value })}
              placeholder="Official institutional meeting venue"
              className="min-h-11 w-full rounded-xl border bg-background px-3"/>
          </label>
          <label className="block space-y-2 text-sm font-semibold">
            <span>Private HTTPS venue link (optional)</span>
            <input type="url" value={draft.externalUrl}
              disabled={!canEdit || busy || !!retry.current || !!pending}
              onChange={(event) => change({ externalUrl: event.target.value })}
              placeholder="https://..."
              className="min-h-11 w-full rounded-xl border bg-background px-3"/>
            <span className="block text-xs font-normal text-muted-foreground">
              The public schedule does not expose private meeting-room links.
            </span>
          </label>
          <button type="submit"
            disabled={!canEdit || busy || !!retry.current || !!pending || !dirty}
            className="min-h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-40">
            Review official rescheduling
          </button>
        </form>
        {pending && !retry.current && <section className="space-y-3 rounded-xl border p-4">
          <h3 className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="size-5" aria-hidden="true"/> Confirm schedule change
          </h3>
          <p className="text-sm leading-6">{pending.description}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy}
              onClick={() => void execute(pending)}
              className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">
              Confirm official change
            </button>
            <button type="button" disabled={busy} onClick={() => setPending(null)}
              className="min-h-11 rounded-xl border px-4 text-sm font-semibold">
              Cancel
            </button>
          </div>
        </section>}
      </>}
  </main>;
}
