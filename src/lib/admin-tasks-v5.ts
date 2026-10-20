import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type OrganizerTaskPriority = "critical" | "high" | "normal";
export type OrganizerTaskState = "open" | "waiting" | "resolved";
export type OrganizerTaskFilter = "all" | "mine" | "waiting" | "resolved";
export type OrganizerTaskOperationalState =
  | "actionable"
  | "in_progress"
  | "blocked"
  | "waiting"
  | "failed"
  | "overdue"
  | "expired"
  | "superseded"
  | "resolved";

const ORGANIZER_TASK_OPERATIONAL_STATES = new Set<OrganizerTaskOperationalState>([
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

export type OrganizerTaskV5 = {
  id: string;
  editionId: string | null;
  countryId: string | null;
  assignedTo: string | null;
  sourceKind: string;
  sourceKey: string;
  taskType: string;
  priority: OrganizerTaskPriority;
  state: OrganizerTaskState;
  operationalState?: OrganizerTaskOperationalState | null;
  title: string;
  description: string;
  href: string;
  dueAt: string | null;
  resolutionPredicate: Record<string, unknown>;
  ruleReference: string[];
  openedAt: string;
  resolvedAt: string | null;
  lastEvaluatedAt: string;
};

type RpcClient = {
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
};

const ORGANIZER_TASK_SCOPE_ERROR =
  "Organizer Tasks require an explicit selected Organizer edition scope.";

function normalizeOrganizerEditionId(editionId: string | null | undefined) {
  const normalized = editionId?.trim();
  return normalized ? normalized : null;
}

function requireOrganizerEditionId(editionId: string | null | undefined) {
  const normalizedEditionId = normalizeOrganizerEditionId(editionId);
  if (!normalizedEditionId) throw new Error(ORGANIZER_TASK_SCOPE_ERROR);
  return normalizedEditionId;
}

function parseOperationalState(value: unknown, index: number) {
  if (value == null) return null;
  if (
    typeof value !== "string" ||
    !ORGANIZER_TASK_OPERATIONAL_STATES.has(value as OrganizerTaskOperationalState)
  ) {
    throw new Error(`Invalid Organizer Task operational state at index ${index}`);
  }
  return value as OrganizerTaskOperationalState;
}

export function mapOrganizerTasksV5(value: unknown): OrganizerTaskV5[] {
  if (!Array.isArray(value)) {
    throw new Error("Invalid Organizer Tasks payload: expected an array");
  }

  return value.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error(`Invalid Organizer Task at index ${index}`);
    }
    const task = row as Partial<OrganizerTaskV5>;
    const raw = row as Record<string, unknown>;
    if (
      typeof task.id !== "string" ||
      typeof task.sourceKind !== "string" ||
      typeof task.sourceKey !== "string" ||
      typeof task.taskType !== "string" ||
      !["critical", "high", "normal"].includes(task.priority ?? "") ||
      !["open", "waiting", "resolved"].includes(task.state ?? "") ||
      typeof task.title !== "string" ||
      typeof task.description !== "string" ||
      typeof task.href !== "string" ||
      typeof task.openedAt !== "string" ||
      typeof task.lastEvaluatedAt !== "string"
    ) {
      throw new Error(`Invalid Organizer Task shape at index ${index}`);
    }

    const hasOperationalState = Object.prototype.hasOwnProperty.call(
      raw,
      "operationalState",
    );
    const operationalState = hasOperationalState
      ? parseOperationalState(raw.operationalState, index)
      : undefined;

    return {
      id: task.id,
      editionId: typeof task.editionId === "string" ? task.editionId : null,
      countryId: typeof task.countryId === "string" ? task.countryId : null,
      assignedTo: typeof task.assignedTo === "string" ? task.assignedTo : null,
      sourceKind: task.sourceKind,
      sourceKey: task.sourceKey,
      taskType: task.taskType,
      priority: task.priority as OrganizerTaskPriority,
      state: task.state as OrganizerTaskState,
      ...(hasOperationalState ? { operationalState } : {}),
      title: task.title,
      description: task.description,
      href: task.href,
      dueAt: typeof task.dueAt === "string" ? task.dueAt : null,
      resolutionPredicate:
        task.resolutionPredicate && typeof task.resolutionPredicate === "object"
          ? (task.resolutionPredicate as Record<string, unknown>)
          : {},
      ruleReference: Array.isArray(task.ruleReference)
        ? task.ruleReference.filter((item): item is string => typeof item === "string")
        : [],
      openedAt: task.openedAt,
      resolvedAt: typeof task.resolvedAt === "string" ? task.resolvedAt : null,
      lastEvaluatedAt: task.lastEvaluatedAt,
    };
  });
}

export function resolveOrganizerTaskOperationalState(
  task: OrganizerTaskV5,
  nowMs = Date.now(),
): OrganizerTaskOperationalState {
  if (task.state === "resolved") {
    if (task.operationalState === "expired" || task.operationalState === "superseded") {
      return task.operationalState;
    }
    return "resolved";
  }
  if (task.state === "waiting") return "waiting";

  if (task.operationalState && task.operationalState !== "resolved") {
    return task.operationalState;
  }

  if (task.dueAt) {
    const dueMs = Date.parse(task.dueAt);
    if (Number.isFinite(dueMs) && dueMs <= nowMs) return "overdue";
  }

  return "actionable";
}

export async function loadOrganizerTasksV5(
  editionId: string | null | undefined,
  filter: OrganizerTaskFilter,
  client: RpcClient = supabase as unknown as RpcClient,
) {
  const exactEditionId = requireOrganizerEditionId(editionId);
  const { data, error } = await client.rpc("admin_organizer_tasks", {
    p_edition_id: exactEditionId,
    p_filter: filter,
  });
  if (error) throw new Error(error.message || "Organizer Tasks could not be loaded.");
  const tasks = mapOrganizerTasksV5(data);
  if (tasks.some((task) => task.editionId && task.editionId !== exactEditionId)) {
    throw new Error("Organizer Tasks returned a task from another edition scope.");
  }
  return tasks;
}

export async function loadOrganizerTaskCountV5(
  editionId: string | null | undefined,
  client: RpcClient = supabase as unknown as RpcClient,
) {
  const exactEditionId = requireOrganizerEditionId(editionId);
  const { data, error } = await client.rpc("admin_organizer_task_count", {
    p_edition_id: exactEditionId,
  });
  if (error) throw new Error(error.message || "Organizer task count could not be loaded.");
  const value = Number(data ?? 0);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function shouldRetryOrganizerTaskQuery(failureCount: number, error: Error) {
  if (error.message === ORGANIZER_TASK_SCOPE_ERROR) return false;
  return failureCount < 2;
}

export function useOrganizerTasksV5(
  editionId: string | null | undefined,
  filter: OrganizerTaskFilter,
  enabled = true,
) {
  const normalizedEditionId = normalizeOrganizerEditionId(editionId);
  return useQuery({
    enabled,
    queryKey: ["organizer-tasks-v5", normalizedEditionId ?? "unscoped", filter],
    queryFn: () => loadOrganizerTasksV5(normalizedEditionId, filter),
    retry: shouldRetryOrganizerTaskQuery,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}

export function useOrganizerTaskCountV5(
  editionId: string | null | undefined,
  enabled = true,
) {
  const normalizedEditionId = normalizeOrganizerEditionId(editionId);
  return useQuery({
    enabled,
    queryKey: ["organizer-task-count-v5", normalizedEditionId ?? "unscoped"],
    queryFn: () => loadOrganizerTaskCountV5(normalizedEditionId),
    retry: shouldRetryOrganizerTaskQuery,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}
