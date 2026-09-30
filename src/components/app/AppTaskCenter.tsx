import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Info,
} from "lucide-react";

import { formatCompactCountdown, millisecondsUntil } from "@/lib/solaris-schedule";
import {
  participationTaskCounts,
  sortSolarisTasks,
  taskNeedsAttention,
  type SolarisTask,
} from "@/lib/participation-os";
import { cn } from "@/lib/utils";

function stateIcon(task: SolarisTask) {
  if (task.state === "completed" || task.state === "finished") return CheckCircle2;
  if (task.state === "upcoming" || task.state === "waiting") return Clock3;
  if (task.state === "problem") return AlertTriangle;
  return Info;
}

function exactTiming(task: SolarisTask) {
  const target = task.actionRequired && task.deadline
    ? task.deadline
    : task.opensAt ?? task.deadline;
  if (!target) return null;
  const date = new Date(target);
  if (Number.isNaN(date.getTime())) return null;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const prefix =
    task.actionRequired && task.deadline
      ? "Due"
      : task.opensAt
        ? "Opens"
        : "Closes";
  return {
    dateTime: date.toISOString(),
    label: `${prefix} ${date.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    })}${timezone ? ` · ${timezone}` : ""}`,
  };
}

function timing(task: SolarisTask, now = Date.now()) {
  if (task.actionRequired && task.deadline) {
    const remaining = millisecondsUntil(task.deadline, now);
    if (remaining == null) return null;
    return remaining === 0
      ? "Deadline reached"
      : `Due in ${formatCompactCountdown(remaining)}`;
  }

  if (task.state === "available" && task.deadline) {
    const remaining = millisecondsUntil(task.deadline, now);
    if (remaining == null) return null;
    return remaining === 0
      ? "Closing now"
      : `Closes in ${formatCompactCountdown(remaining)}`;
  }

  const target = task.opensAt ?? task.deadline;
  if (!target) return null;
  const remaining = millisecondsUntil(target, now);
  if (remaining == null) return null;
  return remaining === 0
    ? "Available now"
    : `Opens in ${formatCompactCountdown(remaining)}`;
}

export function AppTaskCenter({
  tasks,
  editionLabel,
}: {
  tasks: readonly SolarisTask[];
  editionLabel?: string | null;
}) {
  const sorted = sortSolarisTasks(tasks);
  const counts = participationTaskCounts(sorted);
  const action = sorted.filter(taskNeedsAttention);
  const next = sorted.filter(
    (task) => task.state === "upcoming" || task.state === "waiting",
  );
  const complete = sorted.filter(
    (task) => task.state === "completed" || task.state === "finished",
  );

  return (
    <section className="space-y-4" data-solaris-app-task-center>
      <header className="solaris-app-task-summary">
        <div className="min-w-0">
          <p className="solaris-app-task-kicker">{editionLabel ?? "Participation"}</p>
          <h2 className="mt-1 text-xl font-black tracking-[-.025em]">
            {counts.needsAction
              ? `${counts.needsAction} thing${counts.needsAction === 1 ? "" : "s"} need your attention`
              : "You’re up to date"}
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {counts.needsAction
              ? "Solaris has put the work that actually needs you first."
              : "Nothing currently requires action. Upcoming windows stay visible below."}
          </p>
        </div>
        <span
          className={cn(
            "solaris-app-task-count",
            counts.needsAction ? "is-attention" : "is-clear",
          )}
          aria-label={`${counts.needsAction} tasks need attention`}
        >
          {counts.needsAction || "✓"}
        </span>
      </header>

      {action.length ? (
        <div className="space-y-2" aria-label="Needs attention">
          {action.map((task) => (
            <AppTaskCard key={task.id} task={task} prominent />
          ))}
        </div>
      ) : (
        <div className="solaris-app-all-clear">
          <CheckCircle2 className="size-5 text-emerald-300" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold">Nothing needs your attention</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Solaris will move a task here automatically when it becomes actionable.
            </p>
          </div>
        </div>
      )}

      {next.length ? (
        <div>
          <p className="solaris-app-task-kicker mb-2">Next</p>
          <div className="space-y-2">
            {next.slice(0, 4).map((task) => (
              <AppTaskCard key={task.id} task={task} />
            ))}
          </div>
        </div>
      ) : null}

      {complete.length ? (
        <details className="solaris-app-task-history">
          <summary>
            Completed <span>{complete.length}</span>
          </summary>
          <div className="mt-2 space-y-2">
            {complete.map((task) => (
              <AppTaskCard key={task.id} task={task} />
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}

export function AppTaskCard({
  task,
  prominent = false,
}: {
  task: SolarisTask;
  prominent?: boolean;
}) {
  const Icon = stateIcon(task);
  const time = timing(task);
  const exact = exactTiming(task);

  return (
    <Link
      to={task.route as any}
      className={cn(
        "solaris-app-task-card",
        prominent && "is-prominent",
        task.state === "problem" && "is-problem",
        (task.state === "completed" || task.state === "finished") && "is-complete",
      )}
    >
      <span className="solaris-app-task-icon">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-semibold">{task.title}</span>
          {time ? <span className="solaris-app-task-time">{time}</span> : null}
        </span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
          {task.description}
        </span>
        {exact ? (
          <time
            dateTime={exact.dateTime}
            className="mt-1 block text-[10px] font-medium text-muted-foreground"
          >
            {exact.label}
          </time>
        ) : null}
        {prominent ? (
          <span className="mt-2 block text-[11px] font-semibold text-primary">
            {task.why}
          </span>
        ) : null}
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}
