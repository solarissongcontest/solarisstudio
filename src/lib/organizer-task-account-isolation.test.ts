import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { createAccountCacheIsolationHandler } from "./account-cache-isolation";

// These are the actual pre-fix task/cache shapes, including the shared edition.
const keys = [
  ["task rows", ["organizer-tasks-v5", "edition-22", "all"]],
  ["task count", ["organizer-task-count-v5", "edition-22"]],
] as const;

describe("capability-filtered Organizer tasks across account changes", () => {
  it.each(keys)("purges prior actor's %s before publishing the next account", (_name, key) => {
    const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
    const apply = createAccountCacheIsolationHandler(client, () => {});
    try {
      apply({ id: "A" });
      client.setQueryData(key, { privateTask: "visible-only-to-A" });
      client.setQueryData(["public-edition", "edition-22"], { title: "Public" });
      apply({ id: "B" });
      expect(client.getQueryData(key)).toBeUndefined();
      expect(client.getQueryData(["fan-session"])).toEqual({ id: "B" });
      expect(client.getQueryData(["public-edition", "edition-22"])).toEqual({ title: "Public" });
    } finally { client.clear(); }
  });

  it.each(keys)("cancels delayed A %s so they cannot overwrite B's readback", async (_name, key) => {
    const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
    const apply = createAccountCacheIsolationHandler(client, () => {});
    let resolveA!: (value: { privateTask: string }) => void;
    try {
      apply({ id: "A" });
      const pendingA = client.fetchQuery({
        queryKey: key,
        queryFn: () => new Promise<{ privateTask: string }>((resolve) => { resolveA = resolve; }),
      }).catch(() => undefined);
      apply({ id: "B" });
      client.setQueryData(key, { privateTask: "visible-only-to-B" });
      resolveA({ privateTask: "visible-only-to-A" });
      await pendingA;
      expect(client.getQueryData(key)).toEqual({ privateTask: "visible-only-to-B" });
    } finally { client.clear(); }
  });
});
