import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { FileText, RefreshCw } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { WorldPublicGate } from "@/components/world/WorldPublic";
import { readPublicLegalDocuments } from "@/lib/world-public-legal-archive";

export function WorldPublicLegalDocuments() {
  const query = useQuery({
    queryKey: ["world", "public", "legal-documents"],
    queryFn: () => readPublicLegalDocuments(),
    retry: false,
  });
  return (
    <AppShell>
      <main className="mx-auto max-w-5xl px-4 py-8 pb-28 sm:px-6 lg:py-12">
        <Link to="/world" className="text-sm font-semibold text-primary hover:underline">Terra Solaris</Link>
        <header className="mt-6 space-y-3">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <FileText className="size-4" aria-hidden="true" /> Official documents
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Institutional legal record</h1>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            Published charters, rulebooks and treaties from recognized Terra Solaris institutions.
            Draft and private documents are excluded by the server.
          </p>
        </header>
        {query.isPending ? <p role="status" className="mt-8">Checking the official document directory…</p> :
          query.isError ? <section role="alert" className="mt-8 space-y-3 border-t border-destructive/40 pt-5">
            <h2 className="text-lg font-semibold">Documents unavailable</h2>
            <p className="text-sm text-muted-foreground">The official directory could not be verified.</p>
            <button type="button" onClick={() => void query.refetch()} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold">
              <RefreshCw className="size-4" aria-hidden="true" /> Retry
            </button>
          </section> :
          <ul className="mt-8 divide-y divide-border border-y border-border">
            {(query.data ?? []).map((document) => <li key={document.organizationSlug + "/" + document.documentSlug} className="py-5">
              <Link to="/world/documents/$organization/$document/archive"
                params={{ organization: document.organizationSlug, document: document.documentSlug }}
                search={{ before: null }}
                className="group block focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{document.organizationName} · {document.documentType}</p>
                <h2 className="mt-1 text-xl font-semibold group-hover:underline">{document.title}</h2>
                <p className="mt-1 text-sm capitalize text-muted-foreground">{document.documentStatus} · Permanent version history</p>
              </Link>
            </li>)}
          </ul>}
      </main>
    </AppShell>
  );
}

export function WorldPublicLegalDocumentsPage() {
  return <WorldPublicGate verifyOnMount><WorldPublicLegalDocuments /></WorldPublicGate>;
}
