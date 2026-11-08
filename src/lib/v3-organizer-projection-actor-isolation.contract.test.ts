import { QueryClient } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { organizerProjectionQueryKey } from "./v3-organizer-projection-key";

describe("private V3 Organizer projection cache", () => {
  it("isolates operational and audit rows across actors sharing an edition", () => {
    const queryClient = new QueryClient();
    const actorA = organizerProjectionQueryKey("actor-A", "edition-1");
    const actorB = organizerProjectionQueryKey("actor-B", "edition-1");
    const otherEdition = organizerProjectionQueryKey("actor-A", "edition-2");

    queryClient.setQueryData(actorA, { recentChanges: [{ actorId: "actor-A" }] });
    expect(queryClient.getQueryData(actorB)).toBeUndefined();
    expect(queryClient.getQueryData(otherEdition)).toBeUndefined();

    queryClient.setQueryData(actorB, { recentChanges: [{ actorId: "actor-B" }] });
    expect(queryClient.getQueryData(actorA)).toEqual({
      recentChanges: [{ actorId: "actor-A" }],
    });
    expect(queryClient.getQueryData(actorB)).toEqual({
      recentChanges: [{ actorId: "actor-B" }],
    });
    queryClient.clear();
  });

  it("normalizes scope and refuses anonymous query namespaces", () => {
    expect(organizerProjectionQueryKey(" actor-A ", " edition-1 ")).toEqual(
      organizerProjectionQueryKey("actor-A", "edition-1"),
    );
    expect(organizerProjectionQueryKey("actor-A", null)).toEqual([
      "v3-organizer-projection", "actor-A", "unscoped",
    ]);
    expect(() => organizerProjectionQueryKey(" ", "edition-1")).toThrow(
      "authenticated actor",
    );
  });

  it("binds the live hook to authenticated actor, disables unscoped reads and evicts inactive data", () => {
    const hook = readFileSync("src/lib/v3-organizer-projection.query.ts", "utf8");
    expect(hook).toContain("useAuthenticatedUser().id");
    expect(hook).toContain("organizerProjectionQueryKey(actorId, normalized)");
    expect(hook).toContain("enabled: Boolean(actorId && normalized)");
    expect(hook).toContain("gcTime: 0");
    expect(hook).toContain("retry: false");
    expect(hook).not.toContain('queryKey: ["v3-organizer-projection", normalized]');
  });
});
