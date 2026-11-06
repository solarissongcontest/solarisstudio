import { useEffect, useState } from "react";
import {
  getWorldCertifiedResolution,
  getWorldResolutionCandidate,
  listWorldCertifiedResolutions,
  materializeWorldCertifiedResolution,
  type WorldCertifiedResolution,
  type WorldCertifiedResolutionDetail,
  type WorldResolutionCandidate,
  type WorldResolutionReceipt,
} from "@/lib/world-certified-resolutions";

/** Public surface intended for WORLD-00's organization route after rollout. */
export function WorldCertifiedResolutions({ slug }: { slug: string }) {
  const [list, setList] = useState<WorldCertifiedResolution[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<WorldCertifiedResolutionDetail | null>(null);
  const [detailStatus, setDetailStatus] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    let active = true;
    setStatus("loading");
    setList([]);
    setSelected(null);
    setDetail(null);
    void listWorldCertifiedResolutions(slug)
      .then((rows) => { if (active) { setList(rows); setStatus("ready"); } })
      .catch(() => { if (active) setStatus("error"); });
    return () => { active = false; };
  }, [slug, retry]);

  useEffect(() => {
    let active = true;
    setDetail(null);
    if (!selected) { setDetailStatus("idle"); return () => { active = false; }; }
    setDetailStatus("loading");
    void getWorldCertifiedResolution(selected)
      .then((row) => {
        if (!active) return;
        if (!row || row.organizationSlug !== slug) setDetailStatus("error");
        else { setDetail(row); setDetailStatus("idle"); }
      })
      .catch(() => { if (active) setDetailStatus("error"); });
    return () => { active = false; };
  }, [slug, selected, retry]);

  return <section aria-label="Adopted resolutions" className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
    <header className="mb-6">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">Terra Solaris · Official record</p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Adopted resolutions</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Formal measures adopted by certified institutional votes. Source measures and result hashes remain linked to the official record.
      </p>
    </header>
    {status === "loading" && <p role="status" className="py-8">Loading published resolutions…</p>}
    {status === "error" && <div role="alert" className="space-y-3 py-8">
      <p>The official record could not be verified.</p>
      <button type="button" className="min-h-11 rounded-xl border px-4"
        onClick={() => setRetry((n) => n + 1)}>Try again</button>
    </div>}
    {status === "ready" && list.length === 0 &&
      <p className="py-8 text-sm text-muted-foreground">No certified resolutions have been published by this institution.</p>}
    {status === "ready" && list.length > 0 &&
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="divide-y">
          {list.map((resolution) =>
            <button type="button" key={resolution.id} aria-pressed={selected === resolution.id}
              className="block min-h-20 w-full py-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              onClick={() => setSelected(selected === resolution.id ? null : resolution.id)}>
              <span className="block text-xs text-muted-foreground">
                {resolution.identifier} · <time dateTime={resolution.adoptedAt}>
                  {new Date(resolution.adoptedAt).toLocaleDateString()}</time>
              </span>
              <span className="mt-1 block text-base font-semibold">{resolution.title}</span>
              <span className="mt-1 block text-xs text-muted-foreground">Certified vote · {resolution.status}</span>
            </button>
          )}
        </div>
        {selected && <article aria-label="Resolution official text"
          className="min-w-0 border-t pt-5 lg:border-l lg:border-t-0 lg:pl-6">
          {detailStatus === "loading" && <p role="status">Loading official resolution text…</p>}
          {detailStatus === "error" && <p role="alert">Official resolution details are unavailable.</p>}
          {detail && <>
            <p className="text-xs font-semibold uppercase tracking-widest">{detail.identifier}</p>
            <h2 className="mt-2 text-xl font-bold">{detail.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">Adopted on
              {" "}<time dateTime={detail.adoptedAt}>
                {new Date(detail.adoptedAt).toLocaleDateString()}</time>
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Status: {detail.status}. {detail.effectiveAt === null ? "No effective date has been recorded." :
                "Effective from " + new Date(detail.effectiveAt).toLocaleDateString()}
            </p>
            <div className="mt-5 whitespace-pre-wrap break-words text-base leading-relaxed">{detail.text}</div>
            <details className="mt-8 border-t pt-4 text-xs">
              <summary className="min-h-11 cursor-pointer text-sm font-medium">Source and certification</summary>
              <dl className="mt-3 space-y-2 break-all">
                <dt className="font-semibold">Source measure</dt><dd>{detail.sourceMeasureId}</dd>
                <dt className="font-semibold">Adopted text version</dt><dd>{detail.adoptedVersionId}</dd>
                <dt className="font-semibold">Certified vote</dt><dd>{detail.voteId}</dd>
                <dt className="font-semibold">Result hash</dt><dd>{detail.resultHash}</dd>
              </dl>
            </details>
          </>}
        </article>}
      </div>}
  </section>;
}

/**
 * TG9 sanctioned publication. The authoritative preview comes from the
 * frozen, published TG7 text and TG8 certified result. No editable adoption
 * title/text, outcome or effective date fields exist in the browser.
 */
export function WorldResolutionPublicationReview({
  voteId, onPublished,
}: {
  voteId: string;
  onPublished?: (receipt: WorldResolutionReceipt) => void;
}) {
  const [candidate, setCandidate] = useState<WorldResolutionCandidate | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "none" | "error">("loading");
  const [retry, setRetry] = useState(0);
  const [review, setReview] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<WorldResolutionReceipt | null>(null);
  const [operation, setOperation] = useState<{ operationId: string; idempotencyKey: string } | null>(null);

  useEffect(() => {
    let active = true;
    setCandidate(null);
    setStatus("loading");
    setReview(false);
    setReceipt(null);
    setOperation(null);
    void getWorldResolutionCandidate(voteId)
      .then((row) => {
        if (!active) return;
        setCandidate(row);
        setStatus(row ? "ready" : "none");
      })
      .catch(() => { if (active) setStatus("error"); });
    return () => { active = false; };
  }, [voteId, retry]);

  async function publish() {
    if (!candidate || pending || receipt) return;
    const stable = operation ?? { operationId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() };
    setOperation(stable);
    setPending(true);
    setError(null);
    try {
      const acknowledged = await materializeWorldCertifiedResolution({
        voteId: candidate.voteId,
        expectedMeasureRevision: candidate.expectedMeasureRevision,
        ...stable,
      });
      setReceipt(acknowledged);
      setReview(false);
      onPublished?.(acknowledged);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Publication was not acknowledged.");
    } finally {
      setPending(false);
    }
  }

  if (status === "loading") return <p role="status">Checking certified vote and publication authority…</p>;
  if (status === "none") return <p>This vote has no eligible unpublished resolution to materialize.</p>;
  if (status === "error") return <div role="alert">
    <p>Unable to verify the certified vote and publisher authority.</p>
    <button type="button" className="min-h-11 rounded-xl border px-4"
      onClick={() => setRetry((n) => n + 1)}>Try again</button>
  </div>;
  if (!candidate) return null;
  return <section className="max-w-2xl space-y-4" aria-label="Official resolution publication">
    <h2 className="text-xl font-semibold">Publish certified resolution</h2>
    {receipt ? <div role="status" className="rounded-xl border p-4">
      <p className="font-semibold">Official resolution recorded</p>
      <p className="mt-2 text-sm">Identifier: {receipt.identifier}</p>
      <p className="mt-1 break-all text-xs text-muted-foreground">Operation: {receipt.operationId}</p>
    </div> : <>
      <p className="text-sm text-muted-foreground">
        The text below is locked to the source measure version certified by the institutional vote.
      </p>
      <p className="text-xs font-semibold uppercase">{candidate.identifier}</p>
      <h3 className="text-lg font-semibold">{candidate.title}</h3>
      <p className="text-sm">Certified on
        {" "}<time dateTime={candidate.certifiedAt}>{new Date(candidate.certifiedAt).toLocaleDateString()}</time>
      </p>
      <div className="max-h-80 overflow-auto whitespace-pre-wrap break-words border-y py-4 text-sm">
        {candidate.text}
      </div>
      {review ? <div className="space-y-3 rounded-xl border p-4">
        <p className="font-semibold">Confirm official and permanent adoption record</p>
        <p className="text-sm">This publication records a certified passed vote, its exact text and result hash. It does not recalculate voting outcomes.</p>
        <button type="button" disabled={pending} className="min-h-11 rounded-xl border px-4"
          onClick={() => { if (!operation) setReview(false); }}>Back</button>
        <button type="button" disabled={pending} className="ml-3 min-h-11 rounded-xl bg-primary px-4 text-primary-foreground disabled:opacity-60"
          onClick={() => void publish()}>{pending ? "Publishing…" : "Confirm official publication"}</button>
      </div> :
        <button type="button" className="min-h-11 rounded-xl border px-4"
          onClick={() => setReview(true)}>Review official publication</button>
      }
      {error && <p role="alert" className="text-sm text-destructive">
        {error} The same operation identity is preserved for a safe retry. Reload only after checking its receipt.
      </p>}
    </>}
  </section>;
}
