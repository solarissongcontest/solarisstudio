import { QueryClient } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { organizerTaskCountQueryKey, organizerTasksQueryKey } from "./organizer-task-query-keys";

describe("Organizer task actor namespaces", () => {
  it("keeps actor-filtered rows and counts separate in the same edition", () => {
    const client = new QueryClient();
    try {
      client.setQueryData(organizerTasksQueryKey("edition", "A", "mine"), ["A-only"]);
      client.setQueryData(organizerTaskCountQueryKey("edition", "A"), 1);
      expect(client.getQueryData(organizerTasksQueryKey("edition", "B", "mine"))).toBeUndefined();
      expect(client.getQueryData(organizerTaskCountQueryKey("edition", "B"))).toBeUndefined();
    } finally { client.clear(); }
  });

  it("retains existing edition-prefix invalidation without touching another edition", async () => {
    const client = new QueryClient();
    const a = organizerTasksQueryKey("edition", "A", "all");
    const b = organizerTasksQueryKey("edition", "B", "mine");
    const other = organizerTasksQueryKey("other-edition", "A", "all");
    try {
      for (const key of [a, b, other]) client.setQueryData(key, []);
      await client.invalidateQueries({ queryKey: ["organizer-tasks-v5", "edition"] });
      expect(client.getQueryState(a)?.isInvalidated).toBe(true);
      expect(client.getQueryState(b)?.isInvalidated).toBe(true);
      expect(client.getQueryState(other)?.isInvalidated).toBe(false);
    } finally { client.clear(); }
  });

  it("wires both production hooks to the actor namespace without changing server authority", () => {
    const source = readFileSync("src/lib/admin-tasks-v5.ts", "utf8");
    expect(source).toContain("organizerTasksQueryKey(normalizedEditionId, actorId, filter)");
    expect(source).toContain("organizerTaskCountQueryKey(normalizedEditionId, actorId)");
    expect(source.match(/const actorId = useFanSession\(\).data\?\.id \?\? null/g)).toHaveLength(2);
    expect(source.match(/enabled: enabled && Boolean\(actorId\)/g)).toHaveLength(2);
    expect(source).toContain('client.rpc("admin_organizer_tasks"');
    expect(source).toContain('client.rpc("admin_organizer_task_count"');
  });
});
