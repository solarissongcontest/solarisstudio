import {
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  ListChecks,
  MailOpen,
  Vote,
} from "lucide-react";

import { Link } from "@tanstack/react-router";

import { Panel } from "@/components/AppShell";
import { OfficialAnnouncementFeed } from "@/components/OfficialAnnouncementFeed";
import { useMySolaris } from "@/components/mysolaris/MySolarisContext";
import { editionLabel } from "@/lib/data";
import { NAV_TARGETS } from "@/lib/navigation-targets";
import {
  isUpcomingPriority,
  type MySolarisPriorityItem,
} from "@/lib/my-solaris-priorities";

/**
 * Task-first MySolaris home summary.
 *
 * Detailed workflows stay on their canonical routes; Home only surfaces the
 * things that deserve attention and the nearest upcoming deadlines.
 */
export function MySolarisOperationsPanel() {
  const {
    currentEdition,
    taskCounts,
    priorities,
    isLoading,
  } = useMySolaris();

  const attentionItems = priorities
    .filter(
      (item) =>
        item.actionRequired ||
        item.severity === "critical" ||
        item.severity === "high",
    )
    .slice(0, 5);
  const upcomingDeadlines = priorities
    .filter((item) => isUpcomingPriority(item))
    .slice(0, 3);
  const hasAttention = attentionItems.length > 0;

  return (
    <div className="space-y-4">
      <OfficialAnnouncementFeed surface="mysolaris_home" />

      <section className="grid gap-4 xl:grid-cols-[1.12fr_.88fr]">
        <Panel
          title="Needs attention"
          description={
            isLoading
              ? "Checking your current edition…"
              : hasAttention
                ? `${taskCounts.needsAction} action${taskCounts.needsAction === 1 ? "" : "s"} currently need your delegation.`
                : "Nothing currently needs action from your delegation."
          }
        >
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading delegation priorities…</p>
          ) : hasAttention ? (
            <div className="space-y-2">
              {attentionItems.map((item) => (
                <PriorityLink key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-300/15 bg-emerald-300/[0.055] p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-300" />
                <div>
                  <p className="text-sm font-semibold">You are caught up</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    MySolaris will surface entry, voting, deadline and acknowledgement work here as
                    soon as something requires you.
                  </p>
                </div>
              </div>
            </div>
          )}
        </Panel>

        <Panel
          title="Upcoming"
          description={
            currentEdition
              ? `${editionLabel(currentEdition)} · nearest current-edition deadlines`
              : "Nearest current-edition deadlines"
          }
          actions={
            <Link to={NAV_TARGETS.mySolarisTasks} className="text-xs font-semibold text-primary">
              All tasks →
            </Link>
          }
        >
          {upcomingDeadlines.length ? (
            <div className="divide-y divide-border/60">
              {upcomingDeadlines.map((item) => (
                <Link
                  key={item.id}
                  to={item.to as any}
                  search={item.search as any}
                  className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <CalendarClock className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{item.title}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {priorityDeadlineLabel(item)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No current-edition deadlines are waiting for your delegation.
            </p>
          )}
        </Panel>
      </section>

      <Panel
        title="Edition tools"
        description="Open a focused workspace when you need to do the work, rather than turning Home into every editor at once."
      >
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <ToolLink to={NAV_TARGETS.mySolarisTasks} icon={ListChecks} label="Tasks" />
          <ToolLink
            to={NAV_TARGETS.mySolarisEntry}
            icon={ClipboardCheck}
            label="Entry readiness"
            search={{ view: "readiness" }}
          />
          <ToolLink to={NAV_TARGETS.mySolarisVoting} icon={Vote} label="Voting" />
          <ToolLink to={NAV_TARGETS.mySolarisNotices} icon={MailOpen} label="Notices" />
        </div>
      </Panel>
    </div>
  );
}

function PriorityLink({ item }: { item: MySolarisPriorityItem }) {
  const Icon =
    item.kind === "notice"
      ? MailOpen
      : item.kind === "entry"
        ? ClipboardCheck
        : item.kind === "deadline"
          ? CalendarClock
          : ListChecks;

  return (
    <Link
      to={item.to as any}
      search={item.search as any}
      className="flex min-h-16 items-start gap-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.045] p-3 transition hover:border-amber-300/30 hover:bg-amber-300/[0.07]"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-300/10 text-amber-200">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">{item.title}</span>
          {item.actionRequired ? (
            <span className="rounded-full border border-amber-300/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-[.08em] text-amber-200">
              Action required
            </span>
          ) : null}
        </span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
          {item.description}
        </span>
      </span>
    </Link>
  );
}

function ToolLink({
  to,
  icon: Icon,
  label,
  search,
}: {
  to: string;
  icon: typeof ListChecks;
  label: string;
  search?: Record<string, string>;
}) {
  return (
    <Link
      to={to as any}
      search={search as any}
      className="flex min-h-12 items-center gap-3 rounded-xl border border-border/70 bg-surface/65 px-3 text-sm font-semibold transition hover:border-primary/25 hover:bg-surface-strong"
    >
      <Icon className="size-4 shrink-0 text-primary" />
      <span>{label}</span>
    </Link>
  );
}

function priorityDeadlineLabel(item: MySolarisPriorityItem) {
  if (!item.deadline) return item.description;
  const parsed = new Date(item.deadline);
  if (Number.isNaN(parsed.getTime())) return item.description;

  const label = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
  return `${item.description} · ${label}`;
}
