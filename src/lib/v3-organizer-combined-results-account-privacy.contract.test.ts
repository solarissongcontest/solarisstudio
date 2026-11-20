import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/routes/televoting/admin/combined.tsx", "utf8");

describe("Organizer Combined Results private actor boundary", () => {
  it("discards prepared actions and result selections when the authenticated account changes", () => {
    expect(source).toContain("component: CombinedResultsAccountBoundary");
    expect(source).toContain("const actorId = useAuthenticatedUser().id;");
    expect(source).toContain('<CombinedResultsPage key={actorId ?? "signed-out"} />');
  });

  it("partitions all four protected query keys by authenticated actor and avoids automatic private polling", () => {
    for (const key of [
      '["merged-televoting-admin", actorId]',
      '["merged-combined-aggregations", actorId]',
      '["merged-televoting-rounds", actorId]',
      '["merged-combined-detail", actorId, selectedId]',
    ]) expect(source).toContain(key);
    expect(source).toContain("enabled: Boolean(actorId)");
    expect(source).toContain("enabled: Boolean(actorId && admin)");
    expect(source).toContain("enabled: Boolean(actorId && admin && selectedId)");
    for (const config of ["gcTime: 0", "retry: false", "refetchInterval: false", "refetchOnWindowFocus: false", "refetchOnReconnect: false"]) {
      expect(source.split(config).length - 1).toBe(4);
    }
  });

  it("keeps result invalidations within the acting account and never shows an unverified empty state", () => {
    expect(source).toContain('queryClient.invalidateQueries({ queryKey: ["merged-combined-aggregations", actorId] })');
    expect(source).toContain('queryClient.invalidateQueries({ queryKey: ["merged-combined-detail", actorId, selectedId] })');
    expect(source).toContain('queryClient.invalidateQueries({ queryKey: ["merged-televoting-audit", actorId] })');
    expect(source).toContain("if (listError) {");
    expect(source).toContain("Combined Results unavailable");
    expect(source).toContain("Retry Combined Results");
    expect(source).toContain("No calculation or publication action is available until it reloads.");
  });
});
