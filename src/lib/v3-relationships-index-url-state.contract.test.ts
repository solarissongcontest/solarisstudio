import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Public V3 Relationships index URL state", () => {
  it("keeps relationship view and search shareable without making them data authority", () => {
    const gate = read("src/components/v3/V3RelationshipsGate.tsx");
    const screen = read("src/components/v3/V3RelationshipsIndexScreen.tsx");

    expect(gate).toContain("useRouterState");
    expect(gate).toContain("relationshipIndexNomination(search)");
    expect(gate).toContain('"all"');
    expect(gate).toContain('"alliances"');
    expect(gate).toContain('"rivalries"');
    expect(gate).toContain('"one-sided"');
    expect(gate).toContain("MAX_RELATIONSHIP_QUERY_LENGTH = 80");
    expect(gate).toContain('to: "/relationships"');
    expect(gate).toContain('view: tab === "all" ? undefined : tab');
    expect(gate).toContain("q: normalized || undefined");
    expect(screen).toContain("selectedTab ?? localTab");
    expect(screen).toContain("controlledQuery ?? localQuery");
    expect(screen).toContain('data-v3-relationships-index-filters=""');
  });

  it("canonicalizes invalid view nominations while preserving bounded search", () => {
    const gate = read("src/components/v3/V3RelationshipsGate.tsx");

    expect(gate).toContain("RELATIONSHIP_INDEX_TABS.has(rawView");
    expect(gate).toContain('tab: viewValid && hasView ? (rawView as V3RelationshipsIndexTab) : "all"');
    expect(gate).toContain("if (nomination.viewValid) return;");
    expect(gate).toContain("q: nomination.query || undefined");
    expect(gate).toContain("replace: true");
  });

  it("preserves server-owned rollout and publication boundaries", () => {
    const gate = read("src/components/v3/V3RelationshipsGate.tsx");

    expect(gate).toContain("useV3RelationshipsIndexBundle(true)");
    expect(gate).toContain("useV3EditionRolloutProbe");
    expect(gate).toContain("useV3RolloutProbe");
    expect(gate).toContain("rollout.data.resultsEnabled !== true");
    expect(gate).toContain("return <>{fallback}</>");
    expect(gate).not.toContain("localStorage");
    expect(gate).not.toContain("sessionStorage");
    expect(gate).not.toContain("window.location.search");
  });
});
