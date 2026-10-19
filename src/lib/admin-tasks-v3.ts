import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type {
  OrganizerTaskOperationalState,
  OrganizerTaskPriority,
  OrganizerTaskState,
  OrganizerTaskV5,
} from "@/lib/admin-tasks-v5";

export type OrganizerTaskUrgency = "none" | "low" | "medium" | "high" | "immediate";
export type OrganizerTaskImpact = "low" | "medium" | "high" | "critical";
export type OrganizerTaskDeliveryClass = "required" | "recommended" | "optional";
export type OrganizerTaskV3Filter =
  | "all"
  | "needs_action"
  | "actionable"
  | "in_progress"
  | "blocked"
  | "waiting"
  | "failed"
  | "overdue"
  | "expired"
  | "superseded"
  | "mine"
  | "resolved"
  | "recent_resolved";

export type OrganizerTaskPrimaryActionV3 = {
  kind: "navigate";
  label: string;
  route: string;
};

export type OrganizerTaskV3 = OrganizerTaskV5 & {
  dedupeKey: string;
  showId: string | null;
  subjectType: string;
  subjectId: string;
  requiredCapability: string;
  sourceState: OrganizerTaskState;
  operationalState: OrganizerTaskOperationalState;
  actionRequired: boolean;
  blocking: boolean;
  urgency: OrganizerTaskUrgency;
  impact: OrganizerTaskImpact;
  deliveryClass: OrganizerTaskDeliveryClass;
  why: string;
  route: string;
  primaryAction: OrganizerTaskPrimaryActionV3 | null;
  opensAt: string;
  deadline: string | null;
  expiresAt: string | null;
  stateVersion: string;
  resolutionEvidence: Record<string, unknown>;
};

export type OrganizerTaskSummaryV3 = {
  total: number;
  unresolved: number;
  actionable: number;
  inProgress: number;
  blocked: number;
  waiting: number;
  failed: number;
  overdue: number;
  expired: number;
  superseded: number;
  resolved: number;
  blocking: number;
  needsAction: number;
};

export type OrganizerTaskProjectionV3 = {
  schemaVersion: 1;
  editionId: string;
  filter: OrganizerTaskV3Filter;
  items: OrganizerTaskV3[];
  summary: OrganizerTaskSummaryV3;
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
    nextOffset: number | null;
  };
  stateVersion: string;
  serverTime: string;
};

type RpcClient = {
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
};

const OPERATIONAL_STATES = new Set<OrganizerTaskOperationalState>([
  "actionable",
  "in_progress",
  "blocked",
  "waiting",
  "failed",
  "overdue",
  "expired",
  "superseded",
  "resolved",
]);
const URGENCIES = new Set<OrganizerTaskUrgency>([
  "none",
  "low",
  "medium",
  "high",
  "immediate",
]);
const IMPACTS = new Set<OrganizerTaskImpact>(["low", "medium", "high", "critical"]);
const DELIVERY_CLASSES = new Set<OrganizerTaskDeliveryClass>([
  "required",
  "recommended",
  "optional",
]);
const FILTERS = new Set<OrganizerTaskV3Filter>([
  "all",
  "needs_action",
  "actionable",
  "in_progress",
  "blocked",
  "waiting",
  "failed",
  "overdue",
  "expired",
  "superseded",
  "mine",
  "resolved",
  "recent_resolved",
]);

const ORGANIZER_TASK_SCOPE_ERROR =
  "Organizer Tasks require an explicit selected Organizer edition scope.";

function record(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function string(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid Organizer Tasks V3 ${field}.`);
  }
  return value;
}

function nullableString(value: unknown, field: string) {
  if (value == null) return null;
  if (typeof value !== "string") throw new Error(`Invalid Organizer Tasks V3 ${field}.`);
  return value;
}

function integer(value: unknown, field: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid Organizer Tasks V3 ${field}.`);
  }
  return parsed;
}

function enumValue<T extends string>(value: unknown, allowed: Set<T>, field: string): T {
  if (typeof value !== "string" || !allowed.has(value as T)) {
    throw new Error(`Invalid Organizer Tasks V3 ${field}.`);
  }
  return value as T;
}

function parsePrimaryAction(value: unknown): OrganizerTaskPrimaryActionV3 | null {
  if (value == null) return null;
  const action = record(value, "Invalid Organizer Tasks V3 primaryAction.");
  if (action.kind !== "navigate") {
    throw new Error("Organizer Tasks V3 returned an unsupported primary action.");
  }
  return {
    kind: "navigate",
    label: string(action.label, "primaryAction.label"),
    route: string(action.route, "primaryAction.route"),
  };
}

function parseTask(value: unknown, index: number): OrganizerTaskV3 {
  const task = record(value, `Invalid Organizer Task V3 at index ${index}.`);
  const priority = enumValue(
    task.priority,
    new Set<OrganizerTaskPriority>(["critical", "high", "normal"]),
    `items[${index}].priority`,
  );
  const sourceState = enumValue(
    task.sourceState,
    new Set<OrganizerTaskState>(["open", "waiting", "resolved"]),
    `items[${index}].sourceState`,
  );
  const operationalState = enumValue(
    task.operationalState,
    OPERATIONAL_STATES,
    `items[${index}].operationalState`,
  );
  if (typeof task.actionRequired !== "boolean" || typeof task.blocking !== "boolean") {
    throw new Error(`Invalid Organizer Task V3 state flags at index ${index}.`);
  }
  const resolutionPredicate = record(
    task.resolutionPredicate ?? {},
    `Invalid Organizer Task V3 resolution predicate at index ${index}.`,
  );
  const resolutionEvidence = record(
    task.resolutionEvidence ?? {},
    `Invalid Organizer Task V3 resolution evidence at index ${index}.`,
  );
  const ruleReference = Array.isArray(task.ruleReference)
    ? task.ruleReference.filter((item): item is string => typeof item === "string")
    : [];
  const route = string(task.route, `items[${index}].route`);
  const dueAt = nullableString(task.dueAt, `items[${index}].dueAt`);
  const openedAt = string(task.openedAt, `items[${index}].openedAt`);
  const lastEvaluatedAt = string(task.lastEvaluatedAt, `items[${index}].lastEvaluatedAt`);

  return {
    id: string(task.id, `items[${index}].id`),
    dedupeKey: string(task.dedupeKey, `items[${index}].dedupeKey`),
    editionId: nullableString(task.editionId, `items[${index}].editionId`),
    showId: nullableString(task.showId, `items[${index}].showId`),
    countryId: nullableString(task.countryId, `items[${index}].countryId`),
    assignedTo: nullableString(task.assignedTo, `items[${index}].assignedTo`),
    subjectType: string(task.subjectType, `items[${index}].subjectType`),
    subjectId: string(task.subjectId, `items[${index}].subjectId`),
    sourceKind: string(task.sourceKind, `items[${index}].sourceKind`),
    sourceKey: string(task.sourceKey, `items[${index}].sourceKey`),
    taskType: string(task.taskType, `items[${index}].taskType`),
    requiredCapability: string(task.requiredCapability, `items[${index}].requiredCapability`),
    sourceState,
    priority,
    state: sourceState,
    operationalState,
    actionRequired: task.actionRequired,
    blocking: task.blocking,
    urgency: enumValue(task.urgency, URGENCIES, `items[${index}].urgency`),
    impact: enumValue(task.impact, IMPACTS, `items[${index}].impact`),
    deliveryClass: enumValue(
      task.deliveryClass,
      DELIVERY_CLASSES,
      `items[${index}].deliveryClass`,
    ),
    title: string(task.title, `items[${index}].title`),
    description: typeof task.description === "string" ? task.description : "",
    why: typeof task.why === "string" ? task.why : "",
    route,
    href: route,
    primaryAction: parsePrimaryAction(task.primaryAction),
    opensAt: string(task.opensAt, `items[${index}].opensAt`),
    deadline: nullableString(task.deadline, `items[${index}].deadline`),
    dueAt,
    expiresAt: nullableString(task.expiresAt, `items[${index}].expiresAt`),
    openedAt,
    resolvedAt: nullableString(task.resolvedAt, `items[${index}].resolvedAt`),
    lastEvaluatedAt,
    stateVersion: string(task.stateVersion, `items[${index}].stateVersion`),
    resolutionPredicate,
    resolutionEvidence,
    ruleReference,
  };
}

function parseSummary(value: unknown): OrganizerTaskSummaryV3 {
  const summary = record(value, "Invalid Organizer Tasks V3 summary.");
  return {
    total: integer(summary.total, "summary.total"),
    unresolved: integer(summary.unresolved, "summary.unresolved"),
    actionable: integer(summary.actionable, "summary.actionable"),
    inProgress: integer(summary.inProgress, "summary.inProgress"),
    blocked: integer(summary.blocked, "summary.blocked"),
    waiting: integer(summary.waiting, "summary.waiting"),
    failed: integer(summary.failed, "summary.failed"),
    overdue: integer(summary.overdue, "summary.overdue"),
    expired: integer(summary.expired, "summary.expired"),
    superseded: integer(summary.superseded, "summary.superseded"),
    resolved: integer(summary.resolved, "summary.resolved"),
    blocking: integer(summary.blocking, "summary.blocking"),
    needsAction: integer(summary.needsAction, "summary.needsAction"),
  };
}

export function mapOrganizerTaskProjectionV3(value: unknown): OrganizerTaskProjectionV3 {
  const projection = record(value, "Invalid Organizer Tasks V3 payload.");
  if (projection.schemaVersion !== 1) {
    throw new Error("Unsupported Organizer Tasks V3 schema version.");
  }
  const filter = enumValue(projection.filter, FILTERS, "filter");
  if (!Array.isArray(projection.items)) {
    throw new Error("Invalid Organizer Tasks V3 items.");
  }
  const pagination = record(projection.pagination, "Invalid Organizer Tasks V3 pagination.");
  if (typeof pagination.hasMore !== "boolean") {
    throw new Error("Invalid Organizer Tasks V3 pagination.hasMore.");
  }
  const nextOffset = pagination.nextOffset == null
    ? null
    : integer(pagination.nextOffset, "pagination.nextOffset");

  return {
    schemaVersion: 1,
    editionId: string(projection.editionId, "editionId"),
    filter,
    items: projection.items.map(parseTask),
    summary: parseSummary(projection.summary),
    pagination: {
      limit: integer(pagination.limit, "pagination.limit"),
      offset: integer(pagination.offset, "pagination.offset"),
      total: integer(pagination.total, "pagination.total"),
      hasMore: pagination.hasMore,
      nextOffset,
    },
    stateVersion: string(projection.stateVersion, "stateVersion"),
    serverTime: string(projection.serverTime, "serverTime"),
  };
}

function normalizeEditionId(editionId: string | null | undefined) {
  const normalized = editionId?.trim();
  return normalized || null;
}

export async function loadOrganizerTasksV3(
  editionId: string | null | undefined,
  filter: OrganizerTaskV3Filter,
  client: RpcClient = supabase as unknown as RpcClient,
) {
  const exactEditionId = normalizeEditionId(editionId);
  if (!exactEditionId) throw new Error(ORGANIZER_TASK_SCOPE_ERROR);
  const { data, error } = await client.rpc("admin_organizer_tasks_v3", {
    p_edition_id: exactEditionId,
    p_filter: filter,
    p_limit: 200,
    p_offset: 0,
  });
  if (error) {
    throw new Error(error.message || "Organizer Tasks V3 could not be loaded.");
  }
  const projection = mapOrganizerTaskProjectionV3(data);
  if (projection.editionId !== exactEditionId) {
    throw new Error("Organizer Tasks V3 returned another edition projection.");
  }
  if (projection.items.some((task) => task.editionId && task.editionId !== exactEditionId)) {
    throw new Error("Organizer Tasks V3 returned a task from another edition scope.");
  }
  return projection;
}

function retry(failureCount: number, error: Error) {
  if (error.message === ORGANIZER_TASK_SCOPE_ERROR) return false;
  return failureCount < 2;
}

export function useOrganizerTasksV3(
  editionId: string | null | undefined,
  filter: OrganizerTaskV3Filter,
  enabled = true,
) {
  const exactEditionId = normalizeEditionId(editionId);
  return useQuery({
    enabled: enabled && exactEditionId != null,
    queryKey: ["organizer-tasks-v3", exactEditionId ?? "unscoped", filter],
    queryFn: () => loadOrganizerTasksV3(exactEditionId, filter),
    retry,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}
