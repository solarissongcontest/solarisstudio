import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Friend-voting resilience", () => {
  it("indexes reciprocal observations instead of rescanning the full history", () => {
    const code = source("integrations/televoting/intelligence-v4.server.ts");
    expect(code).toContain("buildReciprocalIndex");
    expect(code).toContain("reverseIndex.get");
    expect(code).toContain("reciprocalEvidence(pair, reverseIndex, currentEdition)");
    expect(code).not.toContain("const reverse = all.filter");
  });

  it("keeps the lightweight payload bound and uses a true historical fast path", () => {
    const functions = source("integrations/televoting/intelligence.functions.ts");
    const model = source("integrations/televoting/advanced-friend-voting.ts");
    expect(functions).toContain("LIGHTWEIGHT_RELATIONSHIP_LIMIT = 250");
    expect(functions).toContain("allRelationships.slice(0, LIGHTWEIGHT_RELATIONSHIP_LIMIT)");
    expect(functions).toContain('mode: "historical" as const');
    expect(functions).not.toContain("Promise.race");
    expect(functions).not.toContain("ADVANCED_ANALYSIS_TIMEOUT_MS");
    expect(model).toContain('if (config.mode === "historical")');
    expect(model).toContain("calculateHistoricalPatternRisk");
    expect(model).toContain("resolveCurrentEditionNumberCached");
  });

  it("keeps Retry intact and makes all four page tabs visible on narrow mobile screens", () => {
    const code = source("routes/_authenticated/admin/friend-voting.tsx");
    expect(code).toContain("whitespace-nowrap");
    expect(code).toContain("flex flex-col gap-3 sm:flex-row");
    expect(code).toContain("grid grid-cols-2 gap-2 sm:flex");
    expect(code).toContain("Historical relationship analysis");
    expect(code).toContain("retry: 0");
  });

  it("exposes Friend voting as its own Voting section tab instead of Integrity", () => {
    const code = source("components/admin/AdminSectionNav.tsx");
    expect(code).toContain('{ label: "Friend voting", to: "/admin/friend-voting"');
    expect(code).not.toContain('label: "Integrity", to: "/televoting/admin/integrity", active: (path) => path.startsWith("/televoting/admin/integrity") || path.startsWith("/televoting/admin/anti-abuse") || path.startsWith("/admin/friend-voting")');
    expect(code).toContain("flex flex-wrap gap-1");
  });
});
