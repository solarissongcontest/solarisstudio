import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = () => readFileSync(resolve(process.cwd(), "src/components/world/WorldPublic.tsx"), "utf8");
const styles = () => readFileSync(resolve(process.cwd(), "src/styles/v3-world-editorial.css"), "utf8");

describe("Terra Solaris World editorial web composition", () => {
  it("replaces generic launch copy with concise World identity and retains canonical navigation", () => {
    const screen = source();
    expect(screen).toContain('className="world-editorial-landing"');
    expect(screen).toContain(">Terra Solaris</h1>");
    expect(screen).toContain("Countries, alliances and institutions.");
    expect(screen).not.toContain("A world beyond the stage.");
    expect(screen).toContain('to="/world/organizations"');
    expect(screen).toContain('to="/countries"');
  });

  it("retains rollout gate and published public projection boundaries", () => {
    const screen = source();
    expect(screen).toContain("queryFn: fetchWorldPublicEnabled");
    expect(screen).toContain("publicWorldRolloutDisplay(rollout, verifyOnMount)");
    expect(screen).toContain('if (publication === "disabled")');
    expect(screen).toContain("queryFn: fetchFeaturedWorldOrganizations");
    expect(screen).toContain("queryFn: () => fetchWorldDirectory({ term, filter, page })");
    expect(screen).toContain("queryFn: () => fetchWorldProjection(slug)");
    expect(screen).not.toContain(".insert(");
    expect(screen).not.toContain(".upsert(");
    expect(screen).not.toContain(".delete(");
  });

  it("only styles regular web and keeps actual organization's identity", () => {
    const css = styles();
    const screen = source();
    expect(css).toContain("html:not([data-solaris-app]) .world-editorial-frame");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("forced-colors: active");
    expect(screen).toContain("organization.officialName !== organization.shortName");
    expect(screen).toContain("organization.description");
    expect(screen).toContain("organization.slug");
    expect(screen).toContain("projection.data.organization.shortName");
  });
});
