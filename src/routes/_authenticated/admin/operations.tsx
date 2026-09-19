import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Eye,
  Layers3,
  RadioTower,
  ShieldAlert,
  Trophy,
  Vote,
} from "lucide-react";
import { useMemo } from "react";

import { useAdminContext } from "@/components/admin/AdminContext";
import { AdminPage } from "@/components/admin/AdminShell";
import {
  AdminCard,
  AdminCardHeader,
  AdminEmptyState,
  AdminPageHeader,
  AdminProgress,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { buildEditionReadiness, type AdminIssue } from "@/lib/admin-readiness";
import { useAdminReadinessData } from "@/lib/admin-readiness-data";
import { useAdminNotifications, useMarkNotificationRead } from "@/lib/admin-ops";
import { useAdminOperationalSchedule } from "@/lib/admin-schedule";
import { editionLabel, useAllShows, useEditions } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/admin/operations")({
  head: () => ({
    meta: [
      { title: "Home — Solaris Organizer" },
      { name: "robots", content: "noindex" },
      {
        name: "description",
        content: "See what needs attention, what is coming up and the state of the current Solaris edition.",
      },
    ],
  }),
  component: OrganizerHome,
});

function OrganizerHome() {
  const { editionId } = useAdminContext();
  const { data: editions = [] } = useEditions();
  const { data: shows = [] } = useAllShows();

  const activeEdition = useMemo(() => {
    const ordered = [...editions].sort(
      (a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1),
    );
    return ordered.find((edition) => edition.id === editionId) ?? ordered[0] ?? null;
  }, [editions, editionId]);

  const { data: readinessData, isLoading: readinessLoading } = useAdminReadinessData(
    activeEdition?.id,
  );
  const {
    data: schedule = [],
    isError: scheduleError,
  } = useAdminOperationalSchedule(activeEdition?.id ?? null, activeEdition?.slug ?? null);
  const { data: notifications = [] } = useAdminNotifications();
  const markRead = useMarkNotificationRead();

  const readiness = useMemo(
    () =>
      activeEdition
        ? buildEditionReadiness({
            edition: activeEdition,
            shows,
            participants: readinessData?.participants ?? [],
            voters: readinessData?.voters ?? [],
            juryVotes: readinessData?.juryVotes ?? [],
            juryBallotStatuses: readinessData?.juryBallotStatuses ?? [],
            televotes: readinessData?.televotes ?? [],
            results: readinessData?.results ?? [],
          })
        : null,
    [activeEdition, shows, readinessData],
  );

  const upcoming =
    schedule.find((item) => new Date(item.at).getTime() >= Date.now()) ?? null;
  const unread = notifications.filter((item) => !item.read_at);
  const unresolvedInbox = notifications.filter((item) => !item.resolved_at);
  const issues = readiness?.issues ?? [];
  const topIssues = issues.slice(0, 4);

  return (
    <AdminPage>
      <div className="mx-auto max-w-5xl">
        <AdminPageHeader
          eyebrow="Home"
          title="Solaris Organizer"
          description="What needs attention, what is coming up and where to continue. Everything else stays out of the way until you need it."
        />

        {!activeEdition ? (
          <AdminCard>
            <AdminEmptyState
              icon={Trophy}
              title="No current edition"
              description="Choose or create an edition before starting contest operations."
              action={
                <Link to="/admin" className="admin-action-primary">
                  Manage editions
                </Link>
              }
            />
          </AdminCard>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-[1.25fr_.75fr]">
              <AdminCard strong>
                <AdminCardHeader
                  eyebrow="Do now"
                  title={
                    readinessLoading
                      ? "Checking the edition…"
                      : issues.length
                        ? `${issues.length} ${issues.length === 1 ? "item needs" : "items need"} attention`
                        : "Nothing is blocking the edition"
                  }
                  description="Only actionable edition problems appear here. Each item opens the place where it can be fixed."
                  action={
                    <Link to="/admin/action-center" className="text-xs font-semibold text-sky-100">
                      Action Center →
                    </Link>
                  }
                />

                {readinessLoading ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Checking current edition state…
                  </p>
                ) : topIssues.length ? (
                  <div className="divide-y divide-white/[0.07]">
                    {topIssues.map((issue) => (
                      <IssueLink key={issue.id} issue={issue} slug={activeEdition.slug} />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-emerald-200/10 bg-emerald-200/[0.045] p-4">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-200" />
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        Current automated checks have no blocking edition issue.
                      </p>
                    </div>
                  </div>
                )}

                {issues.length > topIssues.length ? (
                  <Link
                    to={`/admin/${activeEdition.slug}` as any}
                    className="admin-action-secondary mt-3"
                  >
                    Review all {issues.length} edition items <ArrowRight className="size-4" />
                  </Link>
                ) : null}
              </AdminCard>

              <div className="space-y-4">
                <AdminCard>
                  <AdminCardHeader
                    eyebrow="Inbox"
                    title={unresolvedInbox.length ? `${unresolvedInbox.length} need attention` : "All caught up"}
                    description={unread.length ? `${unread.length} unseen · unresolved work stays here after it is read.` : "Complaints, appeals, beta feedback and connected administrative events."}
                    action={
                      <Link to="/admin/inbox" className="text-xs font-semibold text-sky-100">
                        View Inbox →
                      </Link>
                    }
                  />
                  {unresolvedInbox.length ? (
                    <div className="divide-y divide-white/[0.07]">
                      {unresolvedInbox.slice(0, 3).map((item) =>
                        item.href ? (
                          <Link
                            key={item.id}
                            to={item.href as any}
                            onClick={() => markRead.mutate(item.id)}
                            className="admin-list-row"
                          >
                            <Bell className="size-4 shrink-0 text-sky-100" />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold text-foreground">
                                {item.title}
                              </span>
                              {item.body ? (
                                <span className="mt-1 block line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                                  {item.body}
                                </span>
                              ) : null}
                            </span>
                            <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                          </Link>
                        ) : (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => markRead.mutate(item.id)}
                            className="admin-list-row w-full text-left"
                          >
                            <Bell className="size-4 shrink-0 text-sky-100" />
                            <span className="min-w-0 flex-1 text-sm font-semibold text-foreground">
                              {item.title}
                            </span>
                          </button>
                        ),
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No unresolved Inbox items.</p>
                  )}
                </AdminCard>

                <AdminCard>
                  <AdminCardHeader
                    eyebrow="Upcoming"
                    title={
                      scheduleError
                        ? "Schedule unavailable"
                        : upcoming?.label ?? "Nothing scheduled"
                    }
                    description={
                      scheduleError
                        ? "Solaris could not verify the operational schedule."
                        : upcoming
                          ? `${upcoming.detail} · ${new Date(upcoming.at).toLocaleString()}`
                          : "There are no upcoming workflow dates for this edition."
                    }
                  />
                  <Link
                    to={(upcoming?.href ?? "/admin/system") as any}
                    className="admin-action-secondary w-full"
                  >
                    <Clock3 className="size-4" />
                    {upcoming
                      ? upcoming.source === "reminder"
                        ? "Open reminder"
                        : "Open workflow"
                      : "Open schedule"}
                  </Link>
                </AdminCard>
              </div>
            </div>

            <AdminCard className="mt-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="admin-section-label">Current edition</p>
                  <h2 className="mt-1 text-xl font-bold tracking-[-.03em]">
                    {editionLabel(activeEdition)}
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">{activeEdition.name}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="min-w-28">
                    <p className="mb-1 text-[10px] font-semibold text-muted-foreground">
                      Readiness {readinessLoading ? "…" : `${readiness?.progress ?? 0}%`}
                    </p>
                    <AdminProgress value={readiness?.progress ?? 0} />
                  </div>
                  <AdminStatus
                    tone={
                      readiness?.status === "ready"
                        ? "ready"
                        : readiness?.status === "blocked"
                          ? "blocked"
                          : "attention"
                    }
                  >
                    {readinessLoading
                      ? "Checking"
                      : readiness?.status === "ready"
                        ? "Ready"
                        : readiness?.status === "blocked"
                          ? "Blocked"
                          : "Needs attention"}
                  </AdminStatus>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                <QuickLink
                  to="/admin/countries"
                  icon={ClipboardCheck}
                  label="Delegations"
                  detail="Confirmations, countries & access"
                />
                <QuickLink
                  to={`/admin/shows/${activeEdition.slug}`}
                  icon={Layers3}
                  label="Contest"
                  detail="Shows, entries & running order"
                />
                <QuickLink
                  to="/televoting/admin"
                  icon={Vote}
                  label="Voting & results"
                  detail="Jury, televote & official results"
                />
                <QuickLink
                  to="/admin/control-room"
                  icon={RadioTower}
                  label="Live"
                  detail="Operations, incidents & rundown"
                />
                <QuickLink
                  to={`/admin/publication/${activeEdition.slug}`}
                  icon={Eye}
                  label="Publish"
                  detail="Release, comms & design"
                />
              </div>
            </AdminCard>
          </>
        )}
      </div>
    </AdminPage>
  );
}

function IssueLink({ issue, slug }: { issue: AdminIssue; slug: string }) {
  const critical = issue.severity === "critical";
  return (
    <Link to={issueHref(slug, issue)} className="admin-list-row group">
      <span
        className={`grid size-9 shrink-0 place-items-center rounded-xl border ${
          critical
            ? "border-rose-200/15 bg-rose-200/[0.055] text-rose-100"
            : "border-amber-200/15 bg-amber-200/[0.05] text-amber-100"
        }`}
      >
        {critical ? <ShieldAlert className="size-4" /> : <AlertTriangle className="size-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">{issue.title}</span>
        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{issue.detail}</span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
    </Link>
  );
}

function issueHref(slug: string, issue: AdminIssue) {
  const base = areaHref(slug, issue.area);
  if (!issue.showId || issue.area === "setup") return base;
  return `${base}?show=${encodeURIComponent(issue.showId)}` as any;
}

function areaHref(slug: string, area: string) {
  if (area === "setup") return `/admin/shows/${slug}` as any;
  if (area === "entries") return `/admin/entries/${slug}` as any;
  if (area === "jury") return `/admin/jury/${slug}` as any;
  if (area === "televote") return `/admin/televote/${slug}` as any;
  return `/admin/publication/${slug}` as any;
}

function QuickLink({
  to,
  icon: Icon,
  label,
  detail,
}: {
  to: string;
  icon: typeof Vote;
  label: string;
  detail: string;
}) {
  return (
    <Link
      to={to as any}
      className="rounded-xl border border-white/[0.07] bg-white/[0.022] p-3 transition hover:border-white/[0.14] hover:bg-white/[0.04]"
    >
      <Icon className="size-4 text-sky-100" />
      <span className="mt-3 block text-sm font-semibold">{label}</span>
      <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">{detail}</span>
    </Link>
  );
}

function humanize(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
