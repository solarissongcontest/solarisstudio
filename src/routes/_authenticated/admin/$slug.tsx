import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Ban,
  ClipboardCheck,
  Eye,
  ListChecks,
  ListOrdered,
  RadioTower,
  RefreshCw,
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
import { resolveAutomaticEditionStatus } from "@/lib/publication";

export const Route = createFileRoute("/_authenticated/admin/$slug")({
  component: AdminEditionWorkspace,
  head: ({ params }) => ({
    meta: [
      { title: `${params.slug} Contest — Solaris Organizer` },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function AdminEditionWorkspace() {
  const { slug } = Route.useParams();
  if (!/^ssc-?\d+$/i.test(slug)) return <OrganizerNotFound />;
  return <ContestOverview slug={slug} />;
}

function OrganizerNotFound() {
  return (
    <AdminCard>
      <AdminEmptyState
        icon={Ban}
        title="This Organizer page does not exist"
        description="The link may be outdated or the address may be incomplete. Nothing in the contest was changed."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Link to="/admin/operations" className="admin-action-primary">Organizer Home</Link>
            <Link to="/admin/menu" className="admin-action-secondary">All Organizer tools</Link>
          </div>
        }
      />
    </AdminCard>
  );
}

function ContestOverview({ slug }: { slug: string }) {
  const { data: edition, isLoading } = useEdition(slug);
  const { data: shows = [] } = useShows(edition?.id);
  const { data: participants = [] } = useParticipants(edition?.id);

  if (isLoading) return <p className="py-8 text-center text-sm text-muted-foreground">Loading contest…</p>;

  if (!edition) {
    return (
      <AdminCard>
        <AdminEmptyState
          icon={Trophy}
          title="Edition not found"
          description="This edition may have been removed or the address is no longer valid."
          action={<Link to="/admin/editions" className="admin-action-secondary">Back to editions</Link>}
        />
      </AdminCard>
    );
  }

  const orderedShows = [...shows].sort((a, b) => a.sort_order - b.sort_order);
  const canonicalEntries = participants.filter((participant) => participant.show_id == null);
  const logicalEntries = canonicalEntries.length
    ? canonicalEntries
    : [...new Map(
        participants.map((participant) => [
          participant.contest_entity_id ?? participant.country_id,
          participant,
        ] as const),
      ).values()];
  const showsWithEntries = shows.filter((show) => participants.some((participant) => participant.show_id === show.id));
  const hasGrandFinal = shows.some((show) => show.kind === "grand-final" || show.kind === "final");
  const completeLineups = shows.length > 0 && showsWithEntries.length === shows.length;
  const automaticStatus = shows.length
    ? resolveAutomaticEditionStatus(
        shows.map((show) => ({
          kind: show.kind,
          published: show.published,
          publication_config: show.publication_config,
        })),
      )
    : "draft";

  const readinessSignals = [shows.length > 0, completeLineups, hasGrandFinal];
  const readiness = Math.round((readinessSignals.filter(Boolean).length / readinessSignals.length) * 100);
  const showsWithoutEntries = Math.max(0, shows.length - showsWithEntries.length);

  const nextAction = !shows.length
    ? {
        title: "Create the first show",
        description: "Build the contest structure before assigning countries and entries.",
        to: `/admin/shows/${slug}`,
        label: "Create show",
      }
    : showsWithoutEntries > 0
      ? {
          title: "Finish the line-ups",
          description: `${showsWithoutEntries} ${showsWithoutEntries === 1 ? "show still has" : "shows still have"} no entries assigned.`,
          to: `/admin/entries/${slug}`,
          label: "Open entries",
        }
      : {
          title: "Review allocations and running order",
          description: "All shows have entries. Finish the running orders before moving on to Voting.",
          to: `/admin/entries/${slug}`,
          label: "Review running order",
        };

  return (
    <div className="mx-auto max-w-5xl">
      <AdminPageHeader
        eyebrow="Current edition"
        title={editionLabel(edition)}
        description={`${edition.name}${edition.host_city ? ` · ${edition.host_city}` : ""}. Start with the workspace that matches the job you need to do.`}
      />

      <AdminCard className="mb-4">
        <AdminCardHeader
          eyebrow="Edition workspaces"
          title="Everything for this edition"
          description="Core workflows stay visible here. Specialist tools live inside the relevant workspace instead of being hidden behind Search."
        />
        <div className="divide-y divide-white/[0.07]">
          <WorkspaceRow
            icon={ClipboardCheck}
            title="Delegations & confirmations"
            description="Country readiness, confirmations, responses, submission rounds, calendar and delegation access."
            to="/admin/countries"
            detail="Confirmations live here"
          />
          <WorkspaceRow
            icon={ListChecks}
            title="Contest"
            description="Shows, entries, line-ups, allocation draw, running order and participation status."
            to={`/admin/shows/${slug}`}
            detail="Structure & entries"
          />
          <WorkspaceRow
            icon={Vote}
            title="Voting & results"
            description="Voting rules, juries, televote, integrity checks, calculations, review and results."
            to="/televoting/admin"
            detail="Voting lifecycle"
          />
          <WorkspaceRow
            icon={RadioTower}
            title="Live operations"
            description="Control room, workflows, incidents, rundown and rehearsal tools."
            to="/admin/control-room"
            detail="Run the show"
          />
          <WorkspaceRow
            icon={Eye}
            title="Publish & design"
            description="Public release controls, communications, media, storytelling and broadcast design."
            to={`/admin/publication/${slug}`}
            detail="Release safely"
          />
        </div>
        <details className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.018] p-3">
          <summary className="cursor-pointer text-sm font-semibold text-foreground">More edition tools</summary>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Link to="/admin/hosts" className="admin-action-secondary justify-start">Hosting</Link>
            <Link to="/admin/eligibility" className="admin-action-secondary justify-start">Eligibility</Link>
            <Link to="/admin/media-assets" className="admin-action-secondary justify-start">Media assets</Link>
            <Link to="/admin/communications" className="admin-action-secondary justify-start">Communications</Link>
          </div>
        </details>
      </AdminCard>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
        <AdminCard strong>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="admin-section-label">Contest setup</p>
              <p className="mt-2 text-3xl font-bold tracking-[-.04em]">{readiness}%</p>
              <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
                Shows, complete line-ups and a Grand Final. Voting, publication and broadcast are managed in their own sections.
              </p>
            </div>
            <AdminStatus tone={automaticStatus === "completed" ? "ready" : readiness === 100 ? "ready" : readiness >= 50 ? "attention" : "neutral"}>
              {readiness === 100 ? "Structure ready" : "In setup"}
            </AdminStatus>
          </div>
          <div className="mt-4"><AdminProgress value={readiness} /></div>
        </AdminCard>

        <AdminCard strong>
          <p className="admin-section-label">Edition structure</p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Metric label="Shows" value={shows.length} />
            <Metric label="Entries" value={logicalEntries.length} />
            <Metric label="Filled" value={showsWithEntries.length} />
          </div>
        </AdminCard>
      </div>

      <AdminCard className="mt-4">
        <AdminCardHeader
          eyebrow="Next action"
          title={nextAction.title}
          description={nextAction.description}
          action={
            <Link to={nextAction.to as any} className="admin-action-primary !min-h-10">
              {nextAction.label} <ArrowRight className="size-4" />
            </Link>
          }
        />
      </AdminCard>

      <AdminCard className="mt-4">
        <AdminCardHeader
          eyebrow="Contest workspaces"
          title="Build the edition"
          description="Everything here changes the contest structure. Voting, publishing and broadcast controls stay in their own sections."
        />
        <div className="divide-y divide-white/[0.07]">
          <WorkspaceRow
            icon={ListChecks}
            title="Shows"
            description="Create stages and manage each show's basic setup."
            to={`/admin/shows/${slug}`}
            detail={shows.length ? `${shows.length} configured` : "Start here"}
          />
          <WorkspaceRow
            icon={RefreshCw}
            title="Sync confirmed countries"
            description="Bring confirmed delegation data into a show without manually rebuilding the line-up."
            to={`/admin/lineup-sync/${slug}`}
            detail="Delegations → contest"
          />
          <WorkspaceRow
            icon={ListOrdered}
            title="Entries & running order"
            description="Build line-ups, edit songs, allocate halves and set the running order."
            to={`/admin/entries/${slug}`}
            detail={shows.length ? `${showsWithEntries.length}/${shows.length} filled` : "Waiting for shows"}
          />
          <WorkspaceRow
            icon={Ban}
            title="Participation status"
            description="Mark countries active, withdrawn or disqualified without deleting edition history."
            to={`/admin/participant-status/${slug}`}
            detail="Status & eligibility"
          />
        </div>
      </AdminCard>

      <AdminCard className="mt-4">
        <AdminCardHeader
          eyebrow="Shows"
          title={shows.length ? `${shows.length} configured` : "No shows yet"}
          description={
            shows.length
              ? "Open a show directly in the Entries workspace."
              : "Create the first stage before assigning countries and entries."
          }
        />
        {shows.length ? (
          <div className="divide-y divide-white/[0.07]">
            {orderedShows.map((show) => {
              const count = participants.filter((participant) => participant.show_id === show.id).length;
              return (
                <Link
                  key={show.id}
                  to="/admin/entries/$slug"
                  params={{ slug }}
                  search={{ show: show.id }}
                  className="admin-list-row group"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-muted-foreground group-hover:text-foreground">
                    <ListOrdered className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">{show.name}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {count} {count === 1 ? "entry" : "entries"} · {show.kind.replaceAll("-", " ")}
                    </span>
                  </span>
                  <AdminStatus tone={count ? "neutral" : "attention"}>{count ? "Line-up" : "Needs entries"}</AdminStatus>
                </Link>
              );
            })}
          </div>
        ) : (
          <AdminEmptyState
            icon={ListChecks}
            title="Create the first show"
            description="Start with a semi-final, Grand Final or another contest stage."
            action={<Link to="/admin/shows/$slug" params={{ slug }} className="admin-action-primary">Create show</Link>}
          />
        )}
      </AdminCard>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.018] px-2 py-2.5">
      <p className="numeric text-lg font-bold">{value}</p>
      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function WorkspaceRow({
  icon: Icon,
  title,
  description,
  to,
  detail,
}: {
  icon: typeof Users;
  title: string;
  description: string;
  to: string;
  detail: string;
}) {
  return (
    <Link to={to as any} className="admin-action-row group">
      <span className="admin-action-row-icon"><Icon className="size-4" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{description}</span>
      </span>
      <span className="hidden shrink-0 text-[11px] font-semibold text-sky-100/70 sm:block">{detail}</span>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
    </Link>
  );
}
