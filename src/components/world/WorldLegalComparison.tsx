import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRightLeft, BookOpen, FileDiff, Search } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import {
  comparePublicWorldVersions,
  parsePublicWorldAccessProof,
  parsePublicWorldArchive,
  parsePublicWorldDocumentVersion,
  validateComparisonPair,
  worldLegalSlug,
  type PublicWorldArchive,
  type PublicWorldDocumentVersion,
  type PublicWorldVersion,
  type WorldProvisionDifference,
} from "@/lib/world-document-comparison";

const QUERY_POLICY = {
  // Document publication may be withdrawn. Never render an old cached preview
  // while access is being revalidated, and never retry against hosted production.
  staleTime: 0,
  gcTime: 0,
  retry: false as const,
  refetchOnMount: "always" as const,
  refetchOnWindowFocus: true,
};

type ComparisonSearch = {
  organization: string;
  document: string;
  from: number | null;
  to: number | null;
};

function Panel({ title, detail, onRetry }: { title: string; detail: string; onRetry?: () => void }) {
  return <section role={onRetry ? "alert" : "status"} className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
    <h2 className="text-lg font-semibold text-foreground">{title}</h2>
    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{detail}</p>
    {onRetry ? <button type="button" onClick={onRetry} className="mt-4 min-h-11 rounded-lg border border-border px-4 font-semibold hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">Retry</button> : null}
  </section>;
}

function Loading({ title }: { title: string }) {
  return <div role="status" aria-live="polite" className="space-y-3">
    <span className="sr-only">{title}</span>
    <div aria-hidden="true" className="h-5 w-1/3 animate-pulse rounded bg-muted" />
    <div aria-hidden="true" className="h-20 w-full animate-pulse rounded-xl bg-muted/80" />
    <div aria-hidden="true" className="h-20 w-full animate-pulse rounded-xl bg-muted/80" />
  </div>;
}

function DocumentPicker({ organization, document, submit }: {
  organization: string;
  document: string;
  submit: (organization: string, document: string) => void;
}) {
  const [org, setOrg] = useState(organization);
  const [doc, setDoc] = useState(document);
  const valid = worldLegalSlug(org.trim()) && worldLegalSlug(doc.trim());
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (valid) submit(org.trim(), doc.trim());
  }
  return <form onSubmit={handleSubmit} className="mb-9 grid items-end gap-3 border-y border-border py-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
    <label className="block text-sm font-semibold">
      Organization slug
      <input
        name="organization"
        value={org}
        onChange={(event) => setOrg(event.target.value)}
        placeholder="guard"
        autoCapitalize="none"
        spellCheck={false}
        required
        maxLength={100}
        className="mt-2 block min-h-12 w-full rounded-xl border border-border bg-surface px-4 text-foreground outline-none focus:ring-2 focus:ring-primary"
      />
    </label>
    <label className="block text-sm font-semibold">
      Document slug
      <input
        name="document"
        value={doc}
        onChange={(event) => setDoc(event.target.value)}
        placeholder="charter"
        autoCapitalize="none"
        spellCheck={false}
        required
        maxLength={100}
        className="mt-2 block min-h-12 w-full rounded-xl border border-border bg-surface px-4 text-foreground outline-none focus:ring-2 focus:ring-primary"
      />
    </label>
    <button type="submit" disabled={!valid} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 font-semibold text-primary-foreground disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
      <Search className="size-4" aria-hidden="true" /> Open history
    </button>
    {!valid && (org || doc) ? <p className="text-sm text-muted-foreground sm:col-span-3">Enter lowercase organization and document slugs, using letters, numbers and hyphens only.</p> : null}
  </form>;
}

async function getArchive(organization: string, document: string): Promise<PublicWorldArchive | null> {
  // TG4's archive RPC is permission-aware, but may legitimately expose
  // member/private history to authorized accounts. This is a PUBLIC screen:
  // require an exact visibility proof before asking for the archive at all.
  const { data: visibility, error: visibilityError } = await (supabase as any).rpc(
    "world_get_document_v1",
    { p_organization_slug: organization, p_document_slug: document, p_version_number: null },
  );
  if (visibilityError) throw visibilityError;
  const publicId = parsePublicWorldAccessProof(visibility, organization, document);
  if (publicId === null) return null;

  const { data, error } = await (supabase as any).rpc("world_get_document_archive_v1", {
    p_organization_slug: organization, p_document_slug: document,
  });
  if (error) throw error;
  const archive = parsePublicWorldArchive(data, organization, document);
  if (archive && archive.documentId !== publicId) {
    throw new Error("Document history no longer matches the verified public document");
  }
  return archive;
}

async function getVersion(
  organization: string,
  document: string,
  archive: PublicWorldArchive,
  chosen: PublicWorldVersion,
): Promise<PublicWorldDocumentVersion> {
  const { data, error } = await (supabase as any).rpc("world_get_document_v1", {
    p_organization_slug: organization,
    p_document_slug: document,
    p_version_number: chosen.number,
  });
  if (error) throw error;
  const parsed = parsePublicWorldDocumentVersion(
    data, organization, document, chosen.number, archive.documentId,
  );
  // A version correction or publication change between the archive and the
  // detail requests must not yield a mixed snapshot.
  if (chosen.contentHash !== parsed.version.contentHash) {
    throw new Error("Document changed while preparing comparison");
  }
  return parsed;
}

function VersionChoice({
  label, value, versions, onChange,
}: {
  label: string;
  value: number;
  versions: PublicWorldVersion[];
  onChange: (value: number) => void;
}) {
  return <label className="block text-sm font-semibold">
    {label}
    <select
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className="mt-2 min-h-12 w-full rounded-xl border border-border bg-surface px-4 text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
    >
      {versions.map((version) =>
        <option key={version.number} value={version.number}>
          Version {version.number} · {version.title}
        </option>)}
    </select>
  </label>;
}

function VersionSummary({ title, version }: { title: string; version: PublicWorldVersion }) {
  return <div className="border-t border-border py-4">
    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
    <p className="mt-2 text-lg font-semibold">{version.title}</p>
    <p className="mt-1 text-sm text-muted-foreground">Version {version.number} · {version.publicationState.replaceAll("_", " ")}</p>
    {version.effectiveFrom ? <p className="mt-1 text-sm text-muted-foreground">Effective from {version.effectiveFrom.slice(0, 10)}</p> : null}
  </div>;
}

function Difference({ change }: { change: WorldProvisionDifference }) {
  const title = change.after?.title || change.before?.title || change.key;
  const label = change.after?.label || change.before?.label;
  return <article className="border-t border-border py-7">
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <span className="rounded-full border border-border px-3 py-1 text-xs font-bold uppercase tracking-wide">{change.kind}</span>
      <h3 className="min-w-0 text-lg font-semibold">{label ? label + " · " : ""}{title}</h3>
    </div>
    <div className="grid gap-5 md:grid-cols-2">
      <div className="min-w-0">
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Earlier wording</p>
        {change.before ? <div className="rounded-xl border border-border bg-muted/30 p-4">
          <p className="text-xs font-semibold text-muted-foreground">{change.before.status}</p>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7">{change.before.text || "No text in this provision."}</p>
        </div> : <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Provision did not exist.</p>}
      </div>
      <div className="min-w-0">
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Later wording</p>
        {change.after ? <div className="rounded-xl border border-border bg-muted/30 p-4">
          <p className="text-xs font-semibold text-muted-foreground">{change.after.status}</p>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7">{change.after.text || "No text in this provision."}</p>
        </div> : <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Provision is absent in this version.</p>}
      </div>
    </div>
  </article>;
}

function Results({ older, newer }: { older: PublicWorldDocumentVersion; newer: PublicWorldDocumentVersion }) {
  const [showUnchanged, setShowUnchanged] = useState(false);
  const changes = useMemo(() => comparePublicWorldVersions(older, newer), [older, newer]);
  const visible = showUnchanged ? changes : changes.filter((change) => change.kind !== "unchanged");
  const counts = {
    added: changes.filter((change) => change.kind === "added").length,
    removed: changes.filter((change) => change.kind === "removed").length,
    modified: changes.filter((change) => change.kind === "modified").length,
    unchanged: changes.filter((change) => change.kind === "unchanged").length,
  };
  return <section aria-labelledby="legal-comparison-results">
    <h2 id="legal-comparison-results" className="mb-4 text-2xl font-bold tracking-tight">{older.title}</h2>
    <div className="mb-5 grid gap-4 sm:grid-cols-2">
      <VersionSummary title="Earlier" version={older.version} />
      <VersionSummary title="Later" version={newer.version} />
    </div>
    <div className="mb-6 flex flex-wrap gap-4 border-y border-border py-4 text-sm" role="status" aria-live="polite">
      <span><strong className="tabular-nums">{counts.added}</strong> added</span>
      <span><strong className="tabular-nums">{counts.modified}</strong> amended</span>
      <span><strong className="tabular-nums">{counts.removed}</strong> removed</span>
      <span><strong className="tabular-nums">{counts.unchanged}</strong> unchanged</span>
    </div>
    <label className="mb-6 inline-flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
      <input type="checkbox" checked={showUnchanged} onChange={(event) => setShowUnchanged(event.target.checked)} className="size-4 accent-primary" />
      Include unchanged provisions
    </label>
    {visible.length ? visible.map((change) => <Difference key={change.key} change={change} />)
      : <Panel title="No changes in these versions" detail="The semantic provisions and their official text are identical across the selected versions." />}
  </section>;
}

function ComparisonBody({
  organization, document, from, to, navigateVersion,
}: {
  organization: string; document: string; from: number | null; to: number | null;
  navigateVersion: (from: number, to: number) => void;
}) {
  const archiveQuery = useQuery({
    queryKey: ["v3", "world", "legal-archive", organization, document],
    queryFn: () => getArchive(organization, document),
    ...QUERY_POLICY,
  });
  const archive = !archiveQuery.isFetching && !archiveQuery.isError ? archiveQuery.data : null;
  const versions = archive?.versions ?? [];
  // Explicit deep-linked version numbers are authoritative inputs. Never
  // silently substitute another version if a requested number disappears.
  const earlier = from == null ? versions[0] : versions.find((v) => v.number === from);
  const later = to == null ? versions[versions.length - 1] : versions.find((v) => v.number === to);
  const pairValid = !!archive && !!earlier && !!later &&
    validateComparisonPair(archive, earlier.number, later.number);

  const earlierQuery = useQuery({
    queryKey: ["v3", "world", "legal-before", organization, document, earlier?.number],
    enabled: pairValid && !archiveQuery.isFetching,
    queryFn: () => getVersion(organization, document, archive!, earlier!),
    ...QUERY_POLICY,
  });
  const laterQuery = useQuery({
    queryKey: ["v3", "world", "legal-after", organization, document, later?.number],
    enabled: pairValid && !archiveQuery.isFetching,
    queryFn: () => getVersion(organization, document, archive!, later!),
    ...QUERY_POLICY,
  });

  if (archiveQuery.isFetching || archiveQuery.isPending) return <Loading title="Verifying public document history" />;
  if (archiveQuery.isError) return <Panel title="History unavailable" detail="The institutional archive could not be verified. No historical text was restored from a stale cache." onRetry={() => void archiveQuery.refetch()} />;
  if (!archive) return <Panel title="Document not found" detail="This document does not have a public archive at the supplied address." />;
  if (versions.length < 2) return <Panel title="Not enough public versions" detail="At least two published or historical-source versions are required for comparison. Drafts remain unavailable." />;
  if (!earlier || !later) return (
    <Panel title="Historical version unavailable"
      detail="One of the requested version numbers is not present in the published archive. Choose another version or return to the document reader." />
  );

  return <>
    <div className="mb-7 grid items-end gap-4 sm:grid-cols-[1fr_1fr_auto]">
      <VersionChoice label="Earlier version" value={earlier.number} versions={versions}
        onChange={(value) => navigateVersion(value, later.number)} />
      <VersionChoice label="Later version" value={later.number} versions={versions}
        onChange={(value) => navigateVersion(earlier.number, value)} />
      <span className="flex min-h-12 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold">
        <ArrowRightLeft className="mr-2 size-4" aria-hidden="true" /> Compare
      </span>
    </div>
    {!pairValid ? <Panel title="Select chronological versions" detail="Choose an earlier version on the left and a later version on the right." /> : null}
    {pairValid && (earlierQuery.isFetching || laterQuery.isFetching ||
      earlierQuery.isPending || laterQuery.isPending) ? <Loading title="Verifying both published versions" /> : null}
    {pairValid && (earlierQuery.isError || laterQuery.isError) ? (
      <Panel title="Comparison unavailable" detail="One of the public versions could not be verified. No stale or unpublished text is displayed."
        onRetry={() => { void earlierQuery.refetch(); void laterQuery.refetch(); }} />
    ) : null}
    {pairValid && !earlierQuery.isFetching && !laterQuery.isFetching &&
      !earlierQuery.isError && !laterQuery.isError &&
      earlierQuery.data && laterQuery.data ? (
        !earlierQuery.data.provisions.length || !laterQuery.data.provisions.length
          ? <Panel title="Published text unavailable" detail="The selected historical version has no comparable public text. Its legal content has not been invented or inferred." />
          : <Results key={organization + document + earlier.number + later.number} older={earlierQuery.data} newer={laterQuery.data} />
      ) : null}
  </>;
}

export function WorldLegalComparisonScreen({ search }: { search: ComparisonSearch }) {
  const navigate = useNavigate();
  const valid = worldLegalSlug(search.organization) && worldLegalSlug(search.document);
  const navigateVersion = (from: number, to: number) => {
    void navigate({
      to: "/world/legal-compare",
      search: { organization: search.organization, document: search.document, from, to },
    });
  };

  return <AppShell>
    <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
      <header className="mb-8 max-w-3xl">
        <Link to="/countries" className="mb-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary hover:underline"><BookOpen className="size-4" aria-hidden="true" /> Terra Solaris countries</Link>
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">World / Institutional records</p>
        <h1 className="mt-2 flex items-center gap-3 text-3xl font-bold tracking-tight sm:text-4xl"><FileDiff className="size-8 shrink-0 text-primary" aria-hidden="true" /> Compare legal versions</h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground">
          Review how an institution's published document changed, provision by provision. Only publicly available historical versions are eligible. This is a textual comparison, not a legal interpretation.
        </p>
      </header>
      <DocumentPicker
        key={search.organization + "/" + search.document}
        organization={search.organization}
        document={search.document}
        submit={(organization, document) => void navigate({
          to: "/world/legal-compare", search: { organization, document, from: null, to: null },
        })}
      />
      {!valid ? (
        <Panel title="Select a public document" detail="Enter an organization's slug and an official document slug. Then choose two published historical versions. No data is requested until the identifiers are valid." />
      ) : <ComparisonBody organization={search.organization} document={search.document}
          from={search.from} to={search.to} navigateVersion={navigateVersion} />}
    </div>
  </AppShell>;
}
