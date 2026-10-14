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
  AdminStatus,
} from "@/components/admin/AdminUI";
import { useAdminNotifications, useMarkNotificationRead } from "@/lib/admin-ops";
import { useAdminOperationalSchedule } from "@/lib/admin-schedule";
import { editionLabel, useEditions } from "@/lib/data";
import type { OrganizerTaskV5 } from "@/lib/admin-tasks-v5";
import { useV3OrganizerProjection } from "@/lib/v3-organizer-projection.query";

export const Route = createFileRoute("/_authenticated/admin/operations")({
  head: () => ({
    meta: [
      { title: "Home — Solaris Organizer" },
      { name: "robots", content: "noindex" },
      {
        name: "description",
        content:
          "See what needs attention, what is coming up and the state of the current Solaris edition.",
      },
    ],
  }),
  component: OrganizerHome,
});

function OrganizerHome() {
  const { editionId } = useAdminContext();
  const { data: editions = [] } = useEditions();

  const activeEdition = useMemo(() => {
    const ordered = [...editions].sort(
      (a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1),
    );
    return ordered.find((edition) => edition.id === editionId) ?? ordered[0] ?? null;
  }, [editions, editionId]);

  const projectionQuery = useV3OrganizerProjection(activeEdition?.id);
  const projection = projectionQuery.data ?? null;
  const { data: schedule = [], isError: scheduleError } = useAdminOperationalSchedule(
    activeEdition?.id ?? null,
    activeEdition?.slug ?? null,
  );
  const { data: notifications = [] } = useAdminNotifications();
  const markRead = useMarkNotificationRead();

  const upcoming = schedule.find((item) => new Date(item.at).getTime() >= Date.now()) ?? null;
  const unread = notifications.filter((item) => !item.read_at);
  const unresolvedInbox = notifications.filter((item) => item.requires_action && !item.resolved_at);
  const topTasks = projection?.tasks.top ?? [];

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
                    projectionQuery.isLoading
                      ? "Evaluating authoritative work…"
                      : projectionQuery.error
                        ? "Organizer state unavailable"
                        : projection?.tasks.total
                          ? `${projection.tasks.total} ${projection.tasks.total === 1 ? "task needs" : "tasks need"} attention`
                          : "No unresolved Organizer tasks"
                  }
                  description="This queue is projected from canonical domain state. Reading a notification never resolves the underlying work."
                  action={
                    <Link
                      to="/admin/tasks"
                      search={{ filter: "all" }}
                      className="text-xs font-semibold text-sky-100"
                    >
                      Tasks →
                    </Link>
                  }
                />

                {projectionQuery.isLoading ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Evaluating canonical Organizer task and live state…
                  </p>
                ) : projectionQuery.error ? (
                  <div className="rounded-xl border border-amber-200/15 bg-amber-200/[0.045] p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-100" />
                      <div>
                        <p className="text-sm font-semibold text-foreground">Solaris could not verify Organizer state</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {projectionQuery.error instanceof Error
                            ? projectionQuery.error.message
                            : "The canonical Organizer projection is temporarily unavailable."}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : topTasks.length ? (
                  <div className="divide-y divide-white/[0.07]">
                    {topTasks.map((task) => (
                      <TaskLink key={task.id} task={task} />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-emerald-200/10 bg-emerald-200/[0.045] p-4">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-200" />
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        The canonical Organizer Task Engine currently reports no unresolved work for this edition.
                      </p>
                    </div>
                  </div>
                )}

                {projection && projection.tasks.total > topTasks.length ? (
                  <Link
                    to="/admin/tasks"
                    search={{ filter: "all" }}
                    className="admin-action-secondary mt-3"
                  >
                    Review all {projection.tasks.total} tasks <ArrowRight className="size-4" />
                  </Link>
                ) : null}
              </AdminCard>

              <div className="space-y-4">
                <AdminCard>
                  <AdminCardHeader
                    eyebrow="Notifications"
                    title={
                      unresolvedInbox.length
                        ? `${unresolvedInbox.length} need attention`
                        : "All caught up"
                    }
                    description={
                      unread.length
                        ? `${unread.length} unseen · unresolved work stays here after it is read.`
                        : "Complaints, appeals, beta feedback and connected administrative events."
                    }
                    action={
                      <Link to="/admin/inbox" className="text-xs font-semibold text-sky-100">
                        Open notifications →
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
                    <p className="text-sm text-muted-foreground">
                      No unresolved notification items.
                    </p>
                  )}
                </AdminCard>

                <AdminCard>
                  <AdminCardHeader
                    eyebrow="Upcoming"
                    title={
                      scheduleError
                        ? "Schedule unavailable"
                        : (upcoming?.label ?? "Nothing scheduled")
                    }
                    description={
                      scheduleError
                        ? "Solaris could not verify the operational schedule."
                        : upcoming
                          ? `${upcoming.detail} · ${new Date(upcoming.at).toLocaleString()}`
                          : "There are no upcoming workflow dates for this edition."
                    }
                  />
                  {upcoming && !upcoming.href ? (
                    <span
                      aria-disabled="true"
                      title="Select an edition first"
                      className="admin-action-secondary w-full cursor-not-allowed opacity-55"
                    >
                      <Clock3 className="size-4" />
                      Select an edition first
                    </span>
                  ) : (
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
                  )}
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
                  {projection ? (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      {humanize(projection.live.editionState)} · live health {projection.live.overallHealth}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {projection ? (
                    <>
                      <span className="rounded-full border border-white/[0.08] px-3 py-1.5 text-[10px] text-muted-foreground">
                        {projection.tasks.critical} critical
                      </span>
                      <span className="rounded-full border border-white/[0.08] px-3 py-1.5 text-[10px] text-muted-foreground">
                        {projection.tasks.high} high
                      </span>
                      <AdminStatus
                        tone={
                          projection.risk === "critical"
                            ? "blocked"
                            : projection.risk === "elevated"
                              ? "attention"
                              : "ready"
                        }
                      >
                        {projection.risk === "critical"
                          ? "Critical attention"
                          : projection.risk === "elevated"
                            ? "Needs attention"
                            : "Operationally clear"}
                      </AdminStatus>
                    </>
                  ) : (
                    <AdminStatus tone="neutral">
                      {projectionQuery.isLoading ? "Checking" : "Unavailable"}
                    </AdminStatus>
                  )}
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

function TaskLink({ task }: { task: OrganizerTaskV5 }) {
  const critical = task.priority === "critical";
  return (
    <Link to={task.href as any} className="admin-list-row group">
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
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{task.title}</span>
          {task.state === "waiting" ? <AdminStatus tone="info">Waiting</AdminStatus> : null}
        </span>
        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
          {task.description}
        </span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
    </Link>
  );
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
