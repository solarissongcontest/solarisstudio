import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { V3_PUBLIC_CAPABILITY_REGISTRY } from "./v3-public-capability-registry";
import { decideV3ShellForRoute } from "./v3-shell-route-boundary";

function decide(pathname: string, search = "", enabled = true) {
  return decideV3ShellForRoute({
    pathname,
    search,
    rolloutRule: { stage: enabled ? "enabled" : "disabled" },
    rolloutContext: { userId: null, editionId: null, isOrganizer: false },
    isAuthenticated: false,
  });
}

describe("Public non-route canonical replacement ownership", () => {
  it("maps Search to the real V3 shell overlay and preserves server-controlled rollback", () => {
    const row = V3_PUBLIC_CAPABILITY_REGISTRY.find((item) => item.id === "global-search")!;
    expect(row.targetRoute).toBe("/");
    expect(row.replacementSurface).toEqual({
      kind: "shell-overlay",
      ownerComponent: "src/components/public/PublicCommandPalette.tsx",
      hostRoute: "/",
      replacesLegacyRoutes: ["/search"],
    });
    expect(decide(row.targetRoute)).toMatchObject({ useV3Shell: true, rootTab: "home", pathname: "/" });
    expect(decide(row.targetRoute, "", false)).toMatchObject({ useV3Shell: false, reason: "disabled" });
    const shell = readFileSync("src/components/v3/V3AppShell.tsx", "utf8");
    const palette = readFileSync(row.replacementSurface.ownerComponent, "utf8");
    expect(shell).toContain("<PublicCommandPalette compact />");
    expect(shell).toContain('data-v3-search-owner="canonical"');
    expect(shell).toContain("rollout.data?.searchEnabled === true");
    expect(palette).toContain('rpc("solaris_public_search"');
    expect(palette).toContain('contentLayout="fullscreen"');
    expect(row.specificationStatus).toBe("parity");
  });

  it("maps Scoreboard to real show-detail presentation without inventing a ranking owner", () => {
    const row = V3_PUBLIC_CAPABILITY_REGISTRY.find((item) => item.id === "scoreboard")!;
    expect(row.targetRoute).toBe("/shows/:showId");
    expect(row.replacementSurface).toEqual({
      kind: "embedded-presentation",
      ownerComponent: "src/components/v3/V3ScoreboardPresentation.tsx",
      hostRoute: "/shows/:showId",
      replacesLegacyRoutes: ["/scoreboard", "/scoreboard/*"],
    });
    const pathname = row.targetRoute.replace(":showId", "14000000-0000-4000-8000-000000000011");
    expect(decide(pathname, "?from=results")).toMatchObject({ useV3Shell: true, rootTab: "results", pathname });
    expect(decide(pathname)).toMatchObject({ useV3Shell: true, rootTab: "explore", pathname });
    expect(decide(pathname, "?from=results", false)).toMatchObject({ useV3Shell: false, reason: "disabled" });
    const stage = readFileSync("src/components/ScoreboardStage.tsx", "utf8");
    const gate = readFileSync("src/components/v3/V3PublicScoreboardGate.tsx", "utf8");
    const route = readFileSync("src/routes/shows/$showId.tsx", "utf8");
    const presentation = readFileSync(row.replacementSurface.ownerComponent, "utf8");
    expect(route).toContain("<V3PublicScoreboardGate");
    expect(gate).toContain("useV3PublicScoreboard(showId, enabled)");
    expect(gate).toContain("<V3ScoreboardPresentation");
    expect(stage).not.toContain("<V3ScoreboardPresentation");
    expect(presentation).toContain("standings: readonly Standing[]");
    expect(presentation).not.toContain("useQuery(");
    expect(presentation).not.toContain("supabase");
    expect(row.specificationStatus).toBe("cutover");
    expect(row.migrationEvidence).toContain("src/lib/v3-public-scoreboard.test.tsx");
  });

  it("retains every former route as an explicit replacement relationship with independent owner acceptance", () => {
    for (const row of V3_PUBLIC_CAPABILITY_REGISTRY) {
      if (!("replacementSurface" in row)) continue;
      expect(row.replacementSurface.hostRoute).toBe(row.targetRoute);
      expect(row.replacementSurface.replacesLegacyRoutes).toEqual(row.legacyRoutes);
      if (row.id === "global-search") expect(row.specificationStatus).toBe("parity");
      if (row.id === "scoreboard") {
        expect(row.specificationStatus).toBe("cutover");
        expect(row.migrationEvidence).toContain("src/integrations/v3/scoreboard-source.server.ts");
      }
    }
  });
});
