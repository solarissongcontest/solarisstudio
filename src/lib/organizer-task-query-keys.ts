/** Keep edition prefixes stable for existing invalidation callers, then scope private rows by actor. */
export function organizerTasksQueryKey(editionId: string | null, actorId: string | null, filter: string) {
  return ["organizer-tasks-v5", editionId ?? "unscoped", actorId ?? "signed-out", filter] as const;
}

export function organizerTaskCountQueryKey(editionId: string | null, actorId: string | null) {
  return ["organizer-task-count-v5", editionId ?? "unscoped", actorId ?? "signed-out"] as const;
}
