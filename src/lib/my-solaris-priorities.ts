export type MySolarisPrioritySeverity = "critical" | "high" | "medium" | "info";

export type MySolarisPriorityItem = {
  id: string;
  title: string;
  description: string;
  to: string;
  search?: Record<string, string>;
  priority: number;
  deadline: string | null;
  severity: MySolarisPrioritySeverity;
  actionRequired: boolean;
  kind: "entry" | "notice" | "deadline" | "voting" | "task" | "info";
};

export function sortMySolarisPriorities(
  items: MySolarisPriorityItem[],
  now = Date.now(),
) {
  return [...items].sort((a, b) => {
    const bucketDiff = priorityBucket(a, now) - priorityBucket(b, now);
    if (bucketDiff) return bucketDiff;

    if (a.priority !== b.priority) return b.priority - a.priority;

    const deadlineDiff = deadlineTime(a.deadline) - deadlineTime(b.deadline);
    if (deadlineDiff) return deadlineDiff;

    return a.title.localeCompare(b.title);
  });
}

export function priorityBucket(item: MySolarisPriorityItem, now = Date.now()) {
  const deadline = deadlineTime(item.deadline);
  if (item.actionRequired && deadline < now) return 0;
  if (item.actionRequired) return 1;
  if (Number.isFinite(deadline) && deadline >= now) return 2;
  if (item.severity === "critical" || item.severity === "high") return 3;
  return 4;
}

export function isUpcomingPriority(item: MySolarisPriorityItem, now = Date.now()) {
  const deadline = deadlineTime(item.deadline);
  return Number.isFinite(deadline) && deadline >= now;
}

function deadlineTime(value: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
}
