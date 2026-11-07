import {
  sortSolarisTasks,
  taskNeedsAttention,
  type SolarisTask,
} from "./participation-os";
import { formatCompactCountdown, millisecondsUntil } from "./solaris-schedule";

/**
 * The installed task center consumes the canonical task vocabulary. Every
 * canonical state must remain visible in exactly one group: "available" is
 * intentionally separate from work that requires participant attention.
 */
export function partitionAppTaskCenter(tasks: readonly SolarisTask[]) {
  const needsAttention: SolarisTask[] = [];
  const next: SolarisTask[] = [];
  const available: SolarisTask[] = [];
  const completed: SolarisTask[] = [];

  for (const task of sortSolarisTasks(tasks)) {
    if (task.state === "completed" || task.state === "finished") {
      completed.push(task);
    } else if (taskNeedsAttention(task)) {
      needsAttention.push(task);
    } else if (task.state === "upcoming" || task.state === "waiting") {
      next.push(task);
    } else if (task.state === "available") {
      available.push(task);
    }
  }

  return { needsAttention, next, available, completed };
}

export type AppTaskTiming = {
  target: string;
  label: "Due" | "Opens" | "Closes";
};

/**
 * Use the canonical schedule timestamps, not task-card render state, to choose
 * a label. A due-only delegation deadline never means "opens in"; a completed
 * ballot must not keep counting down to a future voting window.
 */
export function appTaskTimingTarget(task: SolarisTask): AppTaskTiming | null {
  if (task.state === "completed" || task.state === "finished") return null;

  if (task.actionRequired) {
    return task.deadline ? { target: task.deadline, label: "Due" } : null;
  }

  if (task.state === "available") {
    return task.deadline ? { target: task.deadline, label: "Closes" } : null;
  }

  if (task.opensAt) return { target: task.opensAt, label: "Opens" };

  if (task.deadline) {
    return {
      target: task.deadline,
      label: task.kind === "deadline" || task.importance === "required" ? "Due" : "Closes",
    };
  }
  return null;
}

export function relativeAppTaskTiming(task: SolarisTask, now = Date.now()): string | null {
  const timing = appTaskTimingTarget(task);
  if (!timing) return null;

  const remaining = millisecondsUntil(timing.target, now);
  if (remaining == null) return null;

  if (remaining === 0) {
    return timing.label === "Due"
      ? "Deadline reached"
      : timing.label === "Closes"
        ? "Closing now"
        : "Available now";
  }
  return `${timing.label} in ${formatCompactCountdown(remaining)}`;
}

export function exactAppTaskTiming(task: SolarisTask): { dateTime: string; label: string } | null {
  const timing = appTaskTimingTarget(task);
  if (!timing) return null;

  const date = new Date(timing.target);
  if (Number.isNaN(date.getTime())) return null;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return {
    dateTime: date.toISOString(),
    label: `${timing.label} ${date.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    })}${timezone ? ` · ${timezone}` : ""}`,
  };
}
