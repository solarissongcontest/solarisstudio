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

  if (isLoading) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Loading edition…</p>;
  }

  if (!edition) {
    return (
      <AdminCard>
        <AdminEmptyState
          icon={Trophy}
          title="Edition not found"
          description="This edition may have been removed, or the link may be old."
          action={
            <Link to="/admin" className="admin-action-secondary">
              Back to editions
            </Link>
          }
        />
      </AdminCard>
    );
  }

  const orderedShows = [...shows].sort((a, b) => a.sort_order - b.sort_order);
  const publicShows = shows.filter(
    (show) => show.published && hasAnyPublicInformation(resolveShowPublication(show)),
  );
  const showsWithEntries = shows.filter((show) =>
    participants.some((participant) => participant.show_id === show.id),
  );
  const showsWithReviewedVoting = shows.filter((show) => !!show.voting_config);
  const hasGrandFinal = shows.some((show) => show.kind === "grand-final" || show.kind === "final");
  const automaticStatus = shows.length
    ? resolveAutomaticEditionStatus(
        shows.map((show) => ({
          kind: show.kind,
          published: show.published,
          publication_config: show.publication_config,
        })),
      )
    : "draft";

  const readinessSignals = [
    shows.length > 0,
    shows.length > 0 && showsWithEntries.length === shows.length,
    shows.length > 0 && showsWithReviewedVoting.length === shows.length,
    hasGrandFinal,
    publicShows.length > 0,
  ];
  const readiness = Math.round(
    (readinessSignals.filter(Boolean).length / readinessSignals.length) * 100,
  );

  const showsWithoutEntries = Math.max(0, shows.length - showsWithEntries.length);
  const showsWithoutVotingReview = Math.max(0, shows.length - showsWithReviewedVoting.length);

  const nextAction = !shows.length
    ? {
        title: "Create the first show",
        description: "Start with a semi-final or the Grand Final, then add the entries.",
        destination: "shows" as const,
      }
    : showsWithoutEntries > 0
      ? {
          title: "Finish adding entries",
          description: `${showsWithoutEntries} ${showsWithoutEntries === 1 ? "show still has" : "shows still have"} no entries.`,
          destination: "entries" as const,
        }
      : showsWithoutVotingReview > 0
        ? {
            title: "Check the voting rules",
            description: `${showsWithoutVotingReview} ${showsWithoutVotingReview === 1 ? "show is" : "shows are"} still using voting rules that have not been checked.`,
            destination: "voting" as const,
          }
        : publicShows.length === 0
          ? {
              title: "Choose what visitors can see",
              description: "The edition is set up, but nothing from it is public yet.",
              destination: "publication" as const,
            }
          : {
              title: "Continue with voting",
              description: "The main setup is ready. Add jury votes and televote points as the shows happen.",
              destination: "jury" as const,
            };

  const nextActionLink =
    nextAction.destination === "shows" ? (
      <Link to="/admin/shows/$slug" params={{ slug }} className="admin-action-primary !min-h-10">
        Continue <ArrowRight className="size-4" />
      </Link>
    ) : nextAction.destination === "entries" ? (
      <Link to="/admin/entries/$slug" params={{ slug }} className="admin-action-primary !min-h-10">
        Continue <ArrowRight className="size-4" />
      </Link>
    ) : nextAction.destination === "voting" ? (
      <Link to="/admin/voting-system/$slug" params={{ slug }} className="admin-action-primary !min-h-10">
        Continue <ArrowRight className="size-4" />
      </Link>
    ) : nextAction.destination === "publication" ? (
      <Link to="/admin/publication/$slug" params={{ slug }} className="admin-action-primary !min-h-10">
        Continue <ArrowRight className="size-4" />
      </Link>
    ) : (
      <Link to="/admin/jury/$slug" params={{ slug }} className="admin-action-primary !min-h-10">
        Continue <ArrowRight className="size-4" />
      </Link>
    );

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
            <p className="admin-section-label">How ready is this edition?</p>
            <p className="mt-2 text-3xl font-bold tracking-[-.04em]">{readiness}%</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              This checks shows, entries, voting rules, the Grand Final and what visitors can see.
            </p>
          </div>
          <AdminStatus
            tone={
              automaticStatus === "completed"
                ? "ready"
                : automaticStatus === "published"
                  ? "info"
                  : readiness >= 60
                    ? "attention"
                    : "neutral"
            }
          >
            {automaticStatus === "completed"
              ? "Finished"
              : automaticStatus === "published"
                ? "Public"
                : "Not public yet"}
          </AdminStatus>
        </div>
        <div className="mt-4">
          <AdminProgress value={readiness} />
        </div>
      </AdminCard>

      <AdminCard className="mb-4">
        <AdminCardHeader
          eyebrow="What to do next"
          title={nextAction.title}
          description={nextAction.description}
          action={nextActionLink}
        />
      </AdminCard>

      <div className="mb-5 grid grid-cols-3 gap-2 sm:gap-3">
        <Metric label="Shows" value={shows.length} />
        <Metric label="Entries" value={participants.length} />
        <Metric label="Public shows" value={publicShows.length} />
      </div>

      <PageGroup
        eyebrow="1 · Set up"
        title="Shows and entries"
        status={shows.length ? `${showsWithEntries.length}/${shows.length} shows have entries` : "Not started"}
        statusTone={
          shows.length && showsWithEntries.length === shows.length
            ? "ready"
            : shows.length
              ? "attention"
              : "neutral"
        }
      >
        <PageLink
          icon={ListChecks}
          title="Shows"
          description="Create semi-finals and finals, then set their basic details."
          to={`/admin/shows/${slug}`}
          status={shows.length ? `${shows.length} created` : "Start here"}
        />
        <PageLink
          icon={ListOrdered}
          title="Entries and running order"
          description="Add songs and artists, then put the entries in the right order."
          to={`/admin/entries/${slug}`}
          status={shows.length ? `${showsWithEntries.length}/${shows.length} filled` : "Create shows first"}
        />
      </PageGroup>

      <PageGroup
        eyebrow="2 · Voting"
        title="Voting and points"
        status={
          shows.length
            ? `${showsWithReviewedVoting.length}/${shows.length} voting rules checked`
            : "Create shows first"
        }
        statusTone={
          shows.length && showsWithReviewedVoting.length === shows.length
            ? "ready"
            : shows.length
              ? "attention"
              : "neutral"
        }
      >
        <PageLink
          icon={Calculator}
          title="Voting rules"
          description="Set the point scale, jury and televote balance, qualifiers and tie rules."
          to={`/admin/voting-system/${slug}`}
          status={shows.length ? `${showsWithReviewedVoting.length}/${shows.length} checked` : "No shows"}
        />
        <PageLink
          icon={Scale}
          title="Jury voting"
          description="Choose juries and enter their points."
          to={`/admin/jury/${slug}`}
          status="One show at a time"
        />
        <PageLink
          icon={BarChart3}
          title="Televote points"
          description="See or enter the televote points used for each show."
          to={`/admin/televote/${slug}`}
          status="One show at a time"
        />
      </PageGroup>

      <PageGroup
        eyebrow="3 · Show people"
        title="Design and public pages"
        status={publicShows.length ? `${publicShows.length}/${shows.length} public` : "Nothing public yet"}
        statusTone={publicShows.length ? "info" : "neutral"}
      >
        <PageLink
          icon={RadioTower}
          title="Design and broadcast"
          description="Change the artwork, colours, scoreboard and broadcast look."
          to={`/admin/design/${slug}`}
          status="Design"
        />
        <PageLink
          icon={Globe2}
          title="What visitors can see"
          description="Choose which edition information and results are public."
          to={`/admin/publication/${slug}`}
          status={publicShows.length ? `${publicShows.length} public` : "Private"}
        />
      </PageGroup>

      <PageGroup eyebrow="Other parts" title="Confirmations and public voting" status="Connected" statusTone="neutral">
        <PageLink
          icon={ClipboardCheck}
          title="Delegations"
          description="See country confirmations, responses and confirmation rounds."
          to="/confirmations/admin"
          status="Confirmations"
        />
        <PageLink
          icon={Vote}
          title="Public televoting"
          description="Manage public voting rounds, results and suspicious-vote checks."
          to="/televoting/admin"
          status="Voting"
        />
      </PageGroup>

      <AdminCard>
        <AdminCardHeader
          eyebrow="Shows"
          title={shows.length ? `${shows.length} created` : "No shows yet"}
          description={
            shows.length
              ? "Open a show to work on its entries."
              : "Create the first semi-final or final from the Shows page."
          }
        />
        {shows.length ? (
          <div className="divide-y divide-white/[0.07]">
            {orderedShows.map((show) => {
              const publication = resolveShowPublication(show);
              const isPublic = show.published && hasAnyPublicInformation(publication);
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
                  <AdminStatus tone={isPublic ? "ready" : count ? "neutral" : "attention"}>
                    {isPublic ? "Public" : count ? "Private" : "Needs entries"}
                  </AdminStatus>
                </Link>
              );
            })}
          </div>
        ) : (
          <AdminEmptyState
            icon={ListChecks}
            title="Create the first show"
            description="Start by creating a semi-final or final."
            action={
              <Link to="/admin/shows/$slug" params={{ slug }} className="admin-action-primary">
                Create show
              </Link>
            }
          />
        )}
      </AdminCard>
    </div>
  );
}

function PageGroup({
  eyebrow,
  title,
  status,
  statusTone,
  children,
}: {
  eyebrow: string;
  title: string;
  status: string;
  statusTone: "ready" | "info" | "attention" | "neutral";
  children: React.ReactNode;
}) {
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
  return (
    <div className="admin-card px-3 py-3 text-center">
      <p className="numeric text-xl font-bold">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function PageLink({
  icon: Icon,
  title,
  description,
  to,
  status,
}: {
  icon: typeof Users;
  title: string;
  description: string;
  to: string;
  status: string;
}) {
  return (
    <Link
      to={to as any}
      className="admin-card group flex min-h-24 min-w-0 items-start gap-3 p-3.5 transition hover:border-white/[0.16] hover:bg-white/[0.045]"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-sky-100">
        <Icon className="size-4" />
      </span>
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
