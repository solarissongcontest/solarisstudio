import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  Calculator,
  ClipboardCheck,
  Globe2,
  ListChecks,
  ListOrdered,
  RadioTower,
  Scale,
  Settings2,
  Trophy,
  Users,
  Vote,
} from "lucide-react";

import {
  AdminCard,
  AdminCardHeader,
  AdminEmptyState,
  AdminPageHeader,
  AdminProgress,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { Route as EditionFeatureRoute } from "@/features/admin/edition/AdminEditionRoute";
import { editionLabel, useEdition, useParticipants, useShows } from "@/lib/data";
import {
  hasAnyPublicInformation,
  resolveAutomaticEditionStatus,
  resolveShowPublication,
} from "@/lib/publication";

const featureOptions = EditionFeatureRoute.options as any;
const AdminEditionComponent = featureOptions.component;
const editionHead = featureOptions.head;

type EditionSearch = {
  advanced?: boolean;
};

export const Route = createFileRoute("/_authenticated/admin/$slug")({
  component: AdminEditionWorkspace,
  head: editionHead,
  validateSearch: (search: Record<string, unknown>): EditionSearch => ({
    advanced: search.advanced === true || search.advanced === "true" ? true : undefined,
  }),
});

function AdminEditionWorkspace() {
  const { slug } = Route.useParams();
  const search = Route.useSearch();

  if (search.advanced) {
    return (
      <div className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] p-2.5">
          <Link to="/admin/$slug" params={{ slug }} search={{}} className="admin-action-secondary !min-h-10">← Edition home</Link>
          <div className="flex flex-wrap gap-2">
            <Link to="/admin/shows/$slug" params={{ slug }} className="admin-action-secondary !min-h-10"><ListChecks className="size-4" /> Shows</Link>
            <Link to="/admin/entries/$slug" params={{ slug }} className="admin-action-secondary !min-h-10"><ListOrdered className="size-4" /> Entries</Link>
            <Link to="/admin/jury/$slug" params={{ slug }} className="admin-action-secondary !min-h-10"><Scale className="size-4" /> Jury</Link>
            <Link to="/admin/televote/$slug" params={{ slug }} className="admin-action-secondary !min-h-10"><BarChart3 className="size-4" /> Televote totals</Link>
            <Link to="/admin/voting-system/$slug" params={{ slug }} className="admin-action-secondary !min-h-10"><Calculator className="size-4" /> Voting system</Link>
            <Link to="/admin/publication/$slug" params={{ slug }} className="admin-action-secondary !min-h-10"><Globe2 className="size-4" /> Publication</Link>
            <Link to="/admin/design/$slug" params={{ slug }} className="admin-action-secondary !min-h-10"><RadioTower className="size-4" /> Design & broadcast</Link>
          </div>
        </div>
        <div className="admin-legacy-studio min-w-0"><AdminEditionComponent /></div>
      </div>
    );
  }

  return <EditionHome slug={slug} />;
}

function EditionHome({ slug }: { slug: string }) {
  const { data: edition, isLoading } = useEdition(slug);
  const { data: shows = [] } = useShows(edition?.id);
  const { data: participants = [] } = useParticipants(edition?.id);

  if (isLoading) return <p className="py-8 text-center text-sm text-muted-foreground">Loading edition…</p>;

  if (!edition) {
    return <AdminCard><AdminEmptyState icon={Trophy} title="Edition not found" description="This edition may have been removed or the address is no longer valid." action={<Link to="/admin" className="admin-action-secondary">Back to editions</Link>} /></AdminCard>;
  }

  const publicShows = shows.filter((show) => show.published && hasAnyPublicInformation(resolveShowPublication(show)));
  const automaticStatus = shows.length
    ? resolveAutomaticEditionStatus(shows.map((show) => ({ kind: show.kind, published: show.published, publication_config: show.publication_config })))
    : "draft";

  const readinessSignals = [shows.length > 0, participants.length > 0, shows.some((show) => show.kind === "grand-final" || show.kind === "final"), publicShows.length > 0];
  const readiness = Math.round((readinessSignals.filter(Boolean).length / readinessSignals.length) * 100);

  const nextAction = !shows.length
    ? { title: "Create the first show", description: "Start with the semi-finals or Grand Final, then add the participating entries.", destination: "shows" as const }
    : !participants.length
      ? { title: "Add entries", description: "The shows exist, but no entries have been assigned to this edition yet.", destination: "entries" as const }
      : publicShows.length === 0
        ? { title: "Review publication", description: "The edition has content, but nothing from its shows is public yet.", destination: "publication" as const }
        : { title: "Review voting rules", description: "Core edition data is public. Check each show's calculation rules and qualification setup.", destination: "voting" as const };

  const nextActionLink = nextAction.destination === "shows"
    ? <Link to="/admin/shows/$slug" params={{ slug }} className="admin-action-primary !min-h-10">Continue <ArrowRight className="size-4" /></Link>
    : nextAction.destination === "entries"
      ? <Link to="/admin/entries/$slug" params={{ slug }} className="admin-action-primary !min-h-10">Continue <ArrowRight className="size-4" /></Link>
      : nextAction.destination === "publication"
        ? <Link to="/admin/publication/$slug" params={{ slug }} className="admin-action-primary !min-h-10">Continue <ArrowRight className="size-4" /></Link>
        : <Link to="/admin/voting-system/$slug" params={{ slug }} className="admin-action-primary !min-h-10">Continue <ArrowRight className="size-4" /></Link>;

  return (
    <div className="mx-auto max-w-5xl">
      <AdminPageHeader
        eyebrow="Current edition"
        title={editionLabel(edition)}
        description={`${edition.name}${edition.host_city ? ` · ${edition.host_city}` : ""}`}
        actions={<Link to="/admin/$slug" params={{ slug }} search={{ advanced: true }} className="admin-action-secondary"><Settings2 className="size-4" /> Advanced technical studio</Link>}
      />

      <AdminCard strong className="mb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="admin-section-label">Edition readiness</p>
            <p className="mt-2 text-3xl font-bold tracking-[-.04em]">{readiness}%</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Shows, entries, Grand Final setup and public information.</p>
          </div>
          <AdminStatus tone={automaticStatus === "completed" ? "ready" : automaticStatus === "published" ? "info" : readiness >= 50 ? "attention" : "neutral"}>
            {automaticStatus === "completed" ? "Completed" : automaticStatus === "published" ? "Public" : "Draft"}
          </AdminStatus>
        </div>
        <div className="mt-4"><AdminProgress value={readiness} /></div>
      </AdminCard>

      <AdminCard className="mb-4">
        <AdminCardHeader eyebrow="Next action" title={nextAction.title} description={nextAction.description} action={nextActionLink} />
      </AdminCard>

      <div className="mb-4 grid grid-cols-3 gap-2 sm:gap-3">
        <Metric label="Shows" value={shows.length} />
        <Metric label="Entries" value={participants.length} />
        <Metric label="Public" value={publicShows.length} />
      </div>

      <section className="mb-5">
        <p className="admin-section-label mb-2">Edition workspace</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <WorkspaceLink icon={ListChecks} title="Shows" description="Create stages and manage each show's basic setup." to={`/admin/shows/${slug}`} />
          <WorkspaceLink icon={ListOrdered} title="Entries & running order" description="Build line-ups, edit songs and reorder entries." to={`/admin/entries/${slug}`} />
          <WorkspaceLink icon={Scale} title="Jury voting" description="Manage juries and enter complete jury ballots." to={`/admin/jury/${slug}`} />
          <WorkspaceLink icon={BarChart3} title="Televote totals" description="Review or enter the aggregate televote points used by show standings." to={`/admin/televote/${slug}`} />
          <WorkspaceLink icon={Calculator} title="Voting system" description="Configure point scales, weighting, qualifiers and tie-breaks." to={`/admin/voting-system/${slug}`} />
          <WorkspaceLink icon={ClipboardCheck} title="Delegations" description="Confirmation responses, countries and submission rounds." to="/confirmations/admin" />
          <WorkspaceLink icon={Vote} title="Public televoting" description="Public vote rounds, calculated results and integrity review." to="/televoting/admin" />
          <WorkspaceLink icon={RadioTower} title="Design & broadcast" description="Official artwork, theme and broadcast presentation." to={`/admin/design/${slug}`} />
          <WorkspaceLink icon={Globe2} title="Publication" description="Stage what the public can see without editing the underlying contest data." to={`/admin/publication/${slug}`} />
          <WorkspaceLink icon={Settings2} title="Advanced technical studio" description="Legacy specialist controls kept only as a technical fallback while migration finishes." to={`/admin/${slug}?advanced=true`} />
        </div>
      </section>

      <AdminCard>
        <AdminCardHeader eyebrow="Shows" title={shows.length ? `${shows.length} configured` : "No shows yet"} description={shows.length ? "Open a show's line-up directly, or use Shows to change the stage itself." : "Create the first stage without entering the legacy studio."} />
        {shows.length ? (
          <div className="divide-y divide-white/[0.07]">
            {[...shows].sort((a, b) => a.sort_order - b.sort_order).map((show) => {
              const publication = resolveShowPublication(show);
              const isPublic = show.published && hasAnyPublicInformation(publication);
              const count = participants.filter((participant) => participant.show_id === show.id).length;
              return (
                <Link key={show.id} to="/admin/entries/$slug" params={{ slug }} search={{ show: show.id }} className="admin-list-row group">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-muted-foreground group-hover:text-foreground"><ListOrdered className="size-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">{show.name}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{count} {count === 1 ? "entry" : "entries"} · {show.kind.replaceAll("-", " ")}</span>
                  </span>
                  <AdminStatus tone={isPublic ? "ready" : "neutral"}>{isPublic ? "Public" : "Private"}</AdminStatus>
                </Link>
              );
            })}
          </div>
        ) : (
          <AdminEmptyState icon={ListChecks} title="Create the first show" description="Start the contest structure from the mobile Shows workspace." action={<Link to="/admin/shows/$slug" params={{ slug }} className="admin-action-primary">Create show</Link>} />
        )}
      </AdminCard>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="admin-card px-3 py-3 text-center"><p className="numeric text-xl font-bold">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{label}</p></div>;
}

function WorkspaceLink({ icon: Icon, title, description, to }: { icon: typeof Users; title: string; description: string; to: string }) {
  return (
    <Link to={to as any} className="admin-card group flex min-h-28 min-w-0 items-start gap-3 p-3.5 transition hover:border-white/[0.16] hover:bg-white/[0.045]">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-sky-100"><Icon className="size-4" /></span>
      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-foreground">{title}</span><span className="mt-1.5 block text-xs leading-relaxed text-muted-foreground">{description}</span></span>
      <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
    </Link>
  );
}
