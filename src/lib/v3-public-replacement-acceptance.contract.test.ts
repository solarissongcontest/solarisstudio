import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { V3_PUBLIC_CAPABILITY_REGISTRY } from "./v3-public-capability-registry";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const capability = (id: string) => {
  const value = V3_PUBLIC_CAPABILITY_REGISTRY.find((item) => item.id === id);
  if (!value) throw new Error(`Missing Public capability ${id}`);
  return value;
};

describe("Public V3 replacement acceptance", () => {
  it("accepts Global Search as the shell-owned canonical replacement for /search", () => {
    const search = capability("global-search");
    expect(search.specificationStatus).toBe("cutover");
    expect(search.targetRoute).toBe("/");
    expect(search.replacementSurface).toEqual({
      kind: "shell-overlay",
      ownerComponent: "src/components/public/PublicCommandPalette.tsx",
      hostRoute: "/",
      replacesLegacyRoutes: ["/search"],
    });

    for (const path of [
      "src/routes/search.tsx",
      "src/routes/search/index.tsx",
      "src/routes/search/route.tsx",
    ]) {
      expect(existsSync(resolve(process.cwd(), path)), path).toBe(false);
    }

    const shell = read("src/components/v3/V3AppShell.tsx");
    const palette = read("src/components/public/PublicCommandPalette.tsx");
    const contract = read("src/lib/v3-search-cutover.contract.test.ts");
    const browser = read("e2e/v3-search.e2e.ts");
    const migration = read("supabase/migrations/20261013140000_v3_search_cutover.sql");

    expect(shell).toContain('data-v3-search-owner="canonical"');
    expect(shell).toContain("<PublicCommandPalette compact />");
    expect(palette).toContain('rpc("solaris_public_search"');
    expect(palette).toContain("result_limit: 30");
    expect(contract).toContain("does not create duplicate Search owners");
    expect(browser).toContain('data-v3-search-owner="canonical"');
    expect(browser).toContain("toHaveCount(1)");
    expect(browser).toContain("/countries/BRW");
    expect(migration).toContain("public.public_safe_participants(null, null)");
    expect(migration).not.toMatch(/from\s+public\.participants\b/i);
    expect(migration).not.toMatch(/from\s+public\.results\b/i);
  });

  it("accepts Scoreboard as the show-detail embedded replacement for standalone aliases", () => {
    const scoreboard = capability("scoreboard");
    expect(scoreboard.specificationStatus).toBe("cutover");
    expect(scoreboard.targetRoute).toBe("/shows/:showId");
    expect(scoreboard.replacementSurface).toEqual({
      kind: "embedded-presentation",
      ownerComponent: "src/components/v3/V3ScoreboardPresentation.tsx",
      hostRoute: "/shows/:showId",
      replacesLegacyRoutes: ["/scoreboard", "/scoreboard/*"],
    });

    for (const path of [
      "src/routes/scoreboard.tsx",
      "src/routes/scoreboard/index.tsx",
      "src/routes/scoreboard/route.tsx",
    ]) {
      expect(existsSync(resolve(process.cwd(), path)), path).toBe(false);
    }

    const route = read("src/routes/shows/$showId.tsx");
    const stage = read("src/components/ScoreboardStage.tsx");
    const presentation = read("src/components/v3/V3ScoreboardPresentation.tsx");
    const contract = read("src/lib/v3-scoreboard-cutover.contract.test.ts");

    expect(route).toContain('createFileRoute("/shows/$showId")');
    expect(route).toContain("publication.results &&");
    expect(route).toContain("<ScoreboardStage");
    expect(stage).toContain("/^\\/shows\\/[^/]+\\/?$/");
    expect(stage).toContain("rollout.data?.scoreboardEnabled === true");
    expect(stage).toContain("<V3ScoreboardPresentation");
    expect(stage).toContain("resolveScoreboard");
    expect(contract).toContain("preserves the proven scoreboard as the fail-closed fallback");
    expect(presentation).not.toContain("useResults(");
    expect(presentation).not.toContain("useAllResults(");
    expect(presentation).not.toContain("supabase");
    expect(presentation).not.toContain("createServerFn");
    expect(presentation).not.toContain("b.total - a.total");
    expect(presentation).toContain("Identity unavailable");
  });
});
