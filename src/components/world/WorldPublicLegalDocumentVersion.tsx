import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { FileText, RefreshCw } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { WorldPublicGate } from "@/components/world/WorldPublic";
import {
  readPublicLegalDocumentVersion,
  type PublicLegalDocumentVersion as LegalVersion,
} from "@/lib/world-public-legal-archive";

function dateLabel(value: string | null): string {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) ? date.toISOString().slice(0, 10) + " UTC" : "Not recorded";
}

function publicationLabel(version: LegalVersion): string {
  return version.publicationState === "published" ? "Published" :
    version.publicationState === "superseded" ? "Superseded, permanent" : "Historical source";
}

export function WorldPublicLegalDocumentVersion({
  organization, document, version,
}: { organization: string; document: string; version: number }) {
  const query = useQuery({
    queryKey: ["world", "public", "legal-document", organization, document, version],
    queryFn: () => readPublicLegalDocumentVersion(organization, document, version),
    retry: false,
  });
  const page = query.data;
  return (
    <AppShell>
      <main className="mx-auto max-w-5xl px-4 py-8 pb-28 sm:px-6 lg:py-12">
        <Link to="/world" className="text-sm font-semibold text-primary hover:underline">Terra Solaris</Link>
        <p className="mt-6 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <FileText className="mr-2 inline size-4" aria-hidden="true" /> Official document
        </p>
        {query.isPending ? <p role="status" className="mt-8">Checking the official document…</p> :
          query.isError ? <section role="alert" className="mt-8 space-y-3 border-t border-destructive/40 pt-5">
            <h1 className="text-lg font-semibold">Document unavailable</h1>
            <p className="text-sm text-muted-foreground">The official document could not be verified.</p>
            <button type="button" onClick={() => void query.refetch()} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold">
              <RefreshCw className="size-4" aria-hidden="true" /> Retry
            </button>
          </section> :
          !page ? <p role="status" className="mt-8 border-t border-border pt-5">No public version is available for this document.</p> :
          <article className="mt-6">
            <header className="space-y-3 border-b border-border pb-6">
              <Link
                to="/world/documents/$organization/$document/archive"
                params={{ organization, document }}
                search={{ before: null }}
                className="text-sm font-semibold text-primary hover:underline"
              >
                View permanent version history
              </Link>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{page.documentTitle}</h1>
              <h2 className="text-xl font-semibold">{page.versionTitle} · Version {page.versionNumber}</h2>
              <p className="text-sm text-muted-foreground">{page.organizationName} · {publicationLabel(page)}</p>
              <dl className="grid gap-3 text-sm sm:grid-cols-3">
                <div><dt className="text-muted-foreground">Effective from</dt><dd className="font-medium">{dateLabel(page.effectiveFrom)}</dd></div>
                <div><dt className="text-muted-foreground">Effective until</dt><dd className="font-medium">{dateLabel(page.effectiveTo)}</dd></div>
                <div><dt className="text-muted-foreground">Published</dt><dd className="font-medium">{dateLabel(page.publishedAt)}</dd></div>
              </dl>
              <p className="break-all font-mono text-xs text-muted-foreground">SHA-256: {page.contentHash}</p>
            </header>
            <pre className="mt-8 whitespace-pre-wrap break-words font-sans text-sm leading-7">{page.fullText}</pre>
          </article>}
      </main>
    </AppShell>
  );
}

export function WorldPublicLegalDocumentVersionPage(props: {
  organization: string; document: string; version: number;
}) {
  return <WorldPublicGate verifyOnMount><WorldPublicLegalDocumentVersion {...props} /></WorldPublicGate>;
}
