import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Archive, RefreshCw } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { WorldPublicGate } from "@/components/world/WorldPublic";
import {
  readPublicLegalArchive,
  type PublishedLegalVersion,
} from "@/lib/world-public-legal-archive";

function dateLabel(value: string | null): string {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) ? date.toISOString().slice(0, 10) + " UTC" : "Not recorded";
}

function versionLabel(version: PublishedLegalVersion): string {
  return version.publicationState === "published" ? "Published" :
    version.publicationState === "superseded" ? "Superseded, permanent" : "Historical source";
}

export function WorldPublicLegalArchive({
  organization, document, before,
}: { organization: string; document: string; before: number | null }) {
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["world", "public", "legal-archive", organization, document, before],
    queryFn: () => readPublicLegalArchive(organization, document, before),
    retry: false,
  });
  const page = query.data;
  const go = (next: number | null) => void navigate({
    to: "/world/documents/$organization/$document/archive",
    params: { organization, document },
    search: { before: next },
  });
  return (
    <AppShell>
      <main className="mx-auto max-w-5xl px-4 py-8 pb-28 sm:px-6 lg:py-12">
        <Link to="/world" className="text-sm font-semibold text-primary hover:underline">Terra Solaris</Link>
        <header className="mt-6 space-y-3">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Archive className="size-4" aria-hidden="true" /> Permanent legal history
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{page?.documentTitle ?? "Legal document archive"}</h1>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            {page ? `${page.organizationName} · ${page.documentType.replaceAll("_", " ")}` :
              "Verified official document versions."}
            {" "}Drafts and private provenance are never shown in this public archive.
          </p>
        </header>
        {query.isPending ? <p role="status" className="mt-8">Checking the official legal record…</p> :
          query.isError ? <section role="alert" className="mt-8 space-y-3 border-t border-destructive/40 pt-5">
            <h2 className="text-lg font-semibold">Legal history unavailable</h2>
            <p className="text-sm text-muted-foreground">The official archive could not be verified.</p>
            <button type="button" onClick={() => void query.refetch()} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold">
              <RefreshCw className="size-4" aria-hidden="true" /> Retry
            </button>
          </section> :
          !page ? <p role="status" className="mt-8 border-t border-border pt-5">No public archive is available for this document.</p> :
          <section className="mt-8">
            <ol className="divide-y divide-border border-y border-border">
              {page.versions.map((version) => <li key={version.versionId} className="space-y-3 py-6">
                <h2 className="text-xl font-semibold">
                  <Link
                    to="/world/documents/$organization/$document/version/$version"
                    params={{ organization, document, version: String(version.versionNumber) }}
                    className="hover:underline"
                  >
                    Version {version.versionNumber}: {version.title}
                  </Link>
                </h2>
                <p className="text-sm text-muted-foreground">{versionLabel(version)}</p>
                <dl className="grid gap-3 text-sm sm:grid-cols-3">
                  <div><dt className="text-muted-foreground">Effective from</dt><dd className="font-medium">{dateLabel(version.effectiveFrom)}</dd></div>
                  <div><dt className="text-muted-foreground">Effective until</dt><dd className="font-medium">{dateLabel(version.effectiveTo)}</dd></div>
                  <div><dt className="text-muted-foreground">Published</dt><dd className="font-medium">{dateLabel(version.publishedAt)}</dd></div>
                </dl>
                <p className="break-all font-mono text-xs text-muted-foreground">SHA-256: {version.contentHash}</p>
              </li>)}
            </ol>
            <nav aria-label="Legal archive pages" className="mt-6 flex gap-3">
              {before !== null ? <button type="button" onClick={() => go(null)} className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold">Newest versions</button> : null}
              {page.hasMore && page.nextBeforeVersion !== null ? <button type="button" onClick={() => go(page.nextBeforeVersion)} className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold">Older versions</button> : null}
            </nav>
          </section>}
      </main>
    </AppShell>
  );
}

export function WorldPublicLegalArchivePage(props: {
  organization: string; document: string; before: number | null;
}) {
  return <WorldPublicGate verifyOnMount><WorldPublicLegalArchive {...props} /></WorldPublicGate>;
}
