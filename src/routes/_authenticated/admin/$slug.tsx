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
  RefreshCw,
  Scale,
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
import { editionLabel, useEdition, useParticipants, useShows } from "@/lib/data";
import {
  hasAnyPublicInformation,
  resolveAutomaticEditionStatus,
  resolveShowPublication,
} from "@/lib/publication";

export const Route = createFileRoute("/_authenticated/admin/$slug")({
  component: AdminEditionWorkspace,
  head: ({ params }) => ({
    meta: [
      { title: `${params.slug} Organizer — Solaris Studio` },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function AdminEditionWorkspace() {
  const { slug } = Route.useParams();
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

  const orderedShows = [...shows].sort((a, b) => a.sort_order - b.sort_order);
  const publicShows = shows.filter((show) => show.published && hasAnyPublicInformation(resolveShowPublication(show)));
  const showsWithEntries = shows.filter((show) => participants.some((participant) => participant.show_id === show.id));
  const showsWithReviewedVoting = shows.filter((show) => !!show.voting_config);
  const hasGrandFinal = shows.some((show) => show.kind === "grand-final" || show.kind === "final");
  const automaticStatus = shows.length
    ? resolveAutomaticEditionStatus(shows.map((show) => ({ kind: show.kind, published: show.published, publication_config: show.publication_config })))
    : "draft";

  const readinessSignals = [
    shows.length > 0,
    shows.length > 0 && showsWithEntries.length === shows.length,
    shows.length > 0 && showsWithReviewedVoting.length === shows.length,
    hasGrandFinal,
    publicShows.length > 0,
  ];
  const readiness = Math.round((readinessSignals.filter(Boolean).length / readinessSignals.length) * 100);

  const showsWithoutEntries = Math.max(0, shows.length - showsWithEntries.length);
  const showsWithoutVotingReview = Math.max(0, shows.length - showsWithReviewedVoting.length);

  const nextAction = !shows.length
    ? { title: "Create the first show", description: "Start with the semi-finals or Grand Final, then build the line-ups.", destination: "shows" as const }
    : showsWithoutEntries > 0
      ? { title: "Finish the line-ups", description: `${showsWithoutEntries} ${showsWithoutEntries === 1 ? "show still has" : "shows still have"} no entries assigned.`, destination: "entries" as const }
      : showsWithoutVotingReview > 0
        ? { title: "Review voting rules", description: `${showsWithoutVotingReview} ${showsWithoutVotingReview === 1 ? "show is" : "shows are"} still using unreviewed default voting rules.`, destination: "voting" as const }
        : publicShows.length === 0
          ? { title: "Plan the public release", description: "The structure is ready, but nothing from the edition is public yet.", destination: "publication" as const }
          : { title: "Run show voting", description: "Core setup is in place. Continue with jury ballots and televote totals as the shows progress.", destination: "jury" as const };

  const nextActionLink = nextAction.destination === "shows"
    ? <Link to="/admin/shows/$slug" params={{ slug }} className="admin-action-primary !min-h-10">Continue <ArrowRight className="size-4" /></Link>
    : nextAction.destination === "entries"
      ? <Link to="/admin/entries/$slug" params={{ slug }} className="admin-action-primary !min-h-10">Continue <ArrowRight className="size-4" /></Link>
      : nextAction.destination === "voting"
        ? <Link to="/admin/voting-system/$slug" params={{ slug }} className="admin-action-primary !min-h-10">Continue <ArrowRight className="size-4" /></Link>
        : nextAction.destination === "publication"
          ? <Link to="/admin/publication/$slug" params={{ slug }} className="admin-action-primary !min-h-10">Continue <ArrowRight className="size-4" /></Link>
          : <Link to="/admin/jury/$slug" params={{ slug }} className="admin-action-primary !min-h-10">Continue <ArrowRight className="size-4" /></Link>;

  return (
    <div className="mx-auto max-w-5xl">
      <AdminPageHeader
        eyebrow="Current edition"
        title={editionLabel(edition)}
        description={`${edition.name}${edition.host_city ? ` · ${edition.host_city}` : ""}`}
      />

      <AdminCard strong className="mb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="admin-section-label">Setup readiness</p>
            <p className="mt-2 text-3xl font-bold tracking-[-.04em]">{readiness}%</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Structure, complete line-ups, reviewed voting rules, Grand Final and public release.</p>
          </div>
          <AdminStatus tone={automaticStatus === "completed" ? "ready" : automaticStatus === "published" ? "info" : readiness >= 60 ? "attention" : "neutral"}>
            {automaticStatus === "completed" ? "Completed" : automaticStatus === "published" ? "Public" : "Draft"}
          </AdminStatus>
        </div>
        <div className="mt-4"><AdminProgress value={readiness} /></div>
      </AdminCard>

      <AdminCard className="mb-4">
        <AdminCardHeader eyebrow="Next action" title={nextAction.title} description={nextAction.description} action={nextActionLink} />
      </AdminCard>

      <div className="mb-5 grid grid-cols-3 gap-2 sm:gap-3">
        <Metric label="Shows" value={shows.length} />
        <Metric label="Entries" value={participants.length} />
        <Metric label="Public" value={publicShows.length} />
      </div>

      <WorkflowGroup
        eyebrow="1 · Build"
        title="Contest structure"
        status={shows.length ? `${showsWithEntries.length}/${shows.length} line-ups` : "Not started"}
        statusTone={shows.length && showsWithEntries.length === shows.length ? "ready" : shows.length ? "attention" : "neutral"}
      >
        <WorkspaceLink icon={ListChecks} title="Shows" description="Create stages and manage each show's basic setup." to={`/admin/shows/${slug}`} status={shows.length ? `${shows.length} configured` : "Start here"} />
        <WorkspaceLink icon={RefreshCw} title="Sync confirmed countries" description="Add confirmed edition countries to any show in one click. Their canonical song and listening links come with them." to={`/admin/lineup-sync/${slug}`} status="Bulk line-ups" />
        <WorkspaceLink icon={ListOrdered} title="Entries & running order" description="Build line-ups, edit songs and reorder entries." to={`/admin/entries/${slug}`} status={shows.length ? `${showsWithEntries.length}/${shows.length} filled` : "Waiting for shows"} />
      </WorkflowGroup>

      <WorkflowGroup
        eyebrow="2 · Score"
        title="Voting & results inputs"
        status={shows.length ? `${showsWithReviewedVoting.length}/${shows.length} rules reviewed` : "Waiting for shows"}
        statusTone={shows.length && showsWithReviewedVoting.length === shows.length ? "ready" : shows.length ? "attention" : "neutral"}
      >
        <WorkspaceLink icon={Calculator} title="Voting system" description="Configure point scales, weighting, qualifiers and tie-breaks." to={`/admin/voting-system/${slug}`} status={shows.length ? `${showsWithReviewedVoting.length}/${shows.length} reviewed` : "No shows"} />
        <WorkspaceLink icon={Scale} title="Jury voting" description="Manage juries and enter complete jury ballots." to={`/admin/jury/${slug}`} status="Show by show" />
        <WorkspaceLink icon={BarChart3} title="Televote totals" description="Review aggregate televote points used by show standings." to={`/admin/televote/${slug}`} status="Show by show" />
      </WorkflowGroup>

      <WorkflowGroup
        eyebrow="3 · Present"
        title="Broadcast & release"
        status={publicShows.length ? `${publicShows.length}/${shows.length} public` : "Private"}
        statusTone={publicShows.length ? "info" : "neutral"}
      >
        <WorkspaceLink icon={RadioTower} title="Design & broadcast" description="Official artwork, theme, scoreboard and broadcast presentation." to={`/admin/design/${slug}`} status="Presentation" />
        <WorkspaceLink icon={Globe2} title="Publication" description="Stage what the public can see without changing the contest data." to={`/admin/publication/${slug}`} status={publicShows.length ? `${publicShows.length} public` : "Private"} />
      </WorkflowGroup>

      <WorkflowGroup eyebrow="Services" title="Participation systems" status="Connected tools" statusTone="neutral">
        <WorkspaceLink icon={ClipboardCheck} title="Delegations" description="Confirmation responses, countries and submission rounds." to="/confirmations/admin" status="Confirmations" />
        <WorkspaceLink icon={Vote} title="Public televoting" description="Public vote rounds, calculated results and integrity review." to="/televoting/admin" status="Vote service" />
      </WorkflowGroup>

      <AdminCard>
        <AdminCardHeader eyebrow="Shows" title={shows.length ? `${shows.length} configured` : "No shows yet"} description={shows.length ? "Jump directly into a show's line-up. Specialist show controls remain available from the Shows workspace." : "Create the first stage from the Shows workspace."} />
        {shows.length ? (
          <div className="divide-y divide-white/[0.07]">
            {orderedShows.map((show) => {
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
                  <AdminStatus tone={isPublic ? "ready" : count ? "neutral" : "attention"}>{isPublic ? "Public" : count ? "Private" : "Needs entries"}</AdminStatus>
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

function WorkflowGroup({ eyebrow, title, status, statusTone, children }: { eyebrow: string; title: string; status: string; statusTone: "ready" | "info" | "attention" | "neutral"; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <div className="mb-2 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="admin-section-label">{eyebrow}</p>
          <h2 className="mt-1 text-sm font-bold text-foreground">{title}</h2>
        </div>
        <AdminStatus tone={statusTone}>{status}</AdminStatus>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="admin-card px-3 py-3 text-center"><p className="numeric text-xl font-bold">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{label}</p></div>;
}

function WorkspaceLink({ icon: Icon, title, description, to, status }: { icon: typeof Users; title: string; description: string; to: string; status: string }) {
  return (
    <Link to={to as any} className="admin-card group flex min-h-24 min-w-0 items-start gap-3 p-3.5 transition hover:border-white/[0.16] hover:bg-white/[0.045]">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-sky-100"><Icon className="size-4" /></span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-start justify-between gap-2">
          <span className="block min-w-0 text-sm font-semibold text-foreground">{title}</span>
          <span className="shrink-0 text-[10px] font-medium text-muted-foreground">{status}</span>
        </span>
        <span className="mt-1.5 block text-xs leading-relaxed text-muted-foreground">{description}</span>
      </span>
      <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
    </Link>
  );
}
