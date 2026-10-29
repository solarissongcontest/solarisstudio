import {
  sortSolarisTasks,
  type SolarisTask,
  type SolarisTaskImportance,
  type SolarisTaskState,
} from "./participation-os";

/**
 * V3 never owns contest truth here. These are presentation projections over
 * existing canonical participation/domain state. Keeping this module pure and
 * deterministic lets Home, Participate, badges and notifications share the
 * same interpretation without creating another database-backed source of truth.
 */
export type V3Urgency = "none" | "low" | "medium" | "high" | "immediate";
export type V3Impact = "low" | "medium" | "high" | "blocking";
export type V3DeliveryClass = "required" | "recommended" | "optional";

export type V3ActionProjection = {
  id: string;
  editionId: string | null;
  kind: SolarisTask["kind"];
  sourceState: SolarisTaskState;
  title: string;
  description: string;
  why: string;
  route: string;
  actionRequired: boolean;
  urgency: V3Urgency;
  impact: V3Impact;
  deliveryClass: V3DeliveryClass;
  opensAt: string | null;
  deadline: string | null;
  completed: boolean;
};

export type V3AttentionProjection = {
  primary: V3ActionProjection | null;
  secondary: V3ActionProjection[];
  remainingCount: number;
  badgeCount: number;
  immediateCount: number;
  hasBlockingAction: boolean;
};

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function parseTime(value: string | null) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

export function v3DeliveryClass(importance: SolarisTaskImportance): V3DeliveryClass {
  if (importance === "required") return "required";
  if (importance === "recommended") return "recommended";
  return "optional";
}

export function v3Urgency(task: SolarisTask, now: number): V3Urgency {
  if (!task.actionRequired) return "none";

  const deadline = parseTime(task.deadline);
  if (deadline == null) return task.state === "problem" ? "high" : "medium";

  const remaining = deadline - now;
  if (remaining <= 0) return "immediate";
  if (remaining <= HOUR) return "immediate";
  if (remaining <= 3 * HOUR) return "high";
  if (remaining <= DAY) return "medium";
  if (remaining <= 3 * DAY) return "low";
  return "none";
}

export function v3Impact(task: SolarisTask): V3Impact {
  if (task.blocking) return "blocking";
  if (task.state === "problem") return "high";
  if (task.importance === "required") return "high";
  if (task.importance === "recommended") return "medium";
  return "low";
}

function v3ActionRequired(task: SolarisTask) {
  // The canonical Participation OS uses voting `problem` for a required voting
  // window that has already closed without a recorded submission. That remains
  // a blocking problem the viewer needs to understand, but the browser cannot
  // act on it or reopen the official window. Keep the raw source state for
  // context while normalizing V3 action affordance to false.
  if (
    task.state === "problem" &&
    (task.kind === "jury" || task.kind === "televote")
  ) {
    return false;
  }
  return task.actionRequired;
}

export function projectV3Action(task: SolarisTask, now = Date.now()): V3ActionProjection {
  const actionRequired = v3ActionRequired(task);
  const urgencyTask = actionRequired === task.actionRequired
    ? task
    : { ...task, actionRequired };

  return {
    id: task.id,
    editionId: task.editionId,
    kind: task.kind,
    sourceState: task.state,
    title: task.title,
    description: task.description,
    why: task.why,
    route: task.route,
    actionRequired,
    urgency: v3Urgency(urgencyTask, now),
    impact: v3Impact(task),
    deliveryClass: v3DeliveryClass(task.importance),
    opensAt: task.opensAt,
    deadline: task.deadline,
    // `finished` means a window/opportunity ended. It is useful historical
    // context but must not be presented as proof that the viewer completed the
    // responsibility. Only canonical `completed` is completion evidence.
    completed: task.state === "completed",
  };
}

export function projectV3Actions(tasks: readonly SolarisTask[], now = Date.now()) {
  return sortSolarisTasks(tasks).map((task) => projectV3Action(task, now));
}

function urgencyScore(urgency: V3Urgency) {
  switch (urgency) {
    case "immediate":
      return 5;
    case "high":
      return 4;
    case "medium":
      return 3;
    case "low":
      return 2;
    case "none":
      return 1;
  }
}

function impactScore(impact: V3Impact) {
  switch (impact) {
    case "blocking":
      return 4;
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
  }
}

function deliveryScore(deliveryClass: V3DeliveryClass) {
  if (deliveryClass === "required") return 3;
  if (deliveryClass === "recommended") return 2;
  return 1;
}

function attentionScore(action: V3ActionProjection) {
  return (
    urgencyScore(action.urgency) * 100 +
    impactScore(action.impact) * 10 +
    deliveryScore(action.deliveryClass)
  );
}

/**
 * Home intentionally has a hard content budget: one primary action and at most
 * two secondary actions. Remaining work belongs in Participate instead of
 * slowly turning Home back into an everything-dashboard.
 */
export function projectV3Attention(
  actions: readonly V3ActionProjection[],
): V3AttentionProjection {
  const actionable = actions
    .filter((action) => action.actionRequired && !action.completed)
    .sort((a, b) => attentionScore(b) - attentionScore(a));

  const primary = actionable[0] ?? null;
  const secondary = actionable.slice(1, 3);

  return {
    primary,
    secondary,
    remainingCount: Math.max(0, actionable.length - 3),
    badgeCount: actionable.length,
    immediateCount: actionable.filter((action) => action.urgency === "immediate").length,
    hasBlockingAction: actionable.some((action) => action.impact === "blocking"),
  };
}
