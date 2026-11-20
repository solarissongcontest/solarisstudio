import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/_authenticated/admin/hod-history.tsx", "utf8");

describe("Organizer HOD history private actor and evidence freshness", () => {
  it("remounts private review state when the authenticated actor changes", () => {
    expect(route).toContain('import { useAuthenticatedUser }');
    expect(route).toContain("const actorId = useAuthenticatedUser().id;");
    expect(route).toContain("<HodHistoryWorkspace key={actorId} actorId={actorId} />");
  });

  it("keeps private HOD history and Televote-derived suggestions in actor-scoped query caches", () => {
    expect(route).toContain('queryKey: ["hod-history", actorId]');
    expect(route).toContain('queryKey: ["hod-identity-suggestions", actorId]');
    expect((route.match(/enabled: Boolean\(actorId\)/g) ?? []).length).toBe(2);
    expect((route.match(/gcTime: 0,/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((route.match(/refetchOnMount: "always"/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(route).toContain('queryClient.invalidateQueries({ queryKey: ["hod-history"] })');
  });

  it("never treats cached private history or identity evidence as fresh verification", () => {
    expect(route).toContain("historyQuery.isSuccess && !historyQuery.isFetching && !historyQuery.error");
    expect(route).toContain("suggestionsQuery.isSuccess && !suggestionsQuery.isFetching && !suggestionsQuery.error");
    expect(route).toContain("suggestionsVerified ? (suggestionsQuery.data ?? []) : []");
    expect(route).toContain("{data ? (");
    expect(route).toContain("suggestionsQuery.isError ? (");
    expect(route).toContain("Cached Televoting evidence is hidden until an authorized read succeeds.");
    expect(route).toContain("Retry identity suggestions");
    expect(route).not.toContain('queryKey: ["hod-history"],');
    expect(route).not.toContain('queryKey: ["hod-identity-suggestions"],');
  });
});
