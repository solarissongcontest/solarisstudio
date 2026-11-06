import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { FileText, Search, ArrowLeft, ShieldCheck } from "lucide-react";
import {
  getWorldMeasureDetail, listWorldMeasures, listWorldMeasureOrganizations,
  type WorldMeasureDetail, type WorldMeasureListItem,
} from "@/lib/world-measure-commands";

function Failure({ retry }: { retry: () => void }) {
  return <section role="alert" className="rounded-xl border border-destructive/40 p-5">
    <h2 className="text-lg font-semibold">Official records could not be verified</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      Nothing unverified is displayed. Check your connection and retry.
    </p>
    <button type="button" onClick={retry}
      className="mt-4 min-h-11 rounded-lg border px-4 text-sm font-semibold">Retry</button>
  </section>;
}
function InstitutionKicker({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-[0.13em] text-muted-foreground">{children}</p>;
}
function MeasureRow({ measure }: { measure: WorldMeasureListItem }) {
  return <Link to="/world/measures/$measureId" params={{ measureId: measure.id }}
    className="group block border-b border-border/70 py-5 last:border-0 focus-visible:rounded-lg focus-visible:outline focus-visible:outline-2">
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span className="font-mono">{measure.identifier}</span>
      <span aria-hidden="true">·</span>
      <span>{measure.organizationSlug.toUpperCase()}</span>
      <span aria-hidden="true">·</span>
      <span className="capitalize">{measure.state.replaceAll("_", " ")}</span>
    </div>
    <h2 className="mt-2 text-base font-semibold group-hover:underline sm:text-lg">{measure.title}</h2>
    {measure.summary ? <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">
      {measure.summary}
    </p> : null}
    <p className="mt-2 text-xs text-muted-foreground">
      {measure.organName} · Sponsored by {measure.sponsorCountryCode}
    </p>
  </Link>;
}
export function WorldMeasuresDirectory() {
  const [organizationSlug, setOrganizationSlug] = useState("");
  const [term, setTerm] = useState("");
  const organizations = useQuery({
    queryKey: ["world", "measures", "organizations"],
    queryFn: listWorldMeasureOrganizations, retry: false, staleTime: 90_000,
  });
  const measures = useQuery({
    queryKey: ["world", "measures", "public", organizationSlug],
    queryFn: () => listWorldMeasures(organizationSlug || null),
    retry: false, staleTime: 30_000,
  });
  const filtered = (measures.data ?? []).filter((measure) =>
    [measure.identifier, measure.title, measure.summary ?? "", measure.sponsorCountryCode]
      .some((part) => part.toLocaleLowerCase().includes(term.trim().toLocaleLowerCase())));
  return <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-5 sm:px-6 sm:pt-9">
    <InstitutionKicker>Terra Solaris · Institutional records</InstitutionKicker>
    <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Proposals and measures</h1>
    <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
      Registered, officially published institutional proposals. Unregistered drafts,
      private procedural review and unpublished wording are never listed.
    </p>
    <div className="mt-5 flex flex-wrap items-center gap-3">
      <Link to="/world/measures/new" className="inline-flex min-h-11 items-center rounded-lg border border-primary px-4 text-sm font-semibold">
        Submit a measure
      </Link>
      <Link to="/world/organizations" className="inline-flex min-h-11 items-center rounded-lg border px-4 text-sm">
        Organizations
      </Link>
    </div>
    <section aria-label="Measure filters" className="mt-8 grid gap-3 sm:grid-cols-2">
      <label className="block text-sm font-medium">
        Institution
        <select value={organizationSlug} onChange={(e) => setOrganizationSlug(e.target.value)}
          className="mt-2 min-h-11 w-full rounded-lg border border-border bg-background px-3">
          <option value="">All published institutions</option>
          {(organizations.data ?? []).map((o) =>
            <option value={o.slug} key={o.id}>{o.shortName}</option>)}
        </select>
      </label>
      <label className="block text-sm font-medium">
        Search published proposals
        <span className="relative mt-2 block">
          <Search aria-hidden="true" className="absolute left-3 top-3.5 size-4 text-muted-foreground" />
          <input value={term} onChange={(e) => setTerm(e.target.value)}
            maxLength={120} className="min-h-11 w-full rounded-lg border border-border bg-background pl-10 pr-3"
            placeholder="Identifier, title or sponsor" />
        </span>
      </label>
    </section>
    {organizations.isError ? <p role="status" className="mt-3 text-sm text-muted-foreground">
      Institution filter unavailable. The bounded public list remains available.
    </p> : null}
    <section className="mt-7" aria-live="polite">
      {measures.isPending ? <p role="status" className="py-8">Loading published records…</p> :
        measures.isError ? <Failure retry={() => void measures.refetch()} /> :
        filtered.length === 0 ? <div className="border-t border-border py-8">
          <h2 className="font-semibold">No published measures match</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Try another institution or search term. Drafts are not public.
          </p>
        </div> : <>
          <p className="border-b border-border pb-3 text-xs text-muted-foreground">
            Showing {filtered.length} of up to 50 latest published measures
          </p>
          {filtered.map((measure) => <MeasureRow key={measure.id} measure={measure} />)}
        </>}
    </section>
  </main>;
}
export function WorldMeasureDetailPage({ measureId }: { measureId: string }) {
  const detail = useQuery({
    queryKey: ["world", "measures", "public-detail", measureId],
    queryFn: () => getWorldMeasureDetail(measureId), retry: false,
    staleTime: 30_000,
  });
  const measure: WorldMeasureDetail | null = detail.data ?? null;
  return <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-5 sm:px-6 sm:pt-9">
    <Link to="/world/measures" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium">
      <ArrowLeft className="size-4" /> Published measures
    </Link>
    {detail.isPending ? <p role="status" className="py-10">Verifying official publication…</p> :
      detail.isError ? <Failure retry={() => void detail.refetch()} /> :
      !measure ? <section className="mt-8" role="status">
        <h1 className="text-2xl font-semibold">No published measure found</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          This record may be private, not yet registered, or unavailable.
        </p>
      </section> : <>
        <InstitutionKicker>{measure.organizationSlug.toUpperCase()} · {measure.organName}</InstitutionKicker>
        <p className="mt-3 font-mono text-sm text-muted-foreground">{measure.identifier}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          {measure.currentVersion.title}
        </h1>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <span className="rounded-full border px-3 py-1 capitalize">{measure.state.replaceAll("_", " ")}</span>
          <span className="rounded-full border px-3 py-1">Version {measure.currentVersion.number}</span>
          <span className="rounded-full border px-3 py-1">Sponsor {measure.sponsorCountryCode}</span>
        </div>
        {measure.currentVersion.summary ? <p className="mt-7 max-w-3xl border-l-2 border-primary pl-5 text-base leading-7">
          {measure.currentVersion.summary}
        </p> : null}
        <article className="mt-8 max-w-3xl">
          <div className="mb-5 flex items-center gap-2 text-sm text-muted-foreground">
            <FileText aria-hidden="true" className="size-4" />
            Published formal text
          </div>
          <div className="whitespace-pre-wrap break-words text-base leading-8">
            {measure.currentVersion.text}
          </div>
        </article>
        <footer className="mt-10 max-w-3xl border-t border-border pt-5">
          <div className="flex items-start gap-2">
            <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 text-muted-foreground" />
            <p className="text-xs leading-6 text-muted-foreground">
              Official published revision · Content hash {measure.currentVersion.contentHash}.
              Historical versions remain preserved.
            </p>
          </div>
          {measure.publishedHistory.length > 0 ? <section className="mt-6">
            <h2 className="font-semibold">Published version history</h2>
            <ol className="mt-2 divide-y divide-border">
              {measure.publishedHistory.map((v) =>
                <li className="py-3 text-sm" key={v.id}>
                  Version {v.number} · {v.title}
                  <span className="ml-2 text-muted-foreground">({v.createdAt.slice(0, 10)})</span>
                </li>)}
            </ol>
          </section> : null}
          <Link to="/world/measures/$measureId/manage" params={{ measureId }}
            className="mt-7 inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-semibold">
            Manage this measure (authorized members)
          </Link>
        </footer>
      </>}
  </main>;
}
