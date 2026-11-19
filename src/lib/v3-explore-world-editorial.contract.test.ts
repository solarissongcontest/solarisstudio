import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const gate = readFileSync("src/components/v3/V3ExploreRouteGate.tsx", "utf8");
const legacy = readFileSync("src/routes/explore/index.tsx", "utf8");
const entry = readFileSync("src/components/world/WorldExploreEntry.tsx", "utf8");
const screen = readFileSync("src/components/v3/V3ExploreScreen.tsx", "utf8");
const style = readFileSync("src/styles/v3-explore-editorial.css", "utf8");

describe("V3 Explore editorial World discovery integration", () => {
  it("keeps World hidden unless BOTH public route and server rollout allow it", () => {
    expect(gate).toContain('allowsReleased("/world")');
    expect(gate).toContain("enabled: shouldLoadBundle && worldRouteAllowed");
    expect(gate).toContain("worldRollout.isSuccess");
    expect(gate).toContain("!worldRollout.isFetching");
    expect(gate).toContain("worldRollout.data === true");
    expect(entry).toContain('enabled: routeAllowed');
    expect(entry).toContain("!rollout.isSuccess || rollout.isFetching");
    expect(entry).toContain("rollout.data !== true");
    expect(entry).toContain("fetchWorldPublicEnabled");
    expect(entry).toContain('href="/world"');
  });

  it("gives World one true entry in website and PWA compositions, not a second World reader", () => {
    expect(legacy).toContain("<WorldExploreEntry />");
    expect(screen).toContain("<WorldV3ExploreEntry enabled={showWorld} />");
    expect(entry).not.toContain('from("world_organizations")');
    expect(entry).not.toContain("world_organization_projection_v1");
  });

  it("replaces stacked Explore directory cards with readable editorial rows and image-first featured edition", () => {
    expect(screen).toContain("v3-explore-feature__visual");
    expect(screen).toContain("projection.discover.map");
    expect(screen).toContain("projection.archive.links.map");
    expect(screen).toContain('className="v3-explore-editorial-list"');
    expect(style).toContain("min-height: 4.65rem");
    expect(style).toContain("linear-gradient(0deg");
    expect(style).toContain("font-variant-numeric: tabular-nums");
  });
});
