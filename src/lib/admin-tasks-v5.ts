import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useFanSession } from "./prediction-data";
import { organizerTaskCountQueryKey, organizerTasksQueryKey } from "./organizer-task-query-keys";

export type OrganizerTaskPriority = "critical" | "high" | "normal";
export type OrganizerTaskState = "open" | "waiting" | "resolved";
export type OrganizerTaskFilter = "all" | "mine" | "waiting" | "resolved";
export type OrganizerTaskOperationalState =
  | "actionable"
  | "blocked"
  | "waiting"
  | "failed"
  | "overdue"
  | "resolved";
export type OrganizerTaskClassification =
  | OrganizerTaskOperationalState
  | "unclassified";

const ORGANIZER_TASK_OPERATIONAL_STATES = new Set<OrganizerTaskOperationalState>([
  "actionable",
  "blocked",
  "waiting",
  "failed",
  "overdue",
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

type RpcError = { message?: string; code?: string } | null;
type RpcClient = {
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: RpcError }>;
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
  if (value === "in_progress") return "actionable";
  if (value === "expired") return "overdue";
  if (value === "superseded") return "resolved";
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

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid Organizer Tasks V3 ${label}.`);
  }
  return value as Record<string, unknown>;
}

export function mapOrganizerTasksV3Compatibility(
  value: unknown,
  expectedEditionId: string,
): OrganizerTaskV5[] {
  const projection = record(value, "payload");
  if (projection.schemaVersion !== 1) {
    throw new Error("Unsupported Organizer Tasks V3 schema version.");
  }
  if (projection.editionId !== expectedEditionId) {
    throw new Error("Organizer Tasks V3 returned another edition projection.");
  }
  if (projection.authoritativeSource !== "studio2_organizer_tasks" || projection.reconciled !== true) {
    throw new Error("Organizer Tasks V3 did not prove canonical reconciliation.");
  }
  if (!Array.isArray(projection.items)) {
    throw new Error("Invalid Organizer Tasks V3 items.");
  }

  const compatible = mapOrganizerTasksV5(
    projection.items.map((value, index) => {
      const task = record(value, `item ${index}`);
      if (task.editionId != null && typeof task.editionId !== "string") {
        throw new Error(`Invalid Organizer Tasks V3 editionId at index ${index}.`);
      }
      return {
        ...task,
        state: task.sourceState,
        href: task.route ?? task.href,
        dueAt: task.dueAt ?? task.deadline,
      };
    }),
  );

  if (compatible.some((task) => task.editionId && task.editionId !== expectedEditionId)) {
    throw new Error("Organizer Tasks returned a task from another edition scope.");
  }
  return compatible;
}

function isMissingV3Rpc(error: RpcError, rpc: string) {
  if (!error) return false;
  if (error.code === "PGRST202" || error.code === "42883") return true;
  const message = error.message?.toLowerCase() ?? "";
  return message.includes(rpc) &&
    (message.includes("could not find") || message.includes("does not exist"));
}

/**
 * Resolve only state that is authoritative in the task payload.
 * Due timestamps and priority are display metadata here; the server-side V3
 * projection owns overdue/blocked/failed classification.
 */
export function resolveOrganizerTaskOperationalState(
  task: OrganizerTaskV5,
): OrganizerTaskClassification {
  if (task.state === "resolved") return "resolved";
  if (task.state === "waiting") return "waiting";
  if (task.operationalState) return task.operationalState;
  return "unclassified";
}

export function hasCompleteOrganizerTaskOperationalEvidence(
  tasks: OrganizerTaskV5[],
) {
  return tasks.every(
    (task) => resolveOrganizerTaskOperationalState(task) !== "unclassified",
  );
}

export async function loadOrganizerTasksV5(
  editionId: string | null | undefined,
  filter: OrganizerTaskFilter,
  client: RpcClient = supabase as unknown as RpcClient,
) {
  const exactEditionId = requireOrganizerEditionId(editionId);

  const canonical = await client.rpc("admin_organizer_tasks_v3", {
    p_edition_id: exactEditionId,
    p_filter: filter,
    p_limit: 200,
    p_offset: 0,
  });
  if (!canonical.error) {
    return mapOrganizerTasksV3Compatibility(canonical.data, exactEditionId);
  }
  if (!isMissingV3Rpc(canonical.error, "admin_organizer_tasks_v3")) {
    throw new Error(canonical.error.message || "Organizer Tasks V3 could not be loaded.");
  }

  // Deployment-order compatibility only. This reads the same canonical task
  // table/reconciler and is permitted solely while the additive V3 RPC is not
  // installed yet. Any other V3 error fails closed instead of silently falling
  // back to a weaker interpretation.
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
  let data: unknown;

  const canonical = await client.rpc("admin_organizer_task_count_v3", {
    p_edition_id: exactEditionId,
  });
  if (!canonical.error) {
    data = canonical.data;
  } else if (isMissingV3Rpc(canonical.error, "admin_organizer_task_count_v3")) {
    const legacy = await client.rpc("admin_organizer_task_count", {
      p_edition_id: exactEditionId,
    });
    if (legacy.error) {
      throw new Error(legacy.error.message || "Organizer task count could not be loaded.");
    }
    data = legacy.data;
  } else {
    throw new Error(canonical.error.message || "Organizer task count V3 could not be loaded.");
  }

  if (typeof data !== "number" || !Number.isSafeInteger(data) || data < 0) {
    throw new Error("Organizer task count returned an invalid authoritative payload.");
  }
  return data;
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
  const actorId = useFanSession().data?.id ?? null;
  return useQuery({
    enabled: enabled && Boolean(actorId),
    queryKey: organizerTasksQueryKey(normalizedEditionId, actorId, filter),
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
  const actorId = useFanSession().data?.id ?? null;
  return useQuery({
    enabled: enabled && Boolean(actorId),
    queryKey: organizerTaskCountQueryKey(normalizedEditionId, actorId),
    queryFn: () => loadOrganizerTaskCountV5(normalizedEditionId),
    retry: shouldRetryOrganizerTaskQuery,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}
