import type { SolarisTask } from "./participation-os";

export type SolarisNotificationCategory =
  | "confirmations"
  | "jury"
  | "televoting"
  | "deadlines"
  | "official"
  | "results"
  | "following"
  | "predictions";

export type NotificationPreferences = {
  enabled: boolean;
  categories: readonly SolarisNotificationCategory[];
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
  urgentDeadlineReminders?: boolean;
};

export type ScheduledTaskNotification = {
  taskId: string;
  category: SolarisNotificationCategory;
  kind: "opens_soon" | "opened" | "deadline_3d" | "deadline_24h" | "deadline_3h" | "deadline_1h";
  dueAt: string;
  dedupeKey: string;
  title: string;
  body: string;
  route: string;
};

const HOUR = 60 * 60 * 1000;
const WINDOWS = [
  { kind: "deadline_3d", ms: 72 * HOUR, tolerance: 30 * 60 * 1000 },
  { kind: "deadline_24h", ms: 24 * HOUR, tolerance: 20 * 60 * 1000 },
  { kind: "deadline_3h", ms: 3 * HOUR, tolerance: 15 * 60 * 1000 },
  { kind: "deadline_1h", ms: HOUR, tolerance: 10 * 60 * 1000 },
] as const;

function categoryFor(task: SolarisTask): SolarisNotificationCategory {
  if (task.kind === "confirmation") return "confirmations";
  if (task.kind === "jury") return "jury";
  if (task.kind === "televote") return "televoting";
  if (task.kind === "notice" || task.kind === "organizer-request") return "official";
  return "deadlines";
}

export function scheduledTaskNotifications(
  task: SolarisTask,
  preferences: NotificationPreferences,
  now = Date.now(),
): ScheduledTaskNotification[] {
  if (!preferences.enabled || !task.actionRequired || !task.deadline) return [];
  if (task.state === "completed" || task.state === "finished") return [];

  const category = categoryFor(task);
  if (!preferences.categories.includes(category) && !preferences.categories.includes("deadlines")) {
    return [];
  }

  const deadline = new Date(task.deadline).getTime();
  if (!Number.isFinite(deadline) || deadline <= now) return [];
  const remaining = deadline - now;

  return WINDOWS
    .filter((window) => Math.abs(remaining - window.ms) <= window.tolerance)
    .map((window) => ({
      taskId: task.id,
      category,
      kind: window.kind,
      dueAt: task.deadline!,
      dedupeKey: `${task.id}:${window.kind}:${task.deadline}`,
      title:
        window.kind === "deadline_3d"
          ? "3 days remaining"
          : window.kind === "deadline_24h"
            ? "Deadline tomorrow"
            : window.kind === "deadline_3h"
              ? "3 hours remaining"
              : "1 hour remaining",
      body: task.title,
      route: task.route,
    }));
}

export function notificationDedupeKey(
  event: string,
  subjectId: string,
  recipientId: string,
  window: string,
) {
  return [event, subjectId, recipientId, window].join(":");
}
