import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("V3 Delegation Edition context", () => {
  it("derives Edition links only from the published Edition catalogue keyed by stable edition id", () => {
    const server = source("src/integrations/v3/delegation-source.server.ts");

    expect(server).toContain('.eq("published", true)');
    expect(server).toContain("const editionHrefById = new Map<string, string>()");
    expect(server).toContain("editionHrefById.set(id, `/editions/${encodeURIComponent(slug)}`)");
    expect(server).toContain("buildV3CountryExploreProjection(identity, editionHrefById)");
    expect(server).not.toMatch(/editionLabel.*encodeURIComponent|slugify.*editionLabel/i);
  });

  it("keeps current and historical Edition navigation inside the publication-safe projection", () => {
    const projection = source("src/lib/v3-explore-entities.ts");
    const screen = source("src/components/v3/V3DelegationScreen.tsx");

    expect(projection).toContain("editionHref: string | null");
    expect(projection).toContain("editionHrefById.get(editionId)");
    expect(screen).toContain("if (!entry.editionHref)");
    expect(screen).toContain("to={entry.editionHref as any}");
    expect(screen).not.toMatch(/editionLabel.*\/editions|encodeURIComponent\(entry\.editionLabel\)/);
  });
});
