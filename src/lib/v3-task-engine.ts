import type {
  SolarisTask,
  SolarisTaskImportance,
  SolarisTaskKind,
  SolarisTaskState,
} from "./participation-os";

export type V3TaskAudience = "participant" | "organizer";
export type V3CanonicalTaskState =
  | "not_available"
  | "available"
  | "in_progress"
  | "blocked"
  | "waiting"
  | "overdue"
  | "completed"
  | "expired";

export type V3CanonicalTaskReadItem = {
  id: string;
  dedupeKey: string;
  audience: V3TaskAudience;
  editionId: string | null;
  kind: SolarisTaskKind;
  sourceId: string;
  sourceState: SolarisTaskState;
  state: V3CanonicalTaskState;
  title: string;
  description: string;
  why: string;
  deliveryClass: "required" | "recommended" | "optional";
  actionRequired: boolean;
  blocking: boolean;
  priority: number;
  opensAt: string | null;
  deadline: string | null;
  route: string;
};

export type V3ParticipantTaskProjection = {
  schemaVersion: 1;
  audience: "participant";
  authoritativeSource: "participant-task-engine";
  serverTime: string;
  stateVersion: string;
  items: readonly V3CanonicalTaskReadItem[];
};

const SINGLETON_PARTICIPANT_KINDS = new Set<SolarisTaskKind>([
  "confirmation",
  "entry",
  "media",
  "jury",
  "televote",
  "notice",
]);

const STATE_RANK: Record<SolarisTaskState, number> = {
  problem: 8,
  needs_attention: 7,
  available: 6,
  waiting: 5,
  upcoming: 4,
  completed: 3,
  finished: 2,
};

const IMPORTANCE_RANK: Record<SolarisTaskImportance, number> = {
  required: 4,
  recommended: 3,
  optional: 2,
  informational: 1,
};

function normalizedEditionId(task: SolarisTask) {
  return task.editionId?.trim() || "global";
}

/**
 * Current participant obligations such as Confirmation, Entry and Jury are
 * singleton responsibilities inside an edition. Their visible state may change
 * repeatedly, but their logical identity must not. Multi-instance operational
 * items (deadlines, organizer requests and informational rows) retain source id
 * in their identity so distinct obligations cannot be falsely deduplicated.
 */
export function participantTaskDedupeKey(task: SolarisTask) {
  const edition = normalizedEditionId(task);
  if (SINGLETON_PARTICIPANT_KINDS.has(task.kind)) {
    return `participant:${edition}:${task.kind}`;
  }
  return `participant:${edition}:${task.kind}:${task.id}`;
}

function candidateRank(task: SolarisTask) {
  return (
    IMPORTANCE_RANK[task.importance] * 1_000_000 +
    Number(task.blocking) * 100_000 +
    Number(task.actionRequired) * 10_000 +
    STATE_RANK[task.state] * 1_000 +
    task.priority
  );
}

/**
 * Reconciliation/replay is deterministic: the same logical participant
 * obligation always produces one task id, and duplicate evidence is resolved
 * by an explicit semantic rank rather than input order.
 */
export function canonicalizeParticipantTasks(
  tasks: readonly SolarisTask[],
): SolarisTask[] {
  const byKey = new Map<string, SolarisTask>();

  for (const task of tasks) {
    const key = participantTaskDedupeKey(task);
    const normalized: SolarisTask = { ...task, id: key };
    const existing = byKey.get(key);
    if (
      !existing ||
      candidateRank(normalized) > candidateRank(existing) ||
      (candidateRank(normalized) === candidateRank(existing) &&
        normalized.title.localeCompare(existing.title) < 0)
    ) {
      byKey.set(key, normalized);
    }
  }

  return [...byKey.values()].sort((a, b) => {
    const priority = b.priority - a.priority;
    if (priority) return priority;
    return a.id.localeCompare(b.id);
  });
}

function deliveryClass(importance: SolarisTaskImportance) {
  if (importance === "required") return "required" as const;
  if (importance === "recommended") return "recommended" as const;
  return "optional" as const;
}

function validTime(value: string | null) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function canonicalState(task: SolarisTask, serverNow: number): V3CanonicalTaskState {
  if (task.state === "completed") return "completed";
  if (task.state === "finished") return "expired";
  if (task.state === "upcoming") return "not_available";
  if (task.state === "waiting") return "waiting";
  if (task.state === "problem") return "blocked";

  const deadline = validTime(task.deadline);
  if (deadline != null && deadline <= serverNow && task.actionRequired) return "overdue";
  if (task.state === "available" || task.state === "needs_attention") return "available";
  return "in_progress";
}

function stateVersion(items: readonly V3CanonicalTaskReadItem[]) {
  // Stable non-cryptographic version token. It is only cache/reconciliation
  // evidence, never a security primitive.
  const source = items
    .map((item) => [item.id, item.sourceState, item.state, item.actionRequired, item.deadline ?? ""].join(":"))
    .sort()
    .join("|");
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `p1-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function projectParticipantTaskReadModel(
  tasks: readonly SolarisTask[],
  serverTime: string,
): V3ParticipantTaskProjection {
  const now = Date.parse(serverTime);
  if (!Number.isFinite(now)) {
    throw new Error("Participant Task projection requires a valid serverTime timestamp.");
  }

  const canonical = canonicalizeParticipantTasks(tasks);
  const items = canonical.map<V3CanonicalTaskReadItem>((task) => ({
    id: task.id,
    dedupeKey: task.id,
    audience: "participant",
    editionId: task.editionId,
    kind: task.kind,
    sourceId: task.id,
    sourceState: task.state,
    state: canonicalState(task, now),
    title: task.title,
    description: task.description,
    why: task.why,
    deliveryClass: deliveryClass(task.importance),
    actionRequired: task.actionRequired,
    blocking: task.blocking,
    priority: task.priority,
    opensAt: task.opensAt,
    deadline: task.deadline,
    route: task.route,
  }));

  return {
    schemaVersion: 1,
    audience: "participant",
    authoritativeSource: "participant-task-engine",
    serverTime,
    stateVersion: stateVersion(items),
    items,
  };
}
