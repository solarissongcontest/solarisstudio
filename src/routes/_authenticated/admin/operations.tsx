import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Flag,
  RadioTower,
  ShieldAlert,
  Trophy,
  Users,
  Vote,
} from "lucide-react";
import { useMemo } from "react";

import { AdminContextProvider, useAdminContext } from "@/components/admin/AdminContext";
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
import {
  useAdminDeadlines,
  useAdminNotifications,
  useMarkNotificationRead,
} from "@/lib/admin-ops";
import { editionLabel, useAllParticipants, useAllShows, useCountries, useEditions } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/admin/operations")({
  head: () => ({
    meta: [
      { title: "Overview — Solaris Organizer" },
      { name: "robots", content: "noindex" },
      {
        name: "description",
        content: "See what is ready, what is missing and what to do next for the current Solaris Song Contest edition.",
      },
    ],
  }),
  component: OrganizerOverview,
});

function OrganizerOverview() {
  const { editionId } = useAdminContext();
  const { data: editions = [] } = useEditions();
  const { data: countries = [] } = useCountries();
  const { data: shows = [] } = useAllShows();
  const { data: allParticipants = [] } = useAllParticipants();

  const activeEdition = useMemo(() => {
    const ordered = [...editions].sort(
      (a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1),
    );
    return ordered.find((edition) => edition.id === editionId) ?? ordered[0] ?? null;
  }, [editions, editionId]);

  const { data: readinessData, isLoading: readinessLoading } = useAdminReadinessData(
    activeEdition?.id,
  );
  const { data: deadlines = [] } = useAdminDeadlines(activeEdition?.id ?? null);
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

  const openDeadlines = [...deadlines]
    .filter((item) => !item.completed_at)
    .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());
  const upcoming = openDeadlines[0] ?? null;
  const unread = notifications.filter((item) => !item.read_at);
  const issues = readiness?.issues ?? [];
  const topIssues = issues.slice(0, 6);

  return (
    <AdminPage>
      <div className="mx-auto max-w-5xl">
        <AdminPageHeader
          eyebrow="Overview"
          title={activeEdition ? editionLabel(activeEdition) : "Solaris Studio"}
          description={
            activeEdition
              ? `${activeEdition.name} · see what is ready, what needs fixing and what to do next.`
              : "Choose or create an edition to start."
          }
          actions={
            activeEdition ? (
              <Link to={`/admin/${activeEdition.slug}` as any} className="admin-action-secondary">
                Open edition <ArrowRight className="size-4" />
              </Link>
            ) : null
          }
        />

        {!activeEdition ? (
          <AdminCard>
            <AdminEmptyState
              icon={Trophy}
              title="No edition selected"
              description="Choose an existing edition or create a new one first."
              action={
                <Link to="/admin" className="admin-action-primary">
                  Manage editions
                </Link>
              }
            />
          </AdminCard>
        ) : (
          <>
            <AdminCard strong className="mb-4">
              <div className="flex min-w-0 items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="admin-section-label">How ready is this edition?</p>
                  <p className="numeric mt-2 text-3xl font-bold tracking-[-.04em]">
                    {readinessLoading ? "…" : `${readiness?.progress ?? 0}%`}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    This checks the setup, entries, jury votes, televote, results and what is public.
                  </p>
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
                        ? "Cannot continue"
                        : "Needs attention"}
                </AdminStatus>
              </div>
              <div className="mt-4">
                <AdminProgress value={readiness?.progress ?? 0} />
              </div>
            </AdminCard>

            <div className="grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
              <AdminCard>
                <AdminCardHeader
                  eyebrow="What to do next"
                  title={
                    readinessLoading
                      ? "Checking the edition…"
                      : issues.length
                        ? `${issues.length} ${issues.length === 1 ? "thing needs" : "things need"} attention`
                        : "Nothing important is missing"
                  }
                  description="The most important items are first. Open one to go to the page where you can fix it."
                />

                {readinessLoading ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">Checking what is ready…</p>
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
                        All current checks pass. You can keep working on the edition normally.
                      </p>
                    </div>
                  </div>
                )}

                {issues.length > topIssues.length ? (
                  <details className="mt-3 rounded-xl border border-white/[0.07] bg-white/[0.018] p-3">
                    <summary className="cursor-pointer text-sm font-semibold text-muted-foreground hover:text-foreground">
                      Show {issues.length - topIssues.length} more item
                      {issues.length - topIssues.length === 1 ? "" : "s"}
                    </summary>
                    <div className="mt-3 divide-y divide-white/[0.07]">
                      {issues.slice(topIssues.length).map((issue) => (
                        <IssueLink key={issue.id} issue={issue} slug={activeEdition.slug} />
                      ))}
                    </div>
                  </details>
                ) : null}
              </AdminCard>

              <div className="space-y-4">
                <AdminCard>
                  <AdminCardHeader
                    eyebrow="Checks"
                    title="By area"
                    description="Open an area to see what still needs work."
                  />
                  <div className="grid grid-cols-2 gap-2">
                    {(readiness?.areas ?? []).map((area) => (
                      <Link
                        key={area.key}
                        to={areaHref(activeEdition.slug, area.key)}
                        className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3 transition hover:bg-white/[0.045]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-foreground">{area.label}</p>
                          <AdminStatus
                            tone={
                              area.status === "complete"
                                ? "ready"
                                : area.status === "critical"
                                  ? "blocked"
                                  : "attention"
                            }
                          >
                            {area.status === "complete"
                              ? "Ready"
                              : area.status === "critical"
                                ? "Fix first"
                                : "Check"}
                          </AdminStatus>
                        </div>
                      </Link>
                    ))}
                  </div>
                </AdminCard>

                <AdminCard>
                  <AdminCardHeader
                    eyebrow="Next deadline"
                    title={upcoming?.label ?? "Nothing scheduled"}
                    description={
                      upcoming
                        ? `${humanize(upcoming.kind)} · ${new Date(upcoming.due_at).toLocaleString()}`
                        : "There are no unfinished deadlines for this edition."
                    }
                  />
                  <Link to="/admin/system" className="admin-action-secondary w-full">
                    <Clock3 className="size-4" /> Manage deadlines
                  </Link>
                </AdminCard>

                <AdminCard>
                  <AdminCardHeader
                    eyebrow="Messages"
                    title={unread.length ? `${unread.length} unread` : "All caught up"}
                    description="Important organizer messages appear here."
                  />
                  {unread.length ? (
                    <div className="divide-y divide-white/[0.07]">
                      {unread.slice(0, 3).map((item) =>
                        item.href ? (
                          <Link
                            key={item.id}
                            to={item.href as any}
                            onClick={() => markRead.mutate(item.id)}
                            className="admin-list-row"
                          >
                            <Bell className="size-4 shrink-0 text-sky-100" />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold text-foreground">{item.title}</span>
                              {item.body ? (
                                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
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
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold text-foreground">{item.title}</span>
                              {item.body ? (
                                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                                  {item.body}
                                </span>
                              ) : null}
                            </span>
                            <AdminStatus tone="info">Mark as read</AdminStatus>
                          </button>
                        ),
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No unread messages.</p>
                  )}
                </AdminCard>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <QuickLink to="/confirmations/admin" icon={ClipboardCheck} label="Delegations" detail="Confirmations" />
              <QuickLink to="/televoting/admin" icon={Vote} label="Voting" detail="Rounds and vote checks" />
              <QuickLink
                to={`/admin/design/${activeEdition.slug}`}
                icon={RadioTower}
                label="Broadcast"
                detail="Design and show"
              />
              <QuickLink to="/admin/more" icon={Flag} label="More" detail="Other organizer pages" />
            </div>
          </>
        )}

        <AdminCard className="mt-4">
          <AdminCardHeader title="All contests at a glance" />
          <div className="grid grid-cols-3 gap-3 text-center">
            <ArchiveStat icon={Trophy} label="Editions" value={editions.length} />
            <ArchiveStat icon={Users} label="Countries" value={countries.length} />
            <ArchiveStat icon={Flag} label="Entries" value={allParticipants.length} />
          </div>
        </AdminCard>
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
      className="admin-card flex min-h-28 flex-col justify-between p-3 transition hover:border-white/[0.15] hover:bg-white/[0.045]"
    >
      <span className="grid size-9 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-sky-100">
        <Icon className="size-4" />
      </span>
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        <span className="mt-1 block text-[11px] text-muted-foreground">{detail}</span>
      </span>
    </Link>
  );
}

function ArchiveStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Trophy;
  label: string;
  value: number;
}) {
  return (
    <div>
      <Icon className="mx-auto size-4 text-muted-foreground" />
      <p className="numeric mt-2 text-xl font-bold">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
