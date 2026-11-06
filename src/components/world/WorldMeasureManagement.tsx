import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ClipboardCheck, FileClock, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  getWorldMeasureManager, isWorldUuid, resubmitWorldMeasure, reviewWorldMeasure,
  type WorldMeasureReceipt, type WorldMeasureRevisionInput,
} from "@/lib/world-measure-commands";
import { getWorldMeasurePermissions } from "@/lib/world-measure-permissions";

type ReviewAction = WorldMeasureRevisionInput & {
  type: "review"; targetState: "procedural_review" | "needs_correction" | "registered";
  identifier: string; proceduralNote: string;
};
type CorrectionAction = WorldMeasureRevisionInput & {
  type: "correction"; title: string; fullText: string; summary: string;
};
type PendingAction = ReviewAction | CorrectionAction;

function message(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    switch (String(error.code)) {
      case "42501": return "Institutional authority was denied. Reauthenticate or ask the institution to verify your delegated permission.";
      case "40001": return "This measure was updated by another participant. Refresh its latest revision before acting.";
      case "23514": return "The current state or membership no longer allows this operation.";
      case "22023": return "The procedural fields or proposed text did not pass server validation.";
      case "25006": return "The platform temporarily blocks this official action.";
    }
  }
  return "The operation may have completed. Retain and retry the SAME operation to reconcile its receipt.";
}
function rejected(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error &&
    ["42501", "40001", "23514", "22023", "25006"].includes(String(error.code)));
}
export function WorldMeasureManagement({ measureId }: { measureId: string }) {
  const cache = useQueryClient();
  const [actor, setActor] = useState<string | null>(null);
  const [actorResolved, setActorResolved] = useState(false);
  const [state, setState] = useState<"procedural_review" | "needs_correction" | "registered">("procedural_review");
  const [identifier, setIdentifier] = useState("");
  const [note, setNote] = useState("");
  const [title, setTitle] = useState("");
  const [fullText, setFullText] = useState("");
  const [summary, setSummary] = useState("");
  const [editingVersion, setEditingVersion] = useState("");
  const [review, setReview] = useState<PendingAction | null>(null);
  const uncertain = useRef<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<WorldMeasureReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    let version = 0;
    const apply = (userId: string | null) => {
      if (!live) return;
      cache.removeQueries({ queryKey: ["world", "measures", "manager"] });
      cache.removeQueries({ queryKey: ["world", "measures", "permissions"] });
      uncertain.current = null;
      setReview(null);
      setReceipt(null);
      setActor(userId);
      setActorResolved(true);
    };
    void supabase.auth.getUser().then(({ data, error: authError }) => {
      if (version === 0) apply(authError ? null : (data.user?.id ?? null));
    }).catch(() => { if (version === 0) apply(null); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      ++version;
      apply(session?.user.id ?? null);
    });
    return () => { live = false; subscription.unsubscribe(); };
  }, [cache]);

  const manager = useQuery({
    queryKey: ["world", "measures", "manager", actor, measureId],
    queryFn: () => getWorldMeasureManager(measureId),
    enabled: Boolean(actor) && isWorldUuid(measureId),
    staleTime: 0, gcTime: 0, refetchOnMount: "always", retry: false,
  });
  const measure = !manager.isError ? manager.data : undefined;
  const permissions = useQuery({
    queryKey: ["world", "measures", "permissions", actor, measureId, measure?.revision],
    queryFn: () => getWorldMeasurePermissions(measure!),
    enabled: Boolean(actor && measure), staleTime: 0, gcTime: 0, retry: false,
  });
  const canSubmit = permissions.data?.canSubmit === true;
  const canReview = permissions.data?.canReview === true;
  const version = measure?.versions[0];
  const correctionAllowed = canSubmit && measure?.state === "needs_correction";
  const reviewAllowed = canReview && ["submitted", "procedural_review"].includes(measure?.state ?? "");
  const allowedDecisions = measure?.state === "submitted"
    ? ["procedural_review", "needs_correction"]
    : ["registered", "needs_correction"];
  const decision = allowedDecisions.includes(state) ? state : allowedDecisions[0];
  const frozen = busy || Boolean(review) || Boolean(uncertain.current);
  // A fresh authoritative revision supersedes the local edit form. Never
  // silently carry an older draft over a newly returned measure version.
  function setCorrectionFromCurrent() {
    if (!version || !measure || frozen) return;
    setTitle(version.title);
    setFullText(version.text);
    setSummary(version.summary ?? "");
    setEditingVersion(version.id);
    setReceipt(null);
  }
  function prepareReview(event: FormEvent) {
    event.preventDefault();
    if (!measure || !reviewAllowed || frozen || permissions.isError) return;
    if (decision === "registered" && measure.state !== "procedural_review") {
      setError("Start procedural review before registering a measure."); return;
    }
    if (decision === "needs_correction" && (note.trim().length < 8 || note.length > 500)) {
      setError("Give a procedural reason between 8 and 500 characters."); return;
    }
    if (decision === "registered" && (!identifier.trim() || identifier.trim().length > 160)) {
      setError("Specify the official institution-approved identifier."); return;
    }
    setError(null);
    setReview({ type: "review", measureId: measure.id, expectedRevision: measure.revision,
      targetState: decision as ReviewAction["targetState"], identifier, proceduralNote: note, operationId: crypto.randomUUID() });
  }
  function prepareCorrection(event: FormEvent) {
    event.preventDefault();
    if (!measure || !correctionAllowed || frozen || !version || editingVersion !== version.id) {
      setError("Reload the current official version before correcting the measure."); return;
    }
    if (!title.trim() || title.trim().length > 180 || !fullText.trim() ||
        fullText.trim().length > 25000 || summary.length > 2000) {
      setError("Correct the title or full text within the permitted length."); return;
    }
    setError(null);
    setReview({ type: "correction", measureId: measure.id, expectedRevision: measure.revision,
      title, fullText, summary, operationId: crypto.randomUUID() });
  }
  async function execute(action: PendingAction) {
    if (busy) return;
    uncertain.current = action;
    setBusy(true);
    setReview(null);
    setError(null);
    try {
      const next = action.type === "review"
        ? await reviewWorldMeasure(action)
        : await resubmitWorldMeasure(action);
      setReceipt(next);
      uncertain.current = null;
      setEditingVersion("");
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["world", "measures", "manager", actor, measureId] }),
        cache.invalidateQueries({ queryKey: ["world", "measures", "public"] }),
        cache.invalidateQueries({ queryKey: ["world", "measures", "public-detail", measureId] }),
      ]);
    } catch (cause) {
      setError(message(cause));
      if (rejected(cause)) {
        uncertain.current = null;
        await cache.invalidateQueries({ queryKey: ["world", "measures", "manager", actor, measureId] });
      }
    } finally { setBusy(false); }
  }

  return <main className="mx-auto w-full max-w-4xl px-4 pb-28 pt-5 sm:px-6 sm:pt-9">
    <Link to="/world/measures" className="inline-flex min-h-11 items-center gap-2 text-sm">
      <ArrowLeft className="size-4" /> Public measures
    </Link>
    <p className="mt-5 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
      Private institutional workspace
    </p>
    <h1 className="mt-2 text-3xl font-semibold">Submission review and revisions</h1>
    {!isWorldUuid(measureId) ? <p role="alert" className="mt-6">This measure link is invalid.</p> :
      !actorResolved ? <p role="status" className="mt-6">Verifying your session…</p> :
      !actor ? <p role="status" className="mt-6">Sign in to an authorized institutional account to access this record.</p> :
      manager.isPending ? <p role="status" className="mt-6">Verifying private measure access…</p> :
      manager.isError || !measure ? <section role="alert" className="mt-6">
        <h2 className="font-semibold">This private record is not available to this account</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Your permission may have expired, or the record may no longer be accessible.
        </p>
        <button type="button" onClick={() => void manager.refetch()}
          className="mt-4 min-h-11 rounded-lg border px-4 text-sm">Recheck access</button>
      </section> : <>
        <div className="mt-6 border-b border-border pb-6">
          <p className="text-xs text-muted-foreground">Measure {measure.identifier ?? "awaiting registration"}</p>
          <h2 className="mt-2 text-xl font-semibold">{version?.title ?? "Institutional measure"}</h2>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border px-3 py-1 capitalize">{measure.state.replaceAll("_", " ")}</span>
            <span className="rounded-full border px-3 py-1">Revision {measure.revision}</span>
            <span className="rounded-full border px-3 py-1">Visibility: {measure.visibility}</span>
          </div>
          {measure.proceduralNote ? <p className="mt-4 whitespace-pre-wrap border-l-2 pl-4 text-sm">
            Procedural note: {measure.proceduralNote}
          </p> : null}
          {measure.identifier ? <Link to="/world/measures/$measureId"
            params={{ measureId }} className="mt-4 inline-flex min-h-11 items-center text-sm underline">
            View published version (if released)
          </Link> : null}
        </div>
        {permissions.isPending ? <p role="status" className="mt-5">Checking scoped submission and review authority…</p> :
          permissions.isError ? <p role="alert" className="mt-5">
            Action permissions could not be verified.
            <button type="button" className="ml-2 underline"
              onClick={() => void permissions.refetch()}>Retry</button>
          </p> : null}
        {receipt ? <section role="status" className="mt-6 border-l-2 border-primary pl-4">
          <h3 className="flex items-center gap-2 font-semibold"><ClipboardCheck className="size-4" />
            Official operation confirmed</h3>
          <p className="mt-2 text-sm">Current resulting state: {receipt.state};
            revision {receipt.revision}{receipt.replayed ? " (reconciled)" : ""}.
          </p>
          <p className="mt-2 break-all font-mono text-xs">Operation ID: {receipt.operationId}</p>
        </section> : null}
        {error ? <p role="alert" className="mt-6 rounded-lg border border-destructive/50 p-4 text-sm">
          {error}
        </p> : null}
        {uncertain.current && <section role="alert" className="mt-6 rounded-lg border p-4">
          <p className="flex items-center gap-2 font-semibold">
            <ShieldAlert className="size-4" /> Do not submit a second operation
          </p>
          <p className="mt-2 text-sm">The server acknowledgement is uncertain. The exact operation and
            expected revision have been preserved.</p>
          <code className="mt-2 block break-all text-xs">{uncertain.current.operationId}</code>
          <button type="button" disabled={busy} onClick={() => void execute(uncertain.current!)}
            className="mt-4 min-h-11 rounded-lg border px-4 text-sm">Reconcile same operation</button>
        </section>}
        {review && <section className="mt-6 rounded-lg border border-primary/40 p-5" aria-label="Confirm governed operation">
          <h3 className="font-semibold">Confirm official {review.type === "correction" ? "text correction" : "procedural decision"}</h3>
          <p className="mt-2 text-sm">
            Revision {review.expectedRevision} ·
            {review.type === "review" ? " " + review.targetState.replaceAll("_", " ") :
              " a new immutable text version"}.
          </p>
          <code className="mt-2 block break-all text-xs">{review.operationId}</code>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => void execute(review)}
              className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">
              Confirm and record
            </button>
            <button type="button" disabled={busy} onClick={() => setReview(null)}
              className="min-h-11 rounded-lg border px-4 text-sm">Cancel</button>
          </div>
        </section>}
        {reviewAllowed && <section className="mt-9 border-t border-border pt-6">
          <h3 className="text-lg font-semibold">Procedural review</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Procedural review addresses technical validity, not political content.
            Registration publishes the current version and freezes its identifier.
          </p>
          <form onSubmit={prepareReview} className="mt-4 space-y-4">
            <label className="block text-sm font-medium">Decision
              <select value={decision} disabled={frozen} onChange={(e) =>
                setState(e.target.value as ReviewAction["targetState"])}
                className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3">
                {measure.state === "submitted" && <option value="procedural_review">Begin review</option>}
                <option value="needs_correction">Return for technical correction</option>
                {measure.state === "procedural_review" &&
                  <option value="registered">Register and publish</option>}
              </select>
            </label>
            {decision === "registered" && <label className="block text-sm font-medium">
              Institution-approved permanent identifier
              <input disabled={frozen} value={identifier} maxLength={160}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="GAG.Year.Sequence.CountryCode.TopicCode.ShortTitle"
                className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3" />
            </label>}
            <label className="block text-sm font-medium">
              Procedural reason {decision === "needs_correction" ? "(required)" : "(optional)"}
              <textarea disabled={frozen} value={note} onChange={(e) => setNote(e.target.value)}
                maxLength={500} rows={3} className="mt-2 w-full rounded-lg border bg-background p-3" />
            </label>
            <button type="submit" disabled={frozen || permissions.isError}
              className="min-h-11 rounded-lg border px-5 text-sm font-semibold">Review decision</button>
          </form>
        </section>}
        {correctionAllowed && <section className="mt-9 border-t border-border pt-6">
          <h3 className="text-lg font-semibold">Submit corrected version</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Existing text and previous procedural notes remain immutable. Start from
            the latest saved version and submit a new version for review.
          </p>
          {editingVersion !== version?.id ? <button type="button" disabled={frozen}
            onClick={setCorrectionFromCurrent} className="mt-4 min-h-11 rounded-lg border px-4 text-sm">
            Edit latest version
          </button> : <form className="mt-4 space-y-4" onSubmit={prepareCorrection}>
            <label className="block text-sm font-medium">Corrected title
              <input value={title} onChange={(e) => setTitle(e.target.value)}
                maxLength={180} required disabled={frozen}
                className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3" />
            </label>
            <label className="block text-sm font-medium">Summary
              <textarea value={summary} onChange={(e) => setSummary(e.target.value)}
                maxLength={2000} rows={3} disabled={frozen}
                className="mt-2 w-full rounded-lg border bg-background p-3" />
            </label>
            <label className="block text-sm font-medium">Corrected text
              <textarea value={fullText} onChange={(e) => setFullText(e.target.value)}
                maxLength={25000} rows={12} required disabled={frozen}
                className="mt-2 w-full rounded-lg border bg-background p-3" />
            </label>
            <button type="submit" disabled={frozen}
              className="min-h-11 rounded-lg border px-5 text-sm font-semibold">
              Review corrected version
            </button>
          </form>}
        </section>}
        <section className="mt-9 border-t border-border pt-6">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <FileClock className="size-5" /> Version and procedural history
          </h3>
          <ol className="mt-3 divide-y divide-border text-sm">
            {measure.versions.map((v) => <li key={v.id} className="py-4">
              <p className="font-semibold">Version {v.number} · {v.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{v.publicationState} · {v.createdAt.slice(0, 10)}</p>
              <details className="mt-2">
                <summary className="cursor-pointer font-medium">Read this historical text</summary>
                <p className="mt-3 whitespace-pre-wrap break-words leading-6">{v.text}</p>
              </details>
            </li>)}
          </ol>
          {measure.versionsTruncated && <p className="mt-2 text-xs text-muted-foreground">
            Only 20 latest versions are shown. Older immutable history remains stored.
          </p>}
          <h4 className="mt-6 font-semibold">Procedural decisions</h4>
          <ol className="mt-2 divide-y divide-border text-sm">
            {measure.reviews.map((entry, i) => <li key={entry.createdAt + ":" + i} className="py-3">
              <p className="font-medium capitalize">{entry.action.replaceAll("_", " ")} · revision {entry.revision}</p>
              {entry.note && <p className="mt-1 whitespace-pre-wrap">{entry.note}</p>}
              <p className="mt-1 text-xs text-muted-foreground">{entry.createdAt}</p>
            </li>)}
          </ol>
          {measure.reviewsTruncated && <p className="text-xs text-muted-foreground">
            Older decisions remain in the append-only institutional audit.
          </p>}
        </section>
      </>}
  </main>;
}
