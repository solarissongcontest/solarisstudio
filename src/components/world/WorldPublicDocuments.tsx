import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, BookOpenText, FileText, Search } from "lucide-react";
import { useState, type FormEvent } from "react";

import { AppShell, PageHeader } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import {
  isWorldDocumentSlug, matchingWorldProvisions, parseWorldDocumentIndex,
  parseWorldDocumentReader, type WorldDocumentProvision,
} from "@/lib/v3-world-public-documents";

const limit = 50;

function LoadingDocuments() {
  return <div role="status" aria-label="Loading public documents" className="space-y-3">
    {[0, 1, 2].map((n) => <div key={n} aria-hidden="true"
      className="h-20 animate-pulse rounded-xl bg-muted/60 motion-reduce:animate-none" />)}
    <span className="sr-only">Loading public documents</span>
  </div>;
}

function DocumentError({ retry }: { retry: () => void }) {
  return <div role="alert" className="rounded-xl border border-border p-5">
    <h2 className="text-base font-semibold">Public document records are unavailable</h2>
    <p className="mt-2 text-sm leading-6 text-muted-foreground">
      The authoritative document service could not be verified. No provisional legal text is substituted.
    </p>
    <button type="button" onClick={retry}
      className="mt-4 min-h-11 rounded-xl border border-border px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2">
      Try again
    </button>
  </div>;
}

function WorldDocumentBackLink({ slug }: { slug: string }) {
  return <Link to={`/world/organizations/${slug}` as any}
    className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
    <ArrowLeft aria-hidden="true" className="size-4" /> Organization
  </Link>;
}

function searchValue(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 100);
}

export function WorldPublicDocumentIndex({ organizationSlug }: { organizationSlug: string }) {
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const valid = isWorldDocumentSlug(organizationSlug);
  const query = useQuery({
    queryKey: ["world", "public-documents", organizationSlug, search],
    enabled: valid,
    staleTime: 120_000,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("world_get_document_index_v1", {
        p_organization_slug: organizationSlug, p_query: search || null, p_limit: limit,
      });
      if (error) throw error;
      return parseWorldDocumentIndex(data, organizationSlug);
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch(searchValue(input));
  }
  return <AppShell>
    <PageHeader eyebrow="Terra Solaris · Legal reference" title="Institutional documents"
      description="Read publicly published legal texts and their effective versions. Official laws, charters and records remain anchored to their source institution." />
    <div className="mx-auto w-full max-w-5xl px-4 pb-28 sm:px-6">
      <WorldDocumentBackLink slug={organizationSlug} />
      {!valid ? <p role="status" className="text-sm text-muted-foreground">This institution is not available.</p> : <>
        <form onSubmit={submit} className="mb-6 flex flex-wrap gap-2">
          <label className="relative min-w-52 flex-1">
            <span className="sr-only">Search public legal documents</span>
            <Search aria-hidden="true" className="absolute left-3 top-3.5 size-4 text-muted-foreground" />
            <input value={input} maxLength={100} onChange={(event) => setInput(event.target.value)}
              placeholder="Search document text and titles" autoComplete="off"
              className="min-h-11 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-sm focus-visible:outline-2 focus-visible:outline-primary" />
          </label>
          <button type="submit" className="min-h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground">Search</button>
        </form>
        {query.isPending ? <LoadingDocuments /> : query.isError
          ? <DocumentError retry={() => { void query.refetch(); }} />
          : query.data.length === 0 ? (
            <div className="border-t border-border py-8">
              <p className="font-semibold">No public documents found</p>
              <p className="mt-2 text-sm text-muted-foreground">
                This organization has no matching published legal documents. Drafts and member-only texts are not displayed.
              </p>
            </div>
          ) : (
            <>
              <p className="mb-3 text-xs text-muted-foreground">
                {query.data.length} matching public document{query.data.length === 1 ? "" : "s"}
                {query.data.length === limit ? " · Showing the first 50, refine your search for more" : ""}
              </p>
              <div className="divide-y divide-border border-t border-border">
                {query.data.map((doc) => (
                  <Link key={doc.id} to={`/world/organizations/${organizationSlug}/documents/${doc.slug}` as any}
                    className="group flex min-h-20 items-start gap-4 py-5 focus-visible:rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <FileText aria-hidden="true" className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold group-hover:text-primary">{doc.title}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {doc.documentType.replace(/_/g, " ")} · Version {doc.versionNumber} · {doc.status}
                      </span>
                      {doc.effectiveFrom ? <span className="mt-1 block text-xs text-muted-foreground">
                        Effective from {doc.effectiveFrom.slice(0, 10)}
                      </span> : null}
                    </span>
                  </Link>
                ))}
              </div>
            </>
          )}
      </>}
    </div>
  </AppShell>;
}

function TableOfContents({ provisions, query }: { provisions: readonly WorldDocumentProvision[]; query: string }) {
  const visible = matchingWorldProvisions(provisions, query);
  return <nav aria-label="Document contents">
    <p className="mb-3 text-xs font-bold uppercase tracking-wider text-primary">
      Contents {query ? `(${visible.length} matching)` : ""}
    </p>
    {visible.length ? <ol className="max-h-[55vh] space-y-1 overflow-y-auto pr-2">
      {visible.map((provision) => <li key={provision.semanticKey}>
        <a href={`#provision-${provision.semanticKey}`}
          className="block rounded-lg px-2 py-2 text-sm leading-5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2">
          {provision.displayLabel ? <span className="mr-1 font-semibold">{provision.displayLabel}</span> : null}
          {provision.heading || provision.semanticKey}
        </a>
      </li>)}
    </ol> : <p className="text-xs text-muted-foreground">No provisions match this search.</p>}
  </nav>;
}

export function WorldPublicDocumentReader({
  organizationSlug, documentSlug, version,
}: { organizationSlug: string; documentSlug: string; version?: number }) {
  const [find, setFind] = useState("");
  const valid = isWorldDocumentSlug(organizationSlug) && isWorldDocumentSlug(documentSlug);
  const query = useQuery({
    queryKey: ["world", "public-document", organizationSlug, documentSlug, version ?? "current"],
    enabled: valid,
    staleTime: 120_000,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("world_get_document_v1", {
        p_organization_slug: organizationSlug, p_document_slug: documentSlug,
        p_version_number: version ?? null,
      });
      if (error) throw error;
      return parseWorldDocumentReader(data, organizationSlug, documentSlug, version);
    },
  });
  const doc = query.data;
  const back = `/world/organizations/${organizationSlug}/documents`;
  return <AppShell>
    <PageHeader eyebrow="Terra Solaris · Official documents"
      title={doc?.title ?? "Document reader"}
      description={doc ? `${doc.organization.shortName} · ${doc.version.title}` : "Authoritative public legal text and version history."} />
    <div className="mx-auto w-full max-w-7xl px-4 pb-28 sm:px-6">
      <Link to={back as any} className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> All public documents
      </Link>
      {!valid || (query.isSuccess && !doc)
        ? <p role="status" className="py-8 text-sm text-muted-foreground">This document or version is not publicly available.</p>
        : query.isPending ? <LoadingDocuments />
        : query.isError ? <DocumentError retry={() => { void query.refetch(); }} />
        : doc ? (
          <>
            <div className="mb-8 flex flex-wrap items-center gap-3 border-b border-border pb-5">
              <BookOpenText aria-hidden="true" className="size-5 text-primary" />
              <span className="font-semibold">Version {doc.version.number}</span>
              <span className="rounded-lg border border-border px-2 py-1 text-xs capitalize text-muted-foreground">{doc.version.publicationState}</span>
              {doc.version.effectiveFrom ? <span className="text-xs text-muted-foreground">
                Effective {doc.version.effectiveFrom.slice(0, 10)}
              </span> : null}
            </div>
            <div className="grid gap-9 lg:grid-cols-[15rem_minmax(0,1fr)_13rem] lg:gap-10">
              <aside className="hidden lg:block">
                <div className="sticky top-24 max-h-[80vh] overflow-auto">
                  <label className="mb-4 block text-xs font-semibold">
                    Find a provision
                    <input value={find} onChange={(e) => setFind(e.target.value)} maxLength={120}
                      placeholder="Search within text" className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-normal" />
                  </label>
                  <TableOfContents provisions={doc.version.provisions} query={find} />
                </div>
              </aside>
              <article className="min-w-0">
                <div className="mb-7 lg:hidden">
                  <details className="rounded-xl border border-border p-4">
                    <summary className="min-h-10 cursor-pointer font-semibold">Contents and search</summary>
                    <label className="mb-4 mt-3 block text-xs font-semibold">
                      Find a provision
                      <input value={find} onChange={(e) => setFind(e.target.value)} maxLength={120}
                        placeholder="Search within text" className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-normal" />
                    </label>
                    <TableOfContents provisions={doc.version.provisions} query={find} />
                  </details>
                </div>
                <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{doc.version.title}</h2>
                {doc.version.provisions.length === 0
                  ? <p className="mt-5 text-sm text-muted-foreground">No structured provisions are published in this version.</p>
                  : <div className="mt-7 space-y-9">
                    {doc.version.provisions.map((provision) => (
                      <section id={`provision-${provision.semanticKey}`} key={provision.semanticKey}
                        className="scroll-mt-28 border-t border-border pt-6">
                        <div className="flex flex-wrap items-center gap-2">
                          {provision.displayLabel ? <p className="text-xs font-bold uppercase tracking-wider text-primary">{provision.displayLabel}</p> : null}
                          {provision.status !== "active" ? <span className="rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground">{provision.status}</span> : null}
                        </div>
                        <h3 className="mt-2 text-lg font-semibold">{provision.heading || provision.semanticKey}</h3>
                        <p className="mt-4 whitespace-pre-line break-words text-sm leading-8 text-foreground/85">{provision.text || "No provision text in this version."}</p>
                      </section>
                    ))}
                  </div>}
              </article>
              <aside className="space-y-6 lg:border-l lg:border-border lg:pl-5">
                <section>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-primary">Published versions</h2>
                  <div className="mt-3 space-y-2">
                    {doc.history.map((item) => (
                      <Link key={item.number}
                        to={`/world/organizations/${organizationSlug}/documents/${documentSlug}` as any}
                        search={{ version: item.number } as any}
                        aria-current={item.number === doc.version.number ? "page" : undefined}
                        className={`block min-h-11 rounded-lg border px-3 py-2 text-sm ${item.number === doc.version.number ? "border-primary bg-primary/10 font-semibold" : "border-border hover:bg-muted"}`}>
                        Version {item.number}
                        <span className="mt-1 block text-xs text-muted-foreground">{item.state}</span>
                      </Link>
                    ))}
                  </div>
                </section>
                {doc.version.contentHash ? <details className="border-t border-border pt-4">
                  <summary className="cursor-pointer text-xs font-semibold">Published content hash</summary>
                  <code className="mt-2 block break-all text-[11px] text-muted-foreground">{doc.version.contentHash}</code>
                </details> : null}
                <p className="text-xs leading-6 text-muted-foreground">
                  This is a read-only public rendering. Only a formally published version is presented as current law;
                  historical versions are labelled separately.
                </p>
              </aside>
            </div>
          </>
        ) : null}
    </div>
  </AppShell>;
}
