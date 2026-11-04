import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, BookOpenText, CheckCircle2, FilePenLine, Megaphone } from "lucide-react";
import {
  createWorldStatementOperation,
  type WorldStatementDetail,
  type WorldStatementManageContext,
  type WorldStatementOperation,
  type WorldStatementReceipt,
} from "@/lib/world-official-statements";
import {
  correctWorldOfficialStatement,
  listWorldOfficialStatements,
  listWorldStatementHistory,
  publishWorldOfficialStatement,
  readWorldOfficialStatement,
  readWorldStatementPublishingContext,
} from "@/lib/world-official-statements-client";

const formatDate = (value: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" })
    .format(new Date(value));

const linkStyles = "inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted";
const actionStyles = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60";
const fieldStyles = "w-full rounded-xl border border-border bg-background px-3 py-3 text-sm text-foreground";
const pageStyles = "mx-auto w-full max-w-4xl px-4 pb-16 pt-7 sm:px-6 sm:pt-12";

function ErrorPanel({ label, retry }: { label: string; retry?: () => void }) {
  return (
    <div role="alert" className="my-5 rounded-xl border border-destructive/40 p-5">
      <p className="text-sm text-foreground">{label}</p>
      {retry ? <button type="button" onClick={retry} className={linkStyles + " mt-3"}>Retry</button> : null}
    </div>
  );
}

function PublishingForm({
  context,
  mode,
  initial,
  statementId,
  onPublished,
}: {
  context: WorldStatementManageContext;
  mode: "publish" | "correct";
  initial?: WorldStatementDetail;
  statementId?: string;
  onPublished: (receipt: WorldStatementReceipt) => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [reason, setReason] = useState("");
  const [officeId, setOfficeId] = useState(context.canPublishAsOrganization
    ? "" : (context.offices[0]?.id ?? ""));
  const [operation, setOperation] = useState<WorldStatementOperation | null>(null);
  const [inFlight, setInFlight] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<WorldStatementReceipt | null>(null);
  const attempted = operation !== null;
  const valid = title.trim().length > 0 && title.trim().length <= 180 &&
    body.trim().length > 0 && body.trim().length <= 30000 &&
    (mode === "publish" || (reason.trim().length >= 5 && reason.trim().length <= 1000));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight || receipt || !valid) return;
    const existing = operation ?? createWorldStatementOperation();
    if (!operation) setOperation(existing);
    setInFlight(true);
    setError("");
    try {
      const result = mode === "publish"
        ? await publishWorldOfficialStatement({
            organizationId: context.organizationId, officeId: officeId || null,
            title: title.trim(), body: body.trim(), operation: existing,
          })
        : await correctWorldOfficialStatement({
            statementId: statementId!, expectedRevision: initial!.currentVersion,
            title: title.trim(), body: body.trim(),
            correctionReason: reason.trim(), operation: existing,
          });
      setReceipt(result);
      onPublished(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The operation could not be confirmed.");
      // The exact payload and operation key remain fixed after uncertainty.
      // Retrying never manufactures a second published statement or correction.
    } finally { setInFlight(false); }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-5 rounded-2xl border border-border bg-card p-5 sm:p-7">
      <h2 className="text-xl font-semibold">{mode === "publish" ? "Publish an official statement" : "Issue a recorded correction"}</h2>
      <p className="text-sm leading-6 text-muted-foreground">
        {mode === "publish"
          ? "Publication is immediately public and permanent. Verify the issuing authority and text before submitting."
          : "The prior version remains public. Explain the correction; it will appear in the permanent version history."}
      </p>
      {mode === "publish" ? (
        <label className="block space-y-2 text-sm font-medium">
          <span>Issuing authority</span>
          <select className={fieldStyles} value={officeId} disabled={attempted || inFlight}
            onChange={(event) => setOfficeId(event.target.value)}>
            {context.canPublishAsOrganization ? <option value="">Institutional statement</option> : null}
            {context.offices.map(office => (
              <option key={office.id} value={office.id}>Officeholder: {office.title}</option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="block space-y-2 text-sm font-medium">
        <span>Official title</span>
        <input value={title} maxLength={180} required disabled={attempted || inFlight}
          onChange={(event) => setTitle(event.target.value)} className={fieldStyles} />
      </label>
      <label className="block space-y-2 text-sm font-medium">
        <span>Statement text</span>
        <textarea value={body} maxLength={30000} required rows={10}
          disabled={attempted || inFlight} onChange={(event) => setBody(event.target.value)}
          className={fieldStyles + " min-h-52 resize-y leading-7"} />
      </label>
      {mode === "correct" ? (
        <label className="block space-y-2 text-sm font-medium">
          <span>Reason for correction (public record)</span>
          <textarea value={reason} minLength={5} maxLength={1000} rows={3} required
            disabled={attempted || inFlight} onChange={event => setReason(event.target.value)}
            className={fieldStyles} />
        </label>
      ) : null}
      {receipt ? (
        <div role="status" className="flex flex-wrap items-center gap-3 text-sm">
          <CheckCircle2 className="size-5 text-primary" aria-hidden="true" />
          <span>Recorded as version {receipt.revision}. {receipt.replayed ? "Recovered from the original operation." : "Receipt confirmed."}</span>
          <Link className={linkStyles} to={"/world/organizations/$slug/statements/$statementId" as any}
            params={{ slug: context.organizationSlug, statementId: receipt.statementId } as any}>
            Read statement <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <>
          {error ? <ErrorPanel label={error} /> : null}
          {attempted ? <p className="text-xs leading-5 text-muted-foreground">
            Submission identity is locked after the first attempt. Retry the same operation
            to recover its receipt; do not start a duplicate publication.
          </p> : null}
          <button type="submit" className={actionStyles} disabled={!valid || inFlight}>
            {inFlight ? "Confirming publication…" : attempted ? "Retry same operation" :
              mode === "publish" ? "Publish official statement" : "Publish correction"}
          </button>
        </>
      )}
    </form>
  );
}

export function WorldOfficialStatementsDirectory({ slug }: { slug: string }) {
  const [page, setPage] = useState(0);
  const [showPublisher, setShowPublisher] = useState(false);
  const [contextError, setContextError] = useState("");
  const [context, setContext] = useState<WorldStatementManageContext | null>(null);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["world", "official-statements", "feed", slug, page],
    queryFn: () => listWorldOfficialStatements(slug, page),
    staleTime: 60_000, retry: 0,
  });
  async function openPublishingTools() {
    setContextError("");
    try {
      const result = await readWorldStatementPublishingContext(slug);
      setContext(result);
      setShowPublisher(true);
    } catch (cause) {
      setContextError(cause instanceof Error ? cause.message : "Publisher access unavailable");
    }
  }
  return (
    <main className={pageStyles}>
      <Link className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        to={"/world/organizations/$slug" as any} params={{ slug } as any}>
        <ArrowLeft className="size-4" aria-hidden="true" /> Organization overview
      </Link>
      <header className="mt-5 border-b border-border pb-8">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-primary">Terra Solaris · Official record</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">Statements</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Published institutional announcements and corrections. Drafts, internal communications
          and unapproved statements do not appear in this public record.
        </p>
        <button type="button" onClick={() => void openPublishingTools()}
          className={linkStyles + " mt-6"}>
          <FilePenLine className="size-4" aria-hidden="true" /> Authorized publisher tools
        </button>
        {contextError ? <ErrorPanel label={contextError} /> : null}
      </header>
      {showPublisher && context ? <PublishingForm key={context.organizationId} context={context}
        mode="publish" onPublished={() => void queryClient.invalidateQueries({
          queryKey: ["world", "official-statements"],
        })} /> : null}
      <section aria-label="Published statements" className="mt-8">
        {query.isPending ? <p role="status" className="py-8 text-sm text-muted-foreground">Loading official statements…</p> : null}
        {query.isError ? <ErrorPanel label="Published statements could not be loaded."
          retry={() => void query.refetch()} /> : null}
        {query.data && query.data.items.length === 0 ? (
          <div className="rounded-xl border border-border p-7 text-center">
            <Megaphone className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
            <h2 className="mt-3 font-semibold">No statements recorded here</h2>
            <p className="mt-2 text-sm text-muted-foreground">No official publication is inferred from informal messages.</p>
          </div>
        ) : null}
        {query.data?.items.map(statement => (
          <article key={statement.id} className="border-b border-border/80 py-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {statement.officeTitle && statement.issuerName
                ? statement.issuerName + " · " + statement.officeTitle
                : statement.organizationName}
            </p>
            <h2 className="mt-2 text-xl font-semibold leading-snug">
              <Link to={"/world/organizations/$slug/statements/$statementId" as any}
                params={{ slug, statementId: statement.id } as any}
                className="hover:underline focus-visible:outline-primary">{statement.title}</Link>
            </h2>
            <p className="mt-2 text-xs text-muted-foreground">
              <time dateTime={statement.publishedAt}>{formatDate(statement.publishedAt)}</time>
              {statement.revision > 1 ? " · " + (statement.revision - 1) + " recorded correction(s)" : ""}
            </p>
          </article>
        ))}
        {query.data ? (
          <nav className="mt-7 flex items-center justify-between gap-3" aria-label="Statement pages">
            <button type="button" disabled={page === 0} onClick={() => setPage(n => n - 1)}
              className={linkStyles + " disabled:opacity-40"}>Previous</button>
            <span className="text-sm text-muted-foreground">Page {page + 1}</span>
            <button type="button" disabled={!query.data.hasMore} onClick={() => setPage(n => n + 1)}
              className={linkStyles + " disabled:opacity-40"}>Next</button>
          </nav>
        ) : null}
      </section>
    </main>
  );
}

export function WorldOfficialStatementDetail({
  slug, statementId, version,
}: { slug: string; statementId: string; version: number | null }) {
  const [historyPage, setHistoryPage] = useState(0);
  const [showCorrection, setShowCorrection] = useState(false);
  const [contextError, setContextError] = useState("");
  const [context, setContext] = useState<WorldStatementManageContext | null>(null);
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: ["world", "official-statements", "detail", slug, statementId, version],
    queryFn: () => readWorldOfficialStatement(slug, statementId, version),
    staleTime: 60_000, retry: 0,
  });
  const history = useQuery({
    queryKey: ["world", "official-statements", "history", statementId, historyPage],
    queryFn: () => listWorldStatementHistory(statementId, historyPage),
    enabled: detail.data != null,
    staleTime: 60_000, retry: 0,
  });
  async function openCorrectionTools() {
    setContextError("");
    try {
      const result = await readWorldStatementPublishingContext(slug);
      setContext(result);
      setShowCorrection(true);
    } catch (cause) {
      setContextError(cause instanceof Error ? cause.message : "Publisher access unavailable");
    }
  }
  return (
    <main className={pageStyles}>
      <Link className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        to={"/world/organizations/$slug/statements" as any} params={{ slug } as any}>
        <ArrowLeft className="size-4" aria-hidden="true" /> All statements
      </Link>
      {detail.isPending ? <p role="status" className="mt-10 text-sm text-muted-foreground">Loading statement…</p> : null}
      {detail.isError ? <ErrorPanel label="The published statement could not be loaded."
        retry={() => void detail.refetch()} /> : null}
      {detail.data === null ? (
        <div className="mt-8 rounded-xl border border-border p-7">
          <h1 className="text-2xl font-semibold">Statement unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">This record is not published or does not exist.</p>
        </div>
      ) : null}
      {detail.data ? (
        <>
          <article className="mt-8">
            <p className="text-xs font-semibold uppercase tracking-[.15em] text-primary">{detail.data.organizationName}</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">{detail.data.title}</h1>
            <div className="mt-5 space-y-1 border-b border-border pb-6 text-sm text-muted-foreground">
              <p>{detail.data.statementType === "officeholder"
                ? [detail.data.issuerName, detail.data.officeTitle].join(" · ")
                : "Official institutional statement"}</p>
              <p>Originally published <time dateTime={detail.data.publishedAt}>
                {formatDate(detail.data.publishedAt)}</time></p>
              <p>Showing version {detail.data.shownVersion} of {detail.data.currentVersion}</p>
            </div>
            {detail.data.correctionReason ? (
              <aside className="mt-6 rounded-xl border border-border bg-muted/40 p-5">
                <p className="text-sm font-semibold">Recorded correction</p>
                <p className="mt-2 text-sm leading-6">{detail.data.correctionReason}</p>
              </aside>
            ) : null}
            {detail.data.shownVersion < detail.data.currentVersion ? (
              <Link to={"/world/organizations/$slug/statements/$statementId" as any}
                params={{ slug, statementId } as any} search={{ version: undefined } as any}
                className={linkStyles + " mt-6"}>
                Read current version <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            ) : null}
            <div className="mt-8 whitespace-pre-wrap break-words text-base leading-8 text-foreground">
              {detail.data.body}
            </div>
          </article>
          <section className="mt-12 border-t border-border pt-7" aria-label="Recorded versions">
            <div className="flex items-center gap-2">
              <BookOpenText className="size-5 text-primary" aria-hidden="true" />
              <h2 className="text-xl font-semibold">Version history</h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Corrections add immutable versions. Earlier published text remains accessible.
            </p>
            {history.isPending ? <p role="status" className="mt-5 text-sm">Loading version history…</p> : null}
            {history.isError ? <ErrorPanel label="Version history could not be loaded."
              retry={() => void history.refetch()} /> : null}
            {history.data?.items.map(entry => (
              <Link key={entry.version}
                to={"/world/organizations/$slug/statements/$statementId" as any}
                params={{ slug, statementId } as any}
                search={{ version: entry.version } as any}
                aria-current={detail.data?.shownVersion === entry.version ? "page" : undefined}
                className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-border py-3 text-sm hover:text-primary">
                <span className="font-semibold">Version {entry.version}
                  {entry.version === detail.data?.currentVersion ? " (current)" : ""}
                </span>
                <time className="text-xs text-muted-foreground" dateTime={entry.publishedAt}>
                  {formatDate(entry.publishedAt)}</time>
              </Link>
            ))}
            {history.data ? (
              <nav className="mt-5 flex gap-3" aria-label="Version history pages">
                <button type="button" disabled={historyPage === 0}
                  onClick={() => setHistoryPage(n => n - 1)}
                  className={linkStyles + " disabled:opacity-40"}>Newer</button>
                <button type="button" disabled={!history.data.hasMore}
                  onClick={() => setHistoryPage(n => n + 1)}
                  className={linkStyles + " disabled:opacity-40"}>Older</button>
              </nav>
            ) : null}
          </section>
          <section className="mt-12 border-t border-border pt-7">
            <button className={linkStyles} type="button" onClick={() => void openCorrectionTools()}>
              <FilePenLine className="size-4" aria-hidden="true" /> Authorized correction tools
            </button>
            {contextError ? <ErrorPanel label={contextError} /> : null}
            {showCorrection && context ? (
              <WorldCurrentStatementCorrection slug={slug} statementId={statementId} context={context}
                afterPublish={() => void queryClient.invalidateQueries({
                  queryKey: ["world", "official-statements"],
                })} />
            ) : null}
          </section>
        </>
      ) : null}
    </main>
  );
}

function WorldCurrentStatementCorrection({
  slug, statementId, context, afterPublish,
}: {
  slug: string;
  statementId: string;
  context: WorldStatementManageContext;
  afterPublish: () => void;
}) {
  const latest = useQuery({
    queryKey: ["world", "official-statements", "latest-for-correction", slug, statementId],
    queryFn: () => readWorldOfficialStatement(slug, statementId),
    staleTime: 0, retry: 0,
  });
  if (latest.isPending) return <p role="status" className="mt-5 text-sm">Checking current published version…</p>;
  if (latest.isError || !latest.data) return <ErrorPanel
    label="Cannot obtain the current canonical version for correction."
    retry={() => void latest.refetch()} />;
  return <PublishingForm key={latest.data.currentVersion} context={context} mode="correct"
    initial={latest.data} statementId={statementId} onPublished={afterPublish} />;
}
