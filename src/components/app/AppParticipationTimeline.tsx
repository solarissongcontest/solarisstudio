import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock3,
  LockKeyhole,
  LoaderCircle,
} from "lucide-react";

import type { SolarisTask, SolarisTaskState } from "@/lib/participation-os";
import { cn } from "@/lib/utils";

const STATE_COPY: Record<SolarisTaskState, string> = {
  completed: "Completed",
  available: "Available",
  needs_attention: "Needs attention",
  upcoming: "Upcoming",
  waiting: "Waiting",
  problem: "Problem",
  finished: "Finished",
};

function StateIcon({ state }: { state: SolarisTaskState }) {
  if (state === "completed" || state === "finished") {
    return <CheckCircle2 className="size-4" aria-hidden="true" />;
  }
  if (state === "problem" || state === "needs_attention") {
    return <AlertTriangle className="size-4" aria-hidden="true" />;
  }
  if (state === "upcoming") return <LockKeyhole className="size-4" aria-hidden="true" />;
  if (state === "waiting") return <LoaderCircle className="size-4" aria-hidden="true" />;
  if (state === "available") return <Clock3 className="size-4" aria-hidden="true" />;
  return <Circle className="size-4" aria-hidden="true" />;
}

function deadlineLabel(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function AppParticipationTimeline({
  title = "Your edition timeline",
  tasks,
}: {
  title?: string;
  tasks: readonly SolarisTask[];
}) {
  if (!tasks.length) {
    return (
      <section className="solaris-app-timeline" aria-label={title}>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-5 text-primary" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-semibold">Nothing needs your attention</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Solaris will put the next relevant edition step here automatically.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="solaris-app-timeline" aria-labelledby="solaris-app-timeline-title">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.14em] text-primary">
            Participation OS
          </p>
          <h2 id="solaris-app-timeline-title" className="mt-1 text-base font-semibold">
            {title}
          </h2>
        </div>
        {tasks.every((task) => !task.actionRequired) ? (
          <span className="text-xs font-semibold text-primary">Up to date ✓</span>
        ) : null}
      </div>

      <div className="grid gap-2">
        {tasks.map((task) => {
          const deadline = deadlineLabel(task.deadline);
          return (
            <article
              key={task.id}
              className={cn(
                "solaris-app-timeline-row",
                task.actionRequired && "is-actionable",
                task.state === "problem" && "is-problem",
              )}
            >
              <span className="solaris-app-timeline-icon">
                <StateIcon state={task.state} />
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <h3 className="truncate text-sm font-semibold">{task.title}</h3>
                  <span className="solaris-app-task-state">{STATE_COPY[task.state]}</span>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {task.description}
                </p>
                {deadline ? (
                  <p className="mt-1 text-[11px] font-semibold text-muted-foreground">
                    Due {deadline}
                  </p>
                ) : null}

                <details className="mt-2 text-[11px] text-muted-foreground">
                  <summary className="cursor-pointer font-semibold text-primary">
                    Why am I seeing this?
                  </summary>
                  <p className="mt-1 leading-5">{task.why}</p>
                </details>
              </div>

              {task.route && task.actionRequired ? (
                <Link
                  to={task.route as any}
                  className="solaris-app-timeline-action"
                  aria-label={`Open ${task.title}`}
                >
                  Continue
                </Link>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
