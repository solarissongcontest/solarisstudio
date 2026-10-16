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

function normalizeOrganizerEditionId(editionId: string | null | undefined) {
  const normalized = editionId?.trim();
  return normalized ? normalized : null;
}

function requireOrganizerEditionId(editionId: string | null | undefined) {
  const normalizedEditionId = normalizeOrganizerEditionId(editionId);
  if (!normalizedEditionId) {
    throw new Error("Organizer Tasks requires an explicit edition scope.");
  }
  return normalizedEditionId;
}

function requiredString(value: unknown, field: string, index: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid Organizer Task ${field} at index ${index}`);
  }
  return value.trim();
}

function optionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function requiredTimestamp(value: unknown, field: string, index: number): string {
  const normalized = requiredString(value, field, index);
  if (!Number.isFinite(Date.parse(normalized))) {
    throw new Error(`Invalid Organizer Task ${field} at index ${index}`);
  }
  return normalized;
}

function optionalTimestamp(value: unknown, field: string, index: number): string | null {
  if (value == null) return null;
  const normalized = requiredString(value, field, index);
  if (!Number.isFinite(Date.parse(normalized))) {
    throw new Error(`Invalid Organizer Task ${field} at index ${index}`);
  }
  return normalized;
}

function mapResolutionPredicate(value: unknown, index: number): Record<string, unknown> {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid Organizer Task resolution predicate at index ${index}`);
  }
  return value as Record<string, unknown>;
}

function mapRuleReference(value: unknown, index: number): string[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new Error(`Invalid Organizer Task rule reference at index ${index}`);
  }
  if (value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`Invalid Organizer Task rule reference at index ${index}`);
  }
  return [...new Set(value.map((item) => item.trim()))];
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
    if (
      !["critical", "high", "normal"].includes(task.priority ?? "") ||
      !["open", "waiting", "resolved"].includes(task.state ?? "")
    ) {
      throw new Error(`Invalid Organizer Task shape at index ${index}`);
    }

    return {
      id: requiredString(task.id, "id", index),
      editionId: optionalString(task.editionId),
      countryId: optionalString(task.countryId),
      assignedTo: optionalString(task.assignedTo),
      sourceKind: requiredString(task.sourceKind, "source kind", index),
      sourceKey: requiredString(task.sourceKey, "source key", index),
      taskType: requiredString(task.taskType, "task type", index),
      priority: task.priority as OrganizerTaskPriority,
      state: task.state as OrganizerTaskState,
      title: requiredString(task.title, "title", index),
      description: requiredString(task.description, "description", index),
      href: requiredString(task.href, "route", index),
      dueAt: optionalTimestamp(task.dueAt, "due timestamp", index),
      resolutionPredicate: mapResolutionPredicate(task.resolutionPredicate, index),
      ruleReference: mapRuleReference(task.ruleReference, index),
      openedAt: requiredTimestamp(task.openedAt, "opened timestamp", index),
      resolvedAt: optionalTimestamp(task.resolvedAt, "resolved timestamp", index),
      lastEvaluatedAt: requiredTimestamp(task.lastEvaluatedAt, "evaluation timestamp", index),
    };
  });
}

export function parseOrganizerTaskCountV5(value: unknown): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
    throw new Error("Invalid Organizer task count payload.");
  }
  return parsed;
}

export async function loadOrganizerTasksV5(
  editionId: string | null | undefined,
  filter: OrganizerTaskFilter,
  client: RpcClient = supabase as unknown as RpcClient,
) {
  const normalizedEditionId = requireOrganizerEditionId(editionId);
  const { data, error } = await client.rpc("admin_organizer_tasks", {
    p_edition_id: normalizedEditionId,
    p_filter: filter,
  });
  if (error) throw new Error(error.message || "Organizer Tasks could not be loaded.");

  const tasks = mapOrganizerTasksV5(data);
  const mismatchedTask = tasks.find(
    (task) => task.editionId !== null && task.editionId !== normalizedEditionId,
  );
  if (mismatchedTask) {
    throw new Error("Organizer Tasks returned data outside the selected edition scope.");
  }
  return tasks;
}

export async function loadOrganizerTaskCountV5(
  editionId: string | null | undefined,
  client: RpcClient = supabase as unknown as RpcClient,
) {
  const normalizedEditionId = requireOrganizerEditionId(editionId);
  const { data, error } = await client.rpc("admin_organizer_task_count", {
    p_edition_id: normalizedEditionId,
  });
  if (error) throw new Error(error.message || "Organizer task count could not be loaded.");
  return parseOrganizerTaskCountV5(data);
}

export function useOrganizerTasksV5(
  editionId: string | null | undefined,
  filter: OrganizerTaskFilter,
  enabled = true,
) {
  const normalizedEditionId = normalizeOrganizerEditionId(editionId);
  return useQuery({
    enabled: enabled && Boolean(normalizedEditionId),
    queryKey: ["organizer-tasks-v5", normalizedEditionId ?? "unscoped", filter],
    queryFn: () => loadOrganizerTasksV5(normalizedEditionId, filter),
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
    enabled: enabled && Boolean(normalizedEditionId),
    queryKey: ["organizer-task-count-v5", normalizedEditionId ?? "unscoped"],
    queryFn: () => loadOrganizerTaskCountV5(normalizedEditionId),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}
