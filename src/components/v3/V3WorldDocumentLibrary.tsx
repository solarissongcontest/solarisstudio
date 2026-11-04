import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, BookOpen, CalendarDays, ChevronRight, FileText, Search } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { AppShell, PageHeader } from "@/components/AppShell";
import { ArchiveDataLoading } from "@/components/ArchiveDataState";
import {
  getWorldDocumentDetail,
  getWorldDocumentIndex,
  normalizeWorldSearch,
  type WorldDocumentLimit,
  type WorldDocumentIndexRow,
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
    queryFn: () => getWorldDocumentIndex({
      organizationSlug: initialOrganization || undefined,
      search: initialSearch,
      limit,
    }),
    staleTime: 90_000,
    retry: 1,
  });

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
      <main className="mx-auto w-full max-w-6xl pb-12">
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
              <span className="text-xs text-muted-foreground">Up to {limit} results</span>
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
            ) : query.data.length === 0 ? (
              <section className="py-10">
                <h3 className="text-base font-semibold">No published documents found</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Try a different search or institution. Unpublished drafts do not appear in the public library.
                </p>
                {(initialSearch || initialOrganization) && (
                  <button type="button" onClick={() => onApplySearch("", "")} className="mt-4 min-h-11 text-sm font-semibold text-primary underline-offset-4 hover:underline">
                    Clear filters
                  </button>
                )}
              </section>
            ) : (
              <>
                <div aria-live="polite">
                  {query.data.map((item) => <DocumentIndexRow key={item.documentId} item={item} />)}
                </div>
                {limit < 100 && (
                  <button
                    type="button"
                    onClick={() => setLimit(limit === 25 ? 50 : 100)}
                    className="mt-5 min-h-11 rounded-xl border border-border px-4 text-sm font-semibold hover:border-primary/50"
                  >
                    Search up to {limit === 25 ? 50 : 100} records
                  </button>
                )}
              </>
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
      </main>
    </AppShell>
  );
}

export function WorldDocumentReaderScreen({
  organization,
  document,
  version,
}: {
  organization: string;
  document: string;
  version?: number;
}) {
  const query = useQuery({
    queryKey: ["v3", "tg4", "public-document", organization, document, version ?? "current"],
    queryFn: () => getWorldDocumentDetail({ organization, document, version }),
    staleTime: 90_000,
    retry: 1,
  });
  const detail = query.data;
  const currentVersion = detail?.history.find((item) => item.publicationState === "published");
  const anchors = detail?.version.provisions.filter((item) => item.anchor && item.heading) ?? [];

  return (
    <AppShell>
      <PageHeader
        eyebrow="Terra Solaris · Institutional document"
        title={detail?.title ?? "Document reader"}
        description={detail ? detail.organization.officialName : "Published institutional records and preserved revisions."}
        actions={
          <Link to="/world/documents" search={{ organization, q: undefined }} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary">
            <ArrowLeft size={16} aria-hidden="true" /> All documents
          </Link>
        }
      />
      <main className="mx-auto w-full max-w-6xl pb-12">
        {query.isPending ? (
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
            <Link to="/world/documents" className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-primary">Browse published documents</Link>
          </section>
        ) : (
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_16rem]">
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
                    <Link to="/world/documents/$organization/$document" params={{ organization, document }} className="font-semibold text-primary underline-offset-4 hover:underline">View the current published version</Link>.
                  </p>
                )}
              </div>
              {detail.version.provisions.length > 0 ? (
                <div className="space-y-7 py-7">
                  {detail.version.provisions.map((provision) => (
                    <section key={provision.provisionId} id={provision.anchor ?? undefined} className="scroll-mt-28">
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
            <aside className="min-w-0 space-y-7 border-t border-border pt-6 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto lg:border-t-0 lg:border-l lg:pt-0 lg:pl-5">
              {anchors.length > 0 && (
                <nav aria-label="Document contents">
                  <h3 className="text-xs font-bold uppercase tracking-[0.13em] text-muted-foreground">On this page</h3>
                  <ul className="mt-3 space-y-2">
                    {anchors.slice(0, 40).map((item) => (
                      <li key={item.provisionId}>
                        <a href={"#" + item.anchor} className="inline-flex min-h-8 items-center text-sm text-foreground/80 hover:text-primary hover:underline">
                          {item.displayLabel ? item.displayLabel + " " : ""}{item.heading}
                        </a>
                      </li>
                    ))}
                  </ul>
                </nav>
              )}
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
      </main>
    </AppShell>
  );
}
