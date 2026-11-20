import { useEffect, useState } from "react";
import {
  getWorldProceduralDecisionHistory,
  issueWorldProceduralDecision,
  listWorldProceduralDecisions,
  type WorldIssueDecisionReceipt,
  type WorldProceduralDecision,
  type WorldProceduralDecisionHistory,
  type WorldProceduralDecisionKind,
} from "@/lib/world-procedural-decisions";

/** Read-only, published World page section. Route owner must mount under the
 * canonical WorldPublicGate, not allow it to bypass World rollout. */
export function WorldProceduralDecisions({ slug }: { slug: string }) {
  const [rows, setRows] = useState<WorldProceduralDecision[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<WorldProceduralDecisionHistory | null>(null);
  const [detailStatus, setDetailStatus] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    let live = true;
    setRows([]);
    setStatus("loading");
    setSelectedId(null);
    setDetail(null);
    void listWorldProceduralDecisions(slug)
      .then((items) => { if (live) { setRows(items); setStatus("ready"); } })
      .catch(() => { if (live) setStatus("error"); });
    return () => { live = false; };
  }, [slug,retry]);

  useEffect(() => {
    let live = true;
    setDetail(null);
    if (!selectedId) { setDetailStatus("idle"); return () => { live = false; }; }
    setDetailStatus("loading");
    void getWorldProceduralDecisionHistory(selectedId)
      .then((record) => {
        if (!live) return;
        if (!record || record.organizationSlug !== slug) {
          setDetailStatus("error"); return;
        }
        setDetail(record);
        setDetailStatus("idle");
      })
      .catch(() => { if (live) setDetailStatus("error"); });
    return () => { live = false; };
  }, [selectedId,slug,retry]);

  return (
    <section aria-label="Official executive decisions" className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <header className="mb-6 space-y-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Terra Solaris · Official record</p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Executive decisions</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Published procedural and scheduling decisions. These records do not substitute for
          legislative votes, membership actions, appointments, or Court judgments.
        </p>
      </header>
      {status === "loading" && <p role="status" className="py-9 text-muted-foreground">Loading official decisions…</p>}
      {status === "error" && (
        <div role="alert" className="space-y-3 py-6">
          <p>Executive decisions could not be verified. Nothing unpublished is shown.</p>
          <button type="button" className="min-h-11 rounded-lg border px-4"
            onClick={() => setRetry((value) => value + 1)}>Try again</button>
        </div>
      )}
      {status === "ready" && rows.length === 0 && (
        <p className="py-9 text-muted-foreground">No executive decisions have been publicly issued.</p>
      )}
      {status === "ready" && rows.length > 0 && (
        <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="divide-y" aria-label="Published executive decisions">
            {rows.map((decision) => (
              <button key={decision.id} type="button"
                aria-pressed={selectedId === decision.id}
                className={"block min-h-11 w-full py-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 " +
                  (selectedId === decision.id ? "text-primary" : "hover:text-primary")}
                onClick={() => setSelectedId((id) => id === decision.id ? null : decision.id)}
              >
                <span className="block text-xs text-muted-foreground">
                  <time dateTime={decision.publishedAt}>{new Date(decision.publishedAt).toLocaleDateString()}</time>
                  {" · "}{decision.decisionKind === "procedural" ? "Procedural" : "Scheduling"}
                  {decision.corrected ? " · Corrected" : ""}
                </span>
                <span className="mt-1 block text-base font-semibold">{decision.title}</span>
                <span className="mt-1 block break-all text-xs text-muted-foreground">{decision.identifier}</span>
                <span className="mt-2 block line-clamp-2 text-sm">{decision.excerpt}</span>
              </button>
            ))}
          </div>
          {selectedId && (
            <article className="min-w-0 border-t pt-5 lg:border-l lg:border-t-0 lg:pl-6" aria-label="Executive decision record">
              {detailStatus === "loading" && <p role="status">Loading the official record…</p>}
              {detailStatus === "error" && <p role="alert">Decision history is unavailable. Refresh to retry.</p>}
              {detail && (
                <>
                  <h2 className="text-xl font-semibold">{detail.versions[0]?.title}</h2>
                  <p className="mt-2 break-all text-xs text-muted-foreground">{detail.identifier}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Issued <time dateTime={detail.publishedAt}>{new Date(detail.publishedAt).toLocaleDateString()}</time>
                    {detail.effectiveAt && <> · Effective <time dateTime={detail.effectiveAt}>{new Date(detail.effectiveAt).toLocaleDateString()}</time></>}
                  </p>
                  {detail.versions[0]?.correctionReason && (
                    <p className="my-4 border-l-2 border-amber-500 pl-3 text-sm">
                      Official correction: {detail.versions[0].correctionReason}
                    </p>
                  )}
                  <div className="mt-6 whitespace-pre-wrap break-words leading-relaxed">{detail.versions[0]?.body}</div>
                  {detail.versions.length > 1 && (
                    <div className="mt-8 border-t pt-5">
                      <h3 className="font-semibold">Complete correction history</h3>
                      {detail.versions.map((version) => (
                        <details key={version.id} className="mt-3 rounded-lg border px-4 py-3">
                          <summary className="cursor-pointer text-sm">
                            Revision {version.revision} · {new Date(version.publishedAt).toLocaleDateString()}
                          </summary>
                          {version.correctionReason && <p className="mt-2 text-sm">Correction: {version.correctionReason}</p>}
                          <h4 className="mt-3 font-semibold">{version.title}</h4>
                          <p className="mt-2 whitespace-pre-wrap break-words text-sm">{version.body}</p>
                        </details>
                      ))}
                    </div>
                  )}
                </>
              )}
            </article>
          )}
        </div>
      )}
    </section>
  );
}

export function WorldProceduralDecisionComposer({
  organizationId, issuingOfficeId, correcting = null, onPublished,
}: {
  organizationId: string;
  issuingOfficeId: string;
  correcting?: WorldProceduralDecisionHistory | null;
  onPublished?: (receipt: WorldIssueDecisionReceipt) => void;
}) {
  const [kind, setKind] = useState<WorldProceduralDecisionKind>(correcting?.decisionKind ?? "procedural");
  const [title, setTitle] = useState(correcting?.versions[0]?.title ?? "");
  const [body, setBody] = useState(correcting?.versions[0]?.body ?? "");
  const [effective, setEffective] = useState(
    correcting?.effectiveAt ? correcting.effectiveAt.slice(0,16) : "",
  );
  const [reason, setReason] = useState("");
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<WorldIssueDecisionReceipt | null>(null);
  const [op, setOp] = useState<{operationId:string;idempotencyKey:string} | null>(null);
  const effectiveAt = effective.length > 0
    ? (Number.isFinite(Date.parse(effective + "Z")) ? new Date(effective + "Z").toISOString() : null)
    : null;
  const effectiveValid = !effective || effectiveAt !== null;
  const valid = title.trim().length > 0 && title.length <= 220 &&
    body.trim().length > 0 && body.length <= 50000 && effectiveValid &&
    (!correcting || (reason.trim().length >= 5 && reason.length <= 2000));

  const edit = () => {
    if (uncertain || busy) return;
    setReview(false); setOp(null); setError(null);
  };
  async function submit() {
    if (busy || !valid) return;
    const stable = op ?? { operationId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() };
    setOp(stable);
    setBusy(true); setError(null);
    try {
      const result = await issueWorldProceduralDecision({
        organizationId, issuingOfficeId,
        decisionId: correcting?.id ?? null,
        kind, title, body, effectiveAt,
        correctionReason: correcting ? reason : null,
        expectedRevision: correcting?.revision ?? 0,
        ...stable,
      });
      setReceipt(result); setUncertain(false); setReview(false);
      try { onPublished?.(result); } catch { /* refresh may retry separately */ }
    } catch (cause) {
      setUncertain(true); setReview(true);
      setError(cause instanceof Error ? cause.message : "Publication could not be reconciled.");
    } finally { setBusy(false); }
  }

  if (receipt) return (
    <section aria-label="Executive decision receipt" role="status" className="space-y-2 rounded-xl border p-5">
      <h2 className="text-lg font-semibold">Official decision issued</h2>
      <p className="break-all text-sm">{receipt.identifier}</p>
      <p className="text-sm">Revision {receipt.revision} · Operation {receipt.operationId}</p>
    </section>
  );

  return (
    <section aria-label="Issue executive decision" className="max-w-2xl space-y-4">
      <h2 className="text-xl font-semibold">
        {correcting ? "Correct an executive decision" : "Issue an executive decision"}
      </h2>
      <p className="text-sm text-muted-foreground">
        For current authorized officeholders only. This records procedural or scheduling
        decisions and does not itself enact legislation or appointments.
      </p>
      <label className="block text-sm font-medium">Decision type
        <select disabled={busy || review || Boolean(correcting)} value={kind}
          className="mt-2 block min-h-11 w-full rounded-lg border bg-background p-3"
          onChange={(event) => { setKind(event.target.value as WorldProceduralDecisionKind); edit(); }}>
          <option value="procedural">Procedural</option>
          <option value="scheduling">Scheduling</option>
        </select>
      </label>
      <label className="block text-sm font-medium">Official title
        <input className="mt-2 block min-h-11 w-full rounded-lg border bg-background p-3"
          maxLength={220} disabled={busy || review}
          value={title} onChange={(event) => { setTitle(event.target.value); edit(); }} />
      </label>
      <label className="block text-sm font-medium">Decision text
        <textarea className="mt-2 block min-h-40 w-full rounded-lg border bg-background p-3"
          maxLength={50000} disabled={busy || review}
          value={body} onChange={(event) => { setBody(event.target.value); edit(); }} />
      </label>
      <label className="block text-sm font-medium">Effective instant (UTC, optional)
        <input type="datetime-local" className="mt-2 block min-h-11 w-full rounded-lg border bg-background p-3"
          disabled={busy || review || Boolean(correcting)}
          value={effective} onChange={(event) => { setEffective(event.target.value); edit(); }} />
      </label>
      {correcting && <label className="block text-sm font-medium">Public reason for correction
        <textarea className="mt-2 block w-full rounded-lg border bg-background p-3"
          maxLength={2000} disabled={busy || review}
          value={reason} onChange={(event) => { setReason(event.target.value); edit(); }} />
      </label>}
      {!review ? (
        <button type="button" disabled={!valid || busy}
          className="min-h-11 rounded-lg border px-5 disabled:opacity-60"
          onClick={() => setReview(true)}>Review decision</button>
      ) : (
        <section className="space-y-3 rounded-xl border p-4" aria-label="Final publication review">
          <p className="text-sm font-semibold">Immediately public, immutable official decision</p>
          <p className="text-xs text-muted-foreground">Organization: {organizationId}</p>
          <p className="text-xs text-muted-foreground">Issuing office: {issuingOfficeId}</p>
          <p className="text-sm">Type: {kind}{effectiveAt ? " · Effective (UTC) " + effectiveAt : ""}</p>
          <h3 className="font-semibold">{title}</h3>
          <p className="max-h-52 overflow-y-auto whitespace-pre-wrap break-words text-sm">{body}</p>
          {correcting && <p className="text-sm">Correction reason: {reason}. Prior version remains archived.</p>}
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={busy || uncertain}
              onClick={() => setReview(false)} className="min-h-11 rounded-lg border px-5">Edit</button>
            <button type="button" disabled={busy}
              onClick={() => void submit()} className="min-h-11 rounded-lg bg-primary px-5 text-primary-foreground">
              {busy ? "Publishing…" : uncertain ? "Retry same operation" : "Confirm publication"}
            </button>
          </div>
        </section>
      )}
      {error && <p role="alert" className="text-sm text-destructive">
        {error} The result may be uncertain. Editing is locked until the identical operation is reconciled.
      </p>}
    </section>
  );
}
