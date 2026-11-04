import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, BookOpen, CalendarDays, ChevronRight, FileText, ListTree, Search } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { AppShell, PageHeader } from "@/components/AppShell";
import { ArchiveDataLoading } from "@/components/ArchiveDataState";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  getWorldDocumentDetail,
  getWorldDocumentIndexPage,
  normalizeWorldSearch,
  publicWorldDocumentOutline,
  resolveWorldDocumentFragment,
  type WorldDocumentLimit,
  type WorldDocumentIndexRow,
  type WorldDocumentProvision,
} from "@/lib/world-public-documents";

const ORGANIZATION_OPTIONS = [
  { slug: "", label: "All institutions" },
  { slug: "guard", label: "GUARD" },
  { slug: "unity", label: "UNITY" },
] as const;

function dateLabel(value: string | null): string | null {
  if (!value) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(time));
}

function formatType(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function DocumentIndexRow({ item }: { item: WorldDocumentIndexRow }) {
  return (
    <Link
      to="/world/documents/$organization/$document"
      params={{ organization: item.organizationSlug, document: item.slug }}
      search={{ version: undefined }}
      className="group flex min-h-24 items-start gap-4 border-b border-border/70 py-4 outline-offset-4 transition-colors hover:text-primary focus-visible:rounded-lg focus-visible:outline-2 focus-visible:outline-primary"
    >
      <span className="mt-1 flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden="true">
        <FileText size={23} strokeWidth={1.7} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {item.organizationName} · {formatType(item.documentType)}
        </span>
        <span className="mt-1 block text-base font-semibold leading-snug group-hover:underline">
          {item.title}
        </span>
        <span className="mt-1 block text-xs text-muted-foreground">
          Version {item.currentVersion.versionNumber}
          {dateLabel(item.currentVersion.effectiveFrom)
            ? " · Effective " + dateLabel(item.currentVersion.effectiveFrom)
            : dateLabel(item.currentVersion.publishedAt)
              ? " · Published " + dateLabel(item.currentVersion.publishedAt)
              : ""}
        </span>
      </span>
      <ChevronRight className="mt-5 shrink-0 text-muted-foreground group-hover:text-primary" size={19} aria-hidden="true" />
    </Link>
  );
}

export function WorldDocumentLibraryScreen({
  initialSearch,
  initialOrganization,
  onApplySearch,
}: {
  initialSearch: string;
  initialOrganization: string;
  onApplySearch: (search: string, organization: string) => void;
}) {
  const [text, setText] = useState(initialSearch);
  const [organization, setOrganization] = useState(initialOrganization);
  const [limit, setLimit] = useState<WorldDocumentLimit>(25);

  useEffect(() => {
    setText(initialSearch);
    setOrganization(initialOrganization);
    setLimit(25);
  }, [initialSearch, initialOrganization]);

  const query = useQuery({
    queryKey: ["v3", "tg4", "public-document-index", initialOrganization, initialSearch, limit],
    queryFn: () => getWorldDocumentIndexPage({
      organizationSlug: initialOrganization || undefined,
      search: initialSearch,
      limit,
    }),
    staleTime: 90_000,
    retry: 1,
  });

  const canExpand = limit < 100 && Boolean(query.data?.couldHaveMore);
  const nextLimit: WorldDocumentLimit = limit === 25 ? 50 : 100;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onApplySearch(normalizeWorldSearch(text), organization);
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="Terra Solaris · Reference"
        title="Institutional documents"
        description="Explore published charters, treaties, rules and other official institutional records. Historical versions stay available."
        actions={
          <Link to="/explore" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary">
            <ArrowLeft size={16} aria-hidden="true" /> Explore Solaris
          </Link>
        }
      />
      <div className="mx-auto w-full max-w-6xl pb-12">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <div className="min-w-0">
            <form onSubmit={submit} role="search" className="grid gap-3 rounded-2xl border border-border/80 bg-surface/50 p-4 sm:grid-cols-[minmax(0,1fr)_12rem_auto]">
              <label className="block min-w-0">
                <span className="mb-2 block text-xs font-semibold text-muted-foreground">Find documents</span>
                <span className="relative block">
                  <Search aria-hidden="true" size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="search"
                    maxLength={100}
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    placeholder="Search published legal text"
                    className="min-h-11 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  />
                </span>
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-semibold text-muted-foreground">Institution</span>
                <select
                  value={organization}
                  onChange={(event) => setOrganization(event.target.value)}
                  className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {!ORGANIZATION_OPTIONS.some((option) => option.slug === organization) && (
                    <option value={organization}>{organization}</option>
                  )}
                  {ORGANIZATION_OPTIONS.map((option) => (
                    <option key={option.slug} value={option.slug}>{option.label}</option>
                  ))}
                </select>
              </label>
              <button type="submit" className="min-h-11 self-end rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90">
                Search
              </button>
            </form>

            <div className="mt-8 flex items-baseline justify-between gap-4 border-b border-border pb-3">
              <h2 className="font-display text-xl font-bold">Published records</h2>
              <span className="text-xs text-muted-foreground">Up to {limit} records checked</span>
            </div>
            {query.isPending ? (
              <ArchiveDataLoading label="Opening institutional records…" />
            ) : query.isError ? (
              <section role="alert" className="py-10">
                <h3 className="text-base font-semibold">Documents could not be loaded</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  The institution service may not be available yet. No substitute or unverified records are shown.
                </p>
                <button type="button" onClick={() => void query.refetch()} className="mt-4 min-h-11 rounded-xl border border-border px-4 text-sm font-semibold">
                  Try again
                </button>
              </section>
            ) : query.data.rows.length === 0 ? (
              <section className="py-10">
                <h3 className="text-base font-semibold">
                  {query.data.couldHaveMore
                    ? "No published documents in the records checked yet"
                    : "No published documents found"}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {query.data.couldHaveMore
                    ? "The index also contains unpublished work. Expand the search or narrow your terms to find published documents."
                    : "Try a different search or institution. Unpublished drafts do not appear in the public library."}
                </p>
                {canExpand && (
                  <button
                    type="button"
                    onClick={() => setLimit(nextLimit)}
                    className="mt-4 min-h-11 rounded-xl border border-border px-4 text-sm font-semibold hover:border-primary/50"
                  >
                    Check up to {nextLimit} records
                  </button>
                )}
                {(initialSearch || initialOrganization) && (
                  <button type="button" onClick={() => onApplySearch("", "")} className="mt-4 min-h-11 text-sm font-semibold text-primary underline-offset-4 hover:underline">
                    Clear filters
                  </button>
                )}
              </section>
            ) : (
              <>
                <div aria-live="polite">
                  {query.data.rows.map((item) => <DocumentIndexRow key={item.documentId} item={item} />)}
                </div>
                {canExpand && (
                  <button
                    type="button"
                    onClick={() => setLimit(nextLimit)}
                    className="mt-5 min-h-11 rounded-xl border border-border px-4 text-sm font-semibold hover:border-primary/50"
                  >
                    Check up to {nextLimit} records
                  </button>
                )}
              </>
            )}
            {!query.isPending && !query.isError && limit === 100 && query.data?.couldHaveMore && (
              <p className="mt-4 text-xs text-muted-foreground">
                The public index checks at most 100 records per search. More published documents may exist; use an institution or a specific title to narrow results.
              </p>
            )}
          </div>
          <aside className="h-fit border-t border-border pt-5 lg:sticky lg:top-24 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <BookOpen className="text-primary" size={26} strokeWidth={1.7} aria-hidden="true" />
            <h2 className="mt-3 font-display text-lg font-semibold">Official and historical</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              This library reads the canonical institutional document record. Published revisions are preserved as separate versions instead of rewriting history.
            </p>
            <p className="mt-4 text-xs text-muted-foreground">
              Public documents only. Restricted institutional workspaces and draft material are not displayed here.
            </p>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

/**
 * Canonical provision identity is stable across amendments even if a section
 * changes display number or location. The contents list must never be capped
 * at an arbitrary first N provisions, which strands deep legal references.
 */
function DocumentContents({
  provisions,
  closeOnNavigate = false,
}: {
  provisions: readonly WorldDocumentProvision[];
  closeOnNavigate?: boolean;
}) {
  return (
    <nav aria-label="Document contents">
      <h3 className="text-xs font-bold uppercase tracking-[0.13em] text-muted-foreground">Document contents</h3>
      <ol className="mt-3 space-y-1">
        {provisions.map((item) => {
          const link = (
            <a
              href={"#" + item.targetId}
              className={
                "flex min-h-10 items-center rounded-lg px-2 py-1 text-sm leading-snug text-foreground/80 " +
                "outline-offset-2 hover:bg-primary/8 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
              }
            >
              {item.displayLabel ? item.displayLabel + " " : ""}{item.heading || "Untitled section"}
            </a>
          );
          return (
            <li key={item.provisionId} className={item.parentSemanticKey ? "pl-3" : ""}>
              {closeOnNavigate ? <SheetClose asChild>{link}</SheetClose> : link}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function WorldDocumentReaderScreen({
  organization,
  document,
  version,
}: {
  organization: string;
  document: string;
  version?: number | null;
}) {
  const [documentSearch, setDocumentSearch] = useState("");
  const invalidVersion = version === null;
  const query = useQuery({
    queryKey: ["v3", "tg4", "public-document", organization, document, invalidVersion ? "invalid" : version ?? "current"],
    enabled: !invalidVersion,
    queryFn: () => getWorldDocumentDetail({
      organization,
      document,
      version: version ?? undefined,
    }),
    staleTime: 90_000,
    retry: 1,
  });
  const detail = query.data;
  const provisions = detail?.version.provisions;
  const currentVersion = detail?.history.find((item) => item.publicationState === "published");
  const anchors = publicWorldDocumentOutline(provisions ?? []);
  const textMatches = documentSearch.trim()
    ? (detail?.version.provisions ?? []).flatMap((item) => {
        const term = documentSearch.trim().toLocaleLowerCase();
        const content = [item.heading, item.displayLabel, item.bodyPlainText].join(" ").toLocaleLowerCase();
        return content.includes(term)
          ? [{ ...item, target: item.targetId }]
          : [];
      })
    : [];
  const plainTextMatch = !!documentSearch.trim() &&
    !!detail?.version.plainText.toLocaleLowerCase().includes(documentSearch.trim().toLocaleLowerCase());

  // On a cold deep link the HTML anchor is not mounted until the TG4 RPC
  // resolves. Restore the fragment only when it belongs to this exact Version.
  // window.document is intentional: "document" is the route's slug parameter.
  useEffect(() => {
    if (!provisions || typeof window === "undefined") return;
    const target = resolveWorldDocumentFragment(
      window.location.hash,
      provisions,
    );
    if (!target) return;
    const frame = window.requestAnimationFrame(() => {
      window.document.getElementById(target)?.scrollIntoView({
        block: "start",
        behavior: "auto",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [provisions]);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Terra Solaris · Institutional document"
        title={detail?.title ?? "Document reader"}
        description={detail ? detail.organization.officialName : "Published institutional records and preserved revisions."}
        actions={
          <Link to="/world/documents" search={{ organization, q: "" }} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary">
            <ArrowLeft size={16} aria-hidden="true" /> All documents
          </Link>
        }
      />
      <div className="mx-auto w-full max-w-6xl pb-12">
        {invalidVersion ? (
          <section role="alert" className="py-10">
            <h2 className="text-lg font-semibold">Invalid document version link</h2>
            <p className="mt-2 max-w-prose text-sm text-muted-foreground">
              The requested revision number is not valid. To avoid showing the wrong legal text,
              no document version has been loaded.
            </p>
            <Link
              to="/world/documents/$organization/$document"
              params={{ organization, document }}
              search={{ version: undefined }}
              className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-primary"
            >
              View the current published version
            </Link>
          </section>
        ) : query.isPending ? (
          <ArchiveDataLoading label="Opening the published document…" />
        ) : query.isError ? (
          <section role="alert" className="py-10">
            <h2 className="text-lg font-semibold">Unable to open this document</h2>
            <p className="mt-2 text-sm text-muted-foreground">The document service may be temporarily unavailable. No unverified text is displayed.</p>
            <button type="button" onClick={() => void query.refetch()} className="mt-4 min-h-11 rounded-xl border border-border px-4 text-sm font-semibold">Try again</button>
          </section>
        ) : !detail ? (
          <section className="py-10">
            <h2 className="text-lg font-semibold">This public version is unavailable</h2>
            <p className="mt-2 text-sm text-muted-foreground">The record may not exist, may be unpublished, or may not be public. Browse the document library for available records.</p>
            <Link to="/world/documents" search={{ q: "", organization: "" }} className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-primary">Browse published documents</Link>
          </section>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_14rem] xl:grid-cols-[13rem_minmax(0,1fr)_14rem]">
            <aside className="hidden min-w-0 xl:sticky xl:top-24 xl:block xl:max-h-[calc(100dvh-8rem)] xl:self-start xl:overflow-y-auto xl:pr-3">
              {anchors.length > 0 && <DocumentContents provisions={anchors} />}
            </aside>
            <article className="min-w-0">
              <div className="border-b border-border pb-6">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">{formatType(detail.documentType)}</p>
                <h2 className="mt-2 font-display text-2xl font-bold leading-tight sm:text-3xl">{detail.version.title}</h2>
                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                  <span>Version {detail.version.versionNumber}</span>
                  <span className="capitalize">{detail.version.publicationState.replace(/_/g, " ")}</span>
                  {dateLabel(detail.version.effectiveFrom) && <span className="inline-flex items-center gap-1.5"><CalendarDays size={15} aria-hidden="true" /> Effective {dateLabel(detail.version.effectiveFrom)}</span>}
                  {dateLabel(detail.version.publishedAt) && <span>Published {dateLabel(detail.version.publishedAt)}</span>}
                </div>
                {currentVersion && currentVersion.versionNumber !== detail.version.versionNumber && (
                  <p className="mt-4 border-l-2 border-primary pl-3 text-sm text-muted-foreground">
                    You are reading a historical version.{" "}
                    <Link to="/world/documents/$organization/$document" params={{ organization, document }} search={{ version: undefined }} className="font-semibold text-primary underline-offset-4 hover:underline">View the current published version</Link>.
                  </p>
                )}
              </div>
              <div className="border-b border-border py-5">
                <label htmlFor="world-document-find" className="block text-xs font-semibold text-muted-foreground">
                  Find within this version
                </label>
                <input
                  id="world-document-find"
                  type="search"
                  maxLength={80}
                  value={documentSearch}
                  onChange={(event) => setDocumentSearch(event.target.value)}
                  placeholder="Find a section or phrase"
                  className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary"
                />
                {documentSearch.trim() && (
                  <div aria-live="polite" className="mt-2 text-sm text-muted-foreground">
                    {textMatches.length > 0 ? (
                      <>
                        {textMatches.length} matching section{textMatches.length === 1 ? "" : "s"}.
                        <ul className="mt-2 flex flex-wrap gap-2">
                          {textMatches.slice(0, 20).map((item) => (
                            <li key={item.provisionId}>
                              <a href={"#" + item.target} className="inline-flex min-h-9 items-center rounded-lg border border-border px-3 text-foreground hover:text-primary">
                                {item.displayLabel || item.heading || "Matching section"}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : plainTextMatch ? "Phrase found in the full document text." : "No matching text in this version."}
                  </div>
                )}
                {anchors.length > 0 && (
                  <div className="mt-4 xl:hidden">
                    <Sheet>
                      <SheetTrigger asChild>
                        <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold text-primary focus-visible:outline-2 focus-visible:outline-primary">
                          <ListTree size={18} aria-hidden="true" /> Document contents · {anchors.length} sections
                        </button>
                      </SheetTrigger>
                      <SheetContent
                        side="bottom"
                        aria-label="Document contents"
                        className="max-h-[82dvh] overflow-y-auto rounded-t-2xl pb-[max(2rem,env(safe-area-inset-bottom))]"
                      >
                        <DocumentContents provisions={anchors} closeOnNavigate />
                      </SheetContent>
                    </Sheet>
                  </div>
                )}
              </div>
              {detail.version.provisions.length > 0 ? (
                <div className="space-y-7 py-7">
                  {detail.version.provisions.map((provision) => (
                    <section key={provision.provisionId} id={provision.targetId} className="scroll-mt-28">
                      {provision.anchor && provision.anchor !== provision.targetId && (
                        <span id={provision.anchor} aria-hidden="true" className="block scroll-mt-28" />
                      )}
                      {(provision.heading || provision.displayLabel) && (
                        <h3 className="font-display text-lg font-bold leading-snug">
                          {provision.displayLabel && <span className="mr-2 text-primary">{provision.displayLabel}</span>}
                          {provision.heading}
                        </h3>
                      )}
                      {provision.bodyPlainText && (
                        <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-7 text-foreground/90">
                          {provision.bodyPlainText}
                        </p>
                      )}
                    </section>
                  ))}
                </div>
              ) : detail.version.plainText ? (
                <div className="py-7 whitespace-pre-wrap break-words text-[15px] leading-7 text-foreground/90">
                  {detail.version.plainText}
                </div>
              ) : (
                <p className="py-8 text-sm text-muted-foreground">The published version does not contain displayable text.</p>
              )}
            </article>
            <aside className="min-w-0 space-y-7 border-t border-border pt-6 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-8rem)] lg:self-start lg:overflow-y-auto lg:border-t-0 lg:border-l lg:pt-0 lg:pl-5">
              <nav aria-label="Document versions">
                <h3 className="text-xs font-bold uppercase tracking-[0.13em] text-muted-foreground">Version history</h3>
                {detail.history.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">No public history is available.</p>
                ) : (
                  <ul className="mt-3 space-y-1">
                    {detail.history.map((item) => (
                      <li key={item.versionNumber}>
                        <Link
                          to="/world/documents/$organization/$document"
                          params={{ organization, document }}
                          search={{ version: item.versionNumber }}
                          aria-current={detail.version.versionNumber === item.versionNumber ? "page" : undefined}
                          className={"flex min-h-11 flex-col justify-center rounded-lg px-3 py-2 text-sm transition " +
                            (detail.version.versionNumber === item.versionNumber
                              ? "bg-primary/10 font-semibold text-primary"
                              : "hover:bg-surface/70")}
                        >
                          <span>Version {item.versionNumber} · {item.publicationState.replace(/_/g, " ")}</span>
                          {dateLabel(item.effectiveFrom ?? item.publishedAt) && (
                            <span className="mt-0.5 text-xs text-muted-foreground">
                              {dateLabel(item.effectiveFrom ?? item.publishedAt)}
                            </span>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </nav>
            </aside>
          </div>
        )}
      </div>
    </AppShell>
  );
}
