import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Archive, CalendarDays, FileClock, RefreshCw } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { WorldPublicGate } from "@/components/world/WorldPublic";
import {
  readPublicLegalArchive,
  type PublishedLegalVersion,
} from "@/lib/world-public-legal-archive";

function dateLabel(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) ? date.toISOString().slice(0, 10) + " UTC" : null;
}

function versionStatus(version: PublishedLegalVersion): string {
  switch (version.publicationState) {
    case "published": return "Published version";
    case "superseded": return "Superseded, permanent";
    case "historical_source": return "Historical source, permanent";
  }
}

export function WorldPublicLegalArchive({
  organization,
  document,
  before,
}: {
  organization: string;
  document: string;
  before: number | null;
}) {
  const navigate = useNavigate();
  const archive = useQuery({
    queryKey: ["tg4", "public-legal-archive", organization, document, before],
    queryFn: ({ signal }) => readPublicLegalArchive(organization, document, before, signal),
    staleTime: 90_000,
    retry: 1,
  });
  const page = archive.data;

  const changeCursor = (next: number | null) =>
    void navigate({
      to: "/world/documents/$organization/$document/archive",
      params: { organization, document },
      search: { before: next },
    });

  return (
    <AppShell>
      <main className="mx-auto max-w-5xl space-y-7 px-4 py-8 pb-28 sm:px-6 lg:py-12">
        <header className="space-y-3">
          <Link to="/world/documents" search={{ q: "", organization }}
            className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline">
            Institutional documents
          </Link>
          <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Archive className="size-4" aria-hidden="true" />
            Permanent legal history
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {page?.documentTitle ?? "Legal document archive"}
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            {page
              ? `${page.organizationName} · ${page.documentType.replaceAll("_", " ")}`
              : "Verified official document versions"}
            . Each published Version is permanently retained and linked to its original text.
            Replaced text does not automatically describe law currently in force.
          </p>
        </header>
        {archive.isPending ? (
          <p role="status" className="min-h-24 py-8">
            Checking the public legal record and immutable version history…
          </p>
        ) : archive.isError ? (
          <section role="alert" className="space-y-3 border-t border-destructive/40 pt-5">
            <h2 className="text-lg font-semibold">Legal history unavailable</h2>
            <p>The official archive could not be verified. No draft or cached fallback is shown.</p>
            <button type="button" onClick={() => void archive.refetch()}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4">
              <RefreshCw className="size-4" aria-hidden="true" /> Retry verified history
            </button>
          </section>
        ) : !page ? (
          <section role="status" className="space-y-2 border-t border-border pt-5">
            <h2 className="text-lg font-semibold">No public archive is available</h2>
            <p>This document may be unpublished, private, or unavailable.</p>
          </section>
        ) : (
          <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_14rem]">
            <div className="min-w-0 space-y-6">
              {page.documentStatus !== "active" && (
                <p className="border-l-2 border-amber-500 pl-4 text-sm">
                  This Work is {page.documentStatus}. Its immutable history remains available.
                </p>
              )}
              {page.versions.length === 0 ? (
                <section role="status" className="border-t border-border pt-5">
                  No publicly retained legal Versions match this archive page.
                </section>
              ) : (
                <ol className="divide-y divide-border/70 border-y border-border">
                  {page.versions.map((version) => (
                    <li key={version.versionId} className="space-y-3 py-6">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h2 className="text-xl font-semibold">
                            Version {version.versionNumber}: {version.title}
                          </h2>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {versionStatus(version)}
                            {version.versionId === page.currentVersionId ? " · Current published version" : ""}
                          </p>
                        </div>
                        <FileClock className="size-5 text-muted-foreground" aria-hidden="true" />
                      </div>
                      <dl className="grid gap-2 text-sm sm:grid-cols-2">
                        <div>
                          <dt className="text-muted-foreground">Effective from</dt>
                          <dd className="font-medium">{dateLabel(version.effectiveFrom) ?? "Not recorded"}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Effective until</dt>
                          <dd className="font-medium">{dateLabel(version.effectiveTo) ?? "Not recorded"}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Publication</dt>
                          <dd className="font-medium">{dateLabel(version.publishedAt) ?? "Not recorded"}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Text availability</dt>
                          <dd className="font-medium">
                            {version.fullTextAvailable ? "Official text available" : "Full text unavailable"}
                          </dd>
                        </div>
                      </dl>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Immutable version SHA-256</p>
                        <code className="block break-all text-xs text-foreground/85">{version.contentHash}</code>
                      </div>
                      <Link
                        to="/world/documents/$organization/$document"
                        params={{ organization, document }}
                        search={{ version: version.versionNumber }}
                        className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-sm font-semibold text-primary hover:bg-muted"
                      >
                        Read Version {version.versionNumber}
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
              <nav aria-label="Legal archive pages" className="flex flex-wrap items-center gap-3">
                {before !== null && (
                  <button type="button" onClick={() => changeCursor(null)}
                    className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold">
                    Newest versions
                  </button>
                )}
                {page.hasMore && page.nextBeforeVersion !== null && (
                  <button type="button" onClick={() => changeCursor(page.nextBeforeVersion)}
                    className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold">
                    Older versions
                  </button>
                )}
              </nav>
            </div>
            <aside className="space-y-4 border-t border-border pt-5 lg:border-t-0 lg:border-l lg:pl-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Official source
              </h2>
              <p className="text-sm leading-6">
                This archive is a view of canonical legal Versions, not a second record
                or a reconstructed historical interpretation.
              </p>
              <Link to="/world/documents/$organization/$document"
                params={{ organization, document }} search={{ version: undefined }}
                className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-4">
                Current document reader
              </Link>
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <CalendarDays className="size-4" aria-hidden="true" />
                Verified public history only
              </p>
            </aside>
          </div>
        )}
      </main>
    </AppShell>
  );
}

export function WorldPublicLegalArchivePage(props: {
  organization: string;
  document: string;
  before: number | null;
}) {
  return (
    <WorldPublicGate verifyOnMount>
      <WorldPublicLegalArchive {...props} />
    </WorldPublicGate>
  );
}
