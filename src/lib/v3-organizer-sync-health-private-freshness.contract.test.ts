import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/_authenticated/admin/sync-health.tsx", "utf8");
const server = readFileSync("src/integrations/unified/sync-health.functions.ts", "utf8");

describe("Organizer Sync Health private actor and freshness boundary", () => {
  it("partitions sensitive cross-service status by signed-in actor", () => {
    expect(route).toContain("useAuthenticatedUser().id");
    expect(route).toContain('queryKey: ["unified-sync-health", actorId]');
    expect(route).toContain("enabled: Boolean(actorId),");
    expect(route).not.toContain('queryKey: ["unified-sync-health"],');
  });

  it("does not show a cached healthy state or integration error evidence during revalidation", () => {
    expect(route).toContain("staleTime: 0,");
    expect(route).toContain("gcTime: 0,");
    expect(route).toContain('refetchOnMount: "always",');
    expect(route).toContain("actorId && isSuccess && !isFetching && !error ? snapshot : undefined;");
    expect(route).toContain("{isLoading || isFetching || !actorId ? (");
    expect(route).toContain("error || !data ? (");
    expect(route).toContain('title="Sync health could not be loaded"');
  });

  it("preserves server-owned capability and cross-service error authority", () => {
    expect(route).toContain("getUnifiedSyncHealth");
    expect(route).toContain("queryFn: () => getHealth(),");
    expect(route).toContain("onClick={() => void refetch()}");
    expect(server).toContain("requireSolarisOrganizerServer");
    expect(server).toContain('db.from("integration_events")');
  });
});
