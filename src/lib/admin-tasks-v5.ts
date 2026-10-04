import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type OrganizerTaskPriority = "critical" | "high" | "normal";
export type OrganizerTaskState = "open" | "waiting" | "resolved";
export type OrganizerTaskFilter = "all" | "mine" | "waiting" | "resolved";

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

export function mapOrganizerTasksV5(value: unknown): OrganizerTaskV5[] {
  if (!Array.isArray(value)) {
    throw new Error("Invalid Organizer Tasks payload: expected an array");
  }

  return value.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error(`Invalid Organizer Task at index ${index}`);
    }
    const task = row as Partial<OrganizerTaskV5>;
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

export async function loadOrganizerTasksV5(
  editionId: string | null | undefined,
  filter: OrganizerTaskFilter,
  client: RpcClient = supabase as unknown as RpcClient,
) {
  const { data, error } = await client.rpc("admin_organizer_tasks", {
    p_edition_id: editionId ?? null,
    p_filter: filter,
  });
  if (error) throw new Error(error.message || "Organizer Tasks could not be loaded.");
  return mapOrganizerTasksV5(data);
}

export async function loadOrganizerTaskCountV5(
  editionId: string | null | undefined,
  client: RpcClient = supabase as unknown as RpcClient,
) {
  const { data, error } = await client.rpc("admin_organizer_task_count", {
    p_edition_id: editionId ?? null,
  });
  if (error) throw new Error(error.message || "Organizer task count could not be loaded.");
  const value = Number(data ?? 0);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

export function useOrganizerTasksV5(
  editionId: string | null | undefined,
  filter: OrganizerTaskFilter,
  enabled = true,
) {
  return useQuery({
    enabled,
    queryKey: ["organizer-tasks-v5", editionId ?? "all", filter],
    queryFn: () => loadOrganizerTasksV5(editionId, filter),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}

export function useOrganizerTaskCountV5(
  editionId: string | null | undefined,
  enabled = true,
) {
  return useQuery({
    enabled,
    queryKey: ["organizer-task-count-v5", editionId ?? "all"],
    queryFn: () => loadOrganizerTaskCountV5(editionId),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}
