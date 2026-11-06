import { useEffect, useState } from "react";
import {
  getWorldOfficialStatementHistory,
  issueWorldOfficialStatement,
  listWorldOfficialStatements,
  type WorldIssueStatementReceipt,
  type WorldOfficialStatement,
  type WorldOfficialStatementHistory,
} from "@/lib/world-official-statements";

/** Read-only public TG9 surface. Parent World route must still use WorldPublicGate. */
export function WorldOfficialStatements({ slug }: { slug: string }) {
  const [rows, setRows] = useState<WorldOfficialStatement[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [history, setHistory] = useState<WorldOfficialStatementHistory | null>(null);
  const [historyStatus, setHistoryStatus] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    let current = true;
    setRows([]);
    setSelected(null);
    setHistory(null);
    setStatus("loading");
    void listWorldOfficialStatements(slug)
      .then((results) => { if (current) { setRows(results); setStatus("ready"); } })
      .catch(() => { if (current) setStatus("error"); });
    return () => { current = false; };
  }, [slug, retry]);

  useEffect(() => {
    let current = true;
    if (!selected) {
      setHistory(null);
      setHistoryStatus("idle");
      return () => { current = false; };
    }
    setHistory(null);
    setHistoryStatus("loading");
    void getWorldOfficialStatementHistory(selected)
      .then((detail) => {
        if (!current) return;
        if (detail && detail.organizationSlug === slug) {
          setHistory(detail);
          setHistoryStatus("idle");
        } else {
          setHistoryStatus("error");
        }
      })
      .catch(() => { if (current) setHistoryStatus("error"); });
    return () => { current = false; };
  }, [selected, slug, retry]);

  return (
    <section aria-label="Official statements" className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <header className="mb-5">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Terra Solaris · Official record</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Institutional statements</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Published statements and their complete correction history. Earlier published versions are preserved.
        </p>
      </header>
      {status === "loading" && <p role="status" className="py-10 text-muted-foreground">Loading published statements…</p>}
      {status === "error" && (
        <div role="alert" className="space-y-3 py-6">
          <p>Official statements are unavailable. No unpublished material is displayed.</p>
          <button type="button" className="rounded-lg border px-4 py-3" onClick={() => setRetry((n) => n + 1)}>Try again</button>
        </div>
      )}
      {status === "ready" && rows.length === 0 && (
        <p className="py-10 text-muted-foreground">No public statements have been published by this institution.</p>
      )}
      {status === "ready" && rows.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="divide-y" aria-label="Statement list">
            {rows.map((row) => (
              <button
                key={row.id} type="button" aria-pressed={selected === row.id}
                className={"block w-full py-4 text-left transition-colors hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 " +
                  (selected === row.id ? "text-primary" : "")}
                onClick={() => setSelected(row.id === selected ? null : row.id)}
              >
                <span className="block text-xs text-muted-foreground">
                  <time dateTime={row.publishedAt}>{new Date(row.publishedAt).toLocaleDateString()}</time>
                  {row.revision > 1 ? " · Corrected" : ""}
                </span>
                <span className="mt-1 block text-base font-semibold">{row.title}</span>
                <span className="mt-1 block line-clamp-2 text-sm text-muted-foreground">{row.body}</span>
                <span className="mt-2 block text-xs underline">Read statement and versions</span>
              </button>
            ))}
          </div>
          {selected && (
            <article className="min-w-0 border-t pt-5 lg:border-l lg:border-t-0 lg:pl-6" aria-label="Statement history">
              {historyStatus === "loading" && <p role="status">Loading the official record…</p>}
              {historyStatus === "error" && <p role="alert">This statement's history is unavailable. Please retry.</p>}
              {history && (
                <>
                  <h2 className="text-xl font-semibold">{history.versions[0]?.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {history.organizationName} · published <time dateTime={history.publishedAt}>
                      {new Date(history.publishedAt).toLocaleDateString()}</time>
                  </p>
                  {history.versions[0]?.correctionReason && (
                    <p className="my-4 border-l-2 border-amber-500 pl-3 text-sm">
                      Corrected official record: {history.versions[0].correctionReason}
                    </p>
                  )}
                  <div className="mt-5 whitespace-pre-wrap break-words text-base leading-relaxed">{history.versions[0]?.body}</div>
                  {history.versions.length > 1 && (
                    <section className="mt-8 border-t pt-5" aria-label="Earlier versions">
                      <h3 className="text-base font-semibold">Published version history</h3>
                      <div className="mt-3 space-y-3">
                        {history.versions.map((v) => (
                          <details key={v.id} className="rounded-lg border px-4 py-3">
                            <summary className="cursor-pointer text-sm font-medium">
                              Version {v.revision} · {new Date(v.publishedAt).toLocaleDateString()}
                              {v.revision === history.revision ? " · current" : ""}
                            </summary>
                            {v.correctionReason && <p className="mt-2 text-sm">Correction reason: {v.correctionReason}</p>}
                            <h4 className="mt-3 font-semibold">{v.title}</h4>
                            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">{v.body}</p>
                          </details>
                        ))}
                      </div>
                    </section>
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

/**
 * Write surface for a separately authorized institutional workspace.
 * Caller supplies an already-scoped organization and optional office. The
 * PostgreSQL command always independently checks current actor capabilities,
 * term validity, revision, operation identity and actual publishability.
 */
export function WorldStatementComposer({
  organizationId, issuingOfficeId = null, correcting = null, onPublished,
}: {
  organizationId: string;
  issuingOfficeId?: string | null;
  correcting?: WorldOfficialStatement | null;
  onPublished?: (receipt: WorldIssueStatementReceipt) => void;
}) {
  const [title, setTitle] = useState(correcting?.title ?? "");
  const [body, setBody] = useState(correcting?.body ?? "");
  const [reason, setReason] = useState("");
  const [review, setReview] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<WorldIssueStatementReceipt | null>(null);
  const [identity, setIdentity] = useState<{ operationId: string; idempotencyKey: string } | null>(null);

  const resetDraft = () => {
    setReview(false);
    setIdentity(null);
    setError(null);
    setReceipt(null);
  };
  const valid = title.trim().length > 0 && title.length <= 220 &&
    body.trim().length > 0 && body.length <= 50000 &&
    (!correcting || (reason.trim().length >= 5 && reason.length <= 2000));

  async function publish() {
    if (!valid || pending) return;
    const stableIdentity = identity ?? {
      operationId: crypto.randomUUID(),
      idempotencyKey: crypto.randomUUID(),
    };
    setIdentity(stableIdentity);
    setPending(true);
    setError(null);
    try {
      const result = await issueWorldOfficialStatement({
        organizationId, statementId: correcting?.id ?? null, issuingOfficeId,
        title, body, correctionReason: correcting ? reason : null,
        expectedRevision: correcting?.revision ?? 0,
        ...stableIdentity,
      });
      setReceipt(result);
      setReview(false);
      onPublished?.(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Publication was not confirmed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-2xl space-y-4" aria-label={correcting ? "Correct statement" : "Publish statement"}>
      <h2 className="text-xl font-semibold">{correcting ? "Publish a correction" : "Publish an official statement"}</h2>
      {receipt ? (
        <div role="status" className="rounded-lg border p-4">
          <p className="font-semibold">Official publication confirmed</p>
          <p className="mt-2 break-all text-xs">Operation: {receipt.operationId}</p>
          <p className="text-sm">Statement revision {receipt.revision} recorded.</p>
        </div>
      ) : (
        <>
          <label className="block text-sm font-medium">Title
            <input className="mt-1 block w-full rounded-lg border bg-background p-3" maxLength={220}
              value={title} disabled={pending || review} onChange={(e) => { setTitle(e.target.value); resetDraft(); }} />
          </label>
          <label className="block text-sm font-medium">Official text
            <textarea className="mt-1 block min-h-40 w-full rounded-lg border bg-background p-3"
              maxLength={50000} value={body} disabled={pending || review}
              onChange={(e) => { setBody(e.target.value); resetDraft(); }} />
          </label>
          {correcting && <label className="block text-sm font-medium">Reason for correction (published)
            <textarea className="mt-1 block w-full rounded-lg border bg-background p-3"
              maxLength={2000} value={reason} disabled={pending || review}
              onChange={(e) => { setReason(e.target.value); resetDraft(); }} />
          </label>}
          {!review ? (
            <button type="button" disabled={!valid || pending} className="rounded-lg border px-5 py-3 disabled:opacity-50"
              onClick={() => setReview(true)}>Review publication</button>
          ) : (
            <div className="space-y-3 rounded-lg border p-4">
              <p className="text-sm font-semibold">Official, immediately public publication</p>
              <p className="text-sm">Institution: {organizationId}</p>
              {correcting && <p className="text-sm">Replacing displayed version {correcting.revision}; earlier versions remain readable.</p>}
              <h3 className="font-semibold">{title}</h3>
              <p className="max-h-52 overflow-y-auto whitespace-pre-wrap break-words text-sm">{body}</p>
              {correcting && <p className="text-sm">Correction reason: {reason}</p>}
              <div className="flex flex-wrap gap-3">
                <button type="button" disabled={pending} className="rounded-lg border px-5 py-3"
                  onClick={() => setReview(false)}>Edit</button>
                <button type="button" disabled={pending} className="rounded-lg bg-primary px-5 py-3 text-primary-foreground disabled:opacity-50"
                  onClick={() => void publish()}>{pending ? "Publishing…" : "Confirm official publication"}</button>
              </div>
            </div>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error} The operation identity is preserved for a safe retry.</p>}
        </>
      )}
    </section>
  );
}
