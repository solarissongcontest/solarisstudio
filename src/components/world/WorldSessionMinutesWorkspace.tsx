import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BookOpenText, CheckCircle2, FileCheck2, LockKeyhole, ShieldCheck } from "lucide-react";

import { useFanSession } from "@/lib/prediction-data";
import {
  loadWorldManageMinutes,
  loadWorldPublicMinutes,
  mutateWorldMinutes,
  newWorldMinutesOperation,
  type WorldMinutesAction,
  type WorldMinutesReceipt,
} from "@/lib/world-session-minutes";

type PendingReview = {
  label: string;
  run: () => Promise<WorldMinutesReceipt>;
};
const deterministic = (error: unknown) =>
  error !== null && typeof error === "object" && "code" in error &&
  ["40001","23514","42501","22023","23505","25006"].includes(String(error.code));
function message(error: unknown): string {
  if (!error || typeof error !== "object" || !("code" in error))
    return "The server response may have been lost. Reconcile this exact operation before making another change.";
  switch (String(error.code)) {
    case "40001": return "These minutes changed on another device. Reload the official revision before editing.";
    case "42501": return "Your institutional authorization is no longer available.";
    case "23514": return "The session or review state no longer permits this operation.";
    case "22023": return "Review the minutes text and supported length limits.";
    case "25006": return "Institutional writes are temporarily unavailable.";
    default: return "The official result was not verified. Reload the authoritative record.";
  }
}

export function WorldSessionMinutesWorkspace({ sessionId }: { sessionId: string }) {
  const queryClient = useQueryClient();
  const session = useFanSession();
  const actorId = session.data?.id ?? null;
  const published = useQuery({
    queryKey: ["world","minutes","public",sessionId],
    queryFn: () => loadWorldPublicMinutes(sessionId),
    staleTime: 60_000, retry: 1,
  });
  const [showManager, setShowManager] = useState(false);
  const management = useQuery({
    queryKey: ["world","minutes","manage",actorId,sessionId],
    queryFn: () => loadWorldManageMinutes(sessionId),
    enabled: showManager && !!actorId,
    staleTime: 0, retry: false,
  });
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<PendingReview | null>(null);
  const retry = useRef<PendingReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<WorldMinutesReceipt | null>(null);

  useEffect(() => {
    // Login changes must never reuse another actor's confidential draft.
    void queryClient.removeQueries({ queryKey: ["world","minutes","manage"] });
    setShowManager(false);
    setSummary("");
    setBody("");
    setDirty(false);
    setPending(null);
    retry.current = null;
    setReceipt(null);
    setError(null);
  }, [actorId, queryClient]);

  useEffect(() => {
    if (management.isError) {
      // Denied or failed private revalidation must not retain stale content.
      void queryClient.removeQueries({ queryKey: ["world","minutes","manage",actorId,sessionId] });
      setShowManager(false);
      setSummary("");
      setBody("");
      setDirty(false);
      setPending(null);
      retry.current = null;
    }
  }, [management.isError, actorId, sessionId, queryClient]);

  useEffect(() => {
    if (!dirty && management.data && !management.isError) {
      setSummary(management.data.summary);
      setBody(management.data.body);
    }
  }, [dirty, management.data]);

  const state = management.data;
  const mayEdit = !!state?.canManage && state.status !== "published" &&
    ["open","recessed","concluded"].includes(state.sessionStatus);
  const maySubmit = mayEdit && state.status === "draft" && !dirty && !!state.body.trim();
  const mayPublish = !!state?.canPublish && state.status === "in_review" &&
    state.sessionStatus === "concluded" && !dirty;

  function prepare(action: WorldMinutesAction) {
    if (pending || retry.current || busy || !state) return;
    if (action === "save" && !mayEdit) return;
    if (action === "submit" && !maySubmit) return;
    if (action === "publish" && !mayPublish) return;
    const operation = newWorldMinutesOperation(action);
    const args = {
      sessionId, action, operation,
      expectedRevision: state.revision,
      summary: action === "save" ? summary : undefined,
      body: action === "save" ? body : undefined,
    };
    setError(null);
    setPending({
      label: action === "save"
        ? "Save this draft to the official institutional record. It will remain private."
        : action === "submit"
          ? "Submit the saved draft for institutional review. It remains private."
          : "Publish these reviewed minutes publicly and preserve an immutable historical version. This cannot be undone from this workspace.",
      run: () => mutateWorldMinutes(args),
    });
  }

  async function execute(action: PendingReview) {
    if (busy) return;
    retry.current = action;
    setBusy(true);
    setError(null);
    try {
      const result = await action.run();
      retry.current = null;
      setReceipt(result);
      setPending(null);
      setDirty(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["world","minutes","manage",actorId,sessionId] }),
        queryClient.invalidateQueries({ queryKey: ["world","minutes","public",sessionId] }),
        queryClient.invalidateQueries({ queryKey: ["world","session","public",sessionId] }),
      ]);
    } catch (failure) {
      setPending(null);
      setError(message(failure));
      if (deterministic(failure)) {
        retry.current = null;
        await queryClient.invalidateQueries({
          queryKey: ["world","minutes","manage",actorId,sessionId],
        });
      }
    } finally {
      setBusy(false);
    }
  }

  return <main className="mx-auto w-full max-w-3xl space-y-8 px-4 pb-24 pt-6 sm:px-6">
    <header className="space-y-3 border-b border-border/70 pb-6">
      <Link to="/world/sessions/$sessionId" params={{ sessionId }}
        className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">
        Back to institutional session
      </Link>
      <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
        <BookOpenText className="size-7" aria-hidden="true" /> Official minutes
      </h1>
      <p className="text-sm leading-6 text-muted-foreground">
        The published session record is authoritative. Private drafts and review
        notes stay restricted to institutional officers. Attendance evidence is
        preserved separately and does not establish vote eligibility or quorum.
      </p>
    </header>

    <section aria-labelledby="public-minutes-heading" className="space-y-4">
      <h2 id="public-minutes-heading" className="text-xl font-semibold">Published record</h2>
      {published.isPending ? <p role="status">Loading official minutes…</p> :
        published.isError ? <div role="alert" className="space-y-2 border-b border-border py-5">
          <p>The authoritative public minutes could not be loaded.</p>
          <button type="button" className="min-h-11 rounded-lg border px-4"
            onClick={() => void published.refetch()}>Retry published record</button>
        </div> : published.data ? <article className="space-y-4">
          <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            Published {new Date(published.data.publishedAt).toLocaleString()}
            {" · "}Revision {published.data.revision}
          </p>
          {published.data.summary && <p className="text-base font-medium leading-7">
            {published.data.summary}
          </p>}
          <div className="whitespace-pre-wrap break-words text-sm leading-7">
            {published.data.body}
          </div>
        </article> : <p className="border-b border-border py-5 text-sm text-muted-foreground">
          No official minutes have been published for this session.
        </p>}
    </section>

    <section aria-labelledby="minutes-office-heading" className="space-y-4 border-t border-border pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="minutes-office-heading" className="flex items-center gap-2 text-lg font-semibold">
            <LockKeyhole className="size-5" aria-hidden="true" /> Institutional workspace
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Draft, review and publication actions require server-verified scope.
          </p>
        </div>
        {!showManager && <button type="button" className="min-h-11 rounded-xl border px-4 text-sm font-semibold"
          onClick={() => setShowManager(true)}>Open authorized workspace</button>}
      </div>
      {showManager && (!actorId ? <p role="status">Sign in to open the restricted institutional workspace.</p> : management.isPending ? <p role="status">Checking institutional access…</p> :
        management.isError || !state ? <div role="alert" className="space-y-3 rounded-xl border p-4">
          <p>Private minutes are unavailable. Your authority may have changed, or the meeting may be restricted.</p>
          <button type="button" className="min-h-11 rounded-lg border px-4"
            onClick={() => void management.refetch()}>Retry authorized read</button>
        </div> : <div className="space-y-5">
          <p className="text-sm text-muted-foreground">
            {state.title} · Session {state.sessionStatus} · Minutes {state.status.replace("_"," ")}
            {" · "}Revision {state.revision ?? "new"}
          </p>
          {error && <p role="alert" className="rounded-lg border border-destructive/50 p-3 text-sm">{error}</p>}
          {receipt && <p role="status" className="flex flex-wrap items-center gap-2 text-sm">
            <ShieldCheck className="size-5" aria-hidden="true" />
            Verified {receipt.status} receipt <code className="break-all">{receipt.operationId}</code>
            {" · "}Revision {receipt.revision}
          </p>}
          {retry.current && <div className="space-y-3 rounded-xl border p-4">
            <h3 className="font-semibold">Submission outcome uncertain</h3>
            <p className="text-sm">Do not create another operation. Retry the exact original idempotency identity.</p>
            <button type="button" disabled={busy} className="min-h-11 rounded-lg border px-4"
              onClick={() => void execute(retry.current!)}>Retry exact operation</button>
          </div>}
          <div className="space-y-4">
            <label className="block space-y-2 text-sm font-semibold">
              <span>Official summary (maximum 1,200 characters)</span>
              <textarea value={summary} maxLength={1200} rows={2}
                disabled={!mayEdit || busy || !!pending || !!retry.current}
                onChange={(event) => { setSummary(event.target.value); setDirty(true); setPending(null); }}
                className="w-full rounded-xl border border-border bg-background p-3 font-normal" />
            </label>
            <label className="block space-y-2 text-sm font-semibold">
              <span>Meeting minutes (maximum 20,000 characters)</span>
              <textarea value={body} maxLength={20000} rows={12}
                disabled={!mayEdit || busy || !!pending || !!retry.current}
                onChange={(event) => { setBody(event.target.value); setDirty(true); setPending(null); }}
                className="w-full rounded-xl border border-border bg-background p-3 font-normal leading-6" />
            </label>
          </div>
          {!mayEdit && <p role="status" className="text-sm text-muted-foreground">
            The current session or your capability does not permit draft changes.
          </p>}
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={!mayEdit || busy || !!pending || !!retry.current}
              onClick={() => prepare("save")}
              className="min-h-11 rounded-xl border px-4 text-sm font-semibold disabled:opacity-40">
              Save private draft
            </button>
            <button type="button" disabled={!maySubmit || busy || !!pending || !!retry.current}
              onClick={() => prepare("submit")}
              className="min-h-11 rounded-xl border px-4 text-sm font-semibold disabled:opacity-40">
              Submit for review
            </button>
            <button type="button" disabled={!mayPublish || busy || !!pending || !!retry.current}
              onClick={() => prepare("publish")}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold disabled:opacity-40">
              <FileCheck2 className="size-4" aria-hidden="true" /> Publish official minutes
            </button>
          </div>
          {dirty && <p className="text-xs text-muted-foreground">
            Unsaved changes must be saved before review or publication.
          </p>}
          {state.status === "in_review" && state.sessionStatus !== "concluded" &&
            <p className="text-xs text-muted-foreground">
              Publishing becomes available only after the meeting is formally concluded.
            </p>}
          {pending && !retry.current && <section className="space-y-3 rounded-xl border p-4"
            aria-label="Review institutional operation">
            <h3 className="font-semibold">Confirm official operation</h3>
            <p className="text-sm leading-6">{pending.label}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => void execute(pending)}
                className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">
                Confirm operation
              </button>
              <button type="button" disabled={busy} onClick={() => setPending(null)}
                className="min-h-11 rounded-lg border px-4 text-sm font-semibold">Cancel</button>
            </div>
          </section>}
        </div>)}
    </section>
  </main>;
}
