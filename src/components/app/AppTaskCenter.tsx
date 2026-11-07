import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Info,
} from "lucide-react";

import {
  exactAppTaskTiming,
  partitionAppTaskCenter,
  relativeAppTaskTiming,
} from "@/lib/app-task-center-model";
import type { SolarisTask } from "@/lib/participation-os";
import { cn } from "@/lib/utils";

function stateIcon(task: SolarisTask) {
  if (task.state === "completed" || task.state === "finished") return CheckCircle2;
  if (task.state === "upcoming" || task.state === "waiting") return Clock3;
  if (task.state === "problem") return AlertTriangle;
  return Info;
}

export function AppTaskCenter({
  tasks,
  editionLabel,
  readOnly = false,
}: {
  tasks: readonly SolarisTask[];
  editionLabel?: string | null;
  readOnly?: boolean;
}) {
  const { needsAttention, next, available, completed } = partitionAppTaskCenter(tasks);
  const needsAction = needsAttention.length;

  return (
    <section className="space-y-4" data-solaris-app-task-center>
      <header className="solaris-app-task-summary">
        <div className="min-w-0">
          <p className="solaris-app-task-kicker">{editionLabel ?? "Participation"}</p>
          <h2 className="mt-1 text-xl font-black tracking-[-.025em]">
            {needsAction
              ? `${needsAction} thing${needsAction === 1 ? "" : "s"} need your attention`
              : "You’re up to date"}
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {needsAction
              ? "Solaris has put the work that actually needs you first."
              : "Nothing currently requires action. Upcoming windows stay visible below."}
          </p>
        </div>
        <span
          className={cn(
            "solaris-app-task-count",
            needsAction ? "is-attention" : "is-clear",
          )}
          aria-label={`${needsAction} tasks need attention`}
        >
          {needsAction || "✓"}
        </span>
      </header>

      {needsAttention.length ? (
        <div className="space-y-2" aria-label="Needs attention">
          {needsAttention.map((task) => (
            <AppTaskCard key={task.id} task={task} prominent readOnly={readOnly} />
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
              <AppTaskCard key={task.id} task={task} readOnly={readOnly} />
            ))}
          </div>
        </div>
      ) : null}

      {available.length ? (
        <div data-solaris-app-available-tasks>
          <p className="solaris-app-task-kicker mb-2">Available now</p>
          <div className="space-y-2">
            {available.map((task) => (
              <AppTaskCard key={task.id} task={task} readOnly={readOnly} />
            ))}
          </div>
        </div>
      ) : null}

      {completed.length ? (
        <details className="solaris-app-task-history">
          <summary>
            Completed <span>{completed.length}</span>
          </summary>
          <div className="mt-2 space-y-2">
            {completed.map((task) => (
              <AppTaskCard key={task.id} task={task} readOnly={readOnly} />
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
  readOnly = false,
}: {
  task: SolarisTask;
  prominent?: boolean;
  readOnly?: boolean;
}) {
  const Icon = stateIcon(task);
  const time = relativeAppTaskTiming(task);
  const exact = exactAppTaskTiming(task);

  const cardClassName = cn(
    "solaris-app-task-card",
    prominent && "is-prominent",
    task.state === "problem" && "is-problem",
    (task.state === "completed" || task.state === "finished") && "is-complete",
  );
  const cardContents = (
    <>
      <span className="solaris-app-task-icon">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-semibold">{task.title}</span>
          {task.state === "available" && task.importance === "optional" ? (
            <span className="text-[10px] font-semibold text-muted-foreground">Optional</span>
          ) : null}
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
      {!readOnly ? (
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      ) : null}
    </>
  );

  // Organizer's delegation inspection is observational. These are the same
  // server-derived statuses, but must not advertise actionable participant links.
  if (readOnly) {
    return (
      <div className={cn(cardClassName, "cursor-default")} data-solaris-readonly-task-card="">
        {cardContents}
      </div>
    );
  }

  return (
    <Link to={task.route as any} className={cardClassName}>
      {cardContents}
    </Link>
  );
}