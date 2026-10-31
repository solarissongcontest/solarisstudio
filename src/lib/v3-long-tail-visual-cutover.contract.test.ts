import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("V3 long-tail visual cutover", () => {
  it("lets the outer V3 shell exclusively own physical bottom navigation clearance", () => {
    const adapter = source("src/components/v3/V3LegacyRouteShell.tsx");
    expect(adapter).toContain("padding-bottom: var(--v3-page-end-space, 28px) !important");
    expect(adapter).toContain(".solaris-app-tabbar");
    expect(adapter).toContain("display: none !important");
  });

  it("translates remaining AppShell routes away from the V2 dashboard surface language", () => {
    const adapter = source("src/components/v3/V3LegacyRouteShell.tsx");
    expect(adapter).toContain(".page-header h1");
    expect(adapter).toContain(".data-panel");
    expect(adapter).toContain("border-radius: 0 !important");
    expect(adapter).toContain("background: transparent !important");
    expect(adapter).toContain(".solaris-app-entity-sidebar");
    expect(adapter).toContain("display: none !important");
  });

  it("recomposes delegation identity, history and cross-links as flat entity content", () => {
    const country = source("src/components/v3/V3DelegationScreen.tsx");
    expect(country).toContain('data-v3-delegation-header=""');
    expect(country).toContain('data-v3-delegation-history=""');
    expect(country).not.toContain("V3ScreenHeader");
    expect(country).not.toContain("V3Surface");
    expect(country).not.toContain("V3ActionCard");
  });

  it("renders ordinary Shows discovery as flat lists while keeping filters as controls", () => {
    const shows = source("src/components/v3/V3ShowsDiscoveryScreen.tsx");
    expect(shows).toContain('data-v3-shows-directory=""');
    expect(shows).toContain('data-v3-shows-filters=""');
    expect(shows).toContain("divide-y divide-border/60 border-y");
    expect(shows).not.toContain("rounded-2xl border p-4");
    expect(shows).not.toContain("rounded-2xl border border-border bg-surface");
  });

  it("keeps Show detail canonical reads while its V2 panels are flattened by the adapter", () => {
    const show = source("src/routes/shows/$showId.tsx");
    expect(show).toContain("resolveShowPublication");
    expect(show).toContain("resolveV3ResultsSpoilerProtection");
    expect(show).toContain("ScoreboardStage");
    expect(show).toContain("ResponsiveTabs");
  });
});
