import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Solaris Studio V3 context projection architecture", () => {
  it("builds on parent Action/Attention and domain-state contracts instead of duplicating them", () => {
    const projection = source("src/lib/v3-context-projections.ts");
    expect(projection).toContain('from "./v3-experience"');
    expect(projection).toContain('from "./v3-domain-state"');
    expect(projection).toContain("projectV3Actions");
    expect(projection).toContain("projectV3Attention");
    expect(projection).toContain("projectV3Experience");
    expect(projection).not.toContain("export type V3Urgency");
    expect(projection).not.toContain("export type V3Impact");
    expect(projection).not.toContain("export type V3EditionState");
    expect(projection).not.toContain("export type V3ShowState");
  });

  it("keeps the projection layer pure and unable to create database traffic", () => {
    const projection = source("src/lib/v3-context-projections.ts");
    expect(projection).not.toContain("@supabase");
    expect(projection).not.toContain("createClient(");
    expect(projection).not.toContain("fetch(");
    expect(projection).not.toContain("useQuery(");
    expect(projection).not.toContain("useEffect(");
  });

  it("keeps Results out of the responsibility journey", () => {
    const projection = source("src/lib/v3-context-projections.ts");
    expect(projection).toContain(
      'const JOURNEY_KIND_ORDER = ["confirmation", "entry", "media", "jury"] as const',
    );
    expect(projection).not.toMatch(/JOURNEY_KIND_ORDER[^\n]*results/i);
  });

  it("carries versioned context instead of encouraging client-only truth", () => {
    const projection = source("src/lib/v3-context-projections.ts");
    expect(projection).toContain("stateVersion");
    expect(projection).toContain("serverTime");
    expect(projection).toContain("schemaVersion");
  });
});
