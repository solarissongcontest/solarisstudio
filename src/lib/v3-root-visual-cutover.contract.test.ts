import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("V3 root visual cutover", () => {
  it("recomposes Home around Now, editorial contest context and flat timelines", () => {
    const home = source("src/components/v3/V3HomeScreen.tsx");

    expect(home).toContain('data-v3-home-header=""');
    expect(home).toContain('data-v3-home-current-contest=""');
    expect(home).not.toContain("V3ScreenHeader");
    expect(home).not.toContain("V3Surface");
    expect(home).toContain("divide-y divide-white/[0.065] border-y");
  });

  it("turns Explore into an editorial directory instead of a grid of action cards", () => {
    const explore = source("src/components/v3/V3ExploreScreen.tsx");

    expect(explore).toContain('data-v3-explore-header=""');
    expect(explore).toContain('data-v3-explore-search=""');
    expect(explore).toContain('data-v3-explore-collections=""');
    expect(explore).toContain('data-v3-explore-current-edition=""');
    expect(explore).not.toContain("V3ActionCard");
    expect(explore).not.toContain("V3Surface");
  });

  it("makes Me identity-first and removes dashboard-card wrappers", () => {
    const me = source("src/components/v3/V3MeScreen.tsx");

    expect(me).toContain('data-v3-me-identity=""');
    expect(me).toContain('data-v3-me-activity-metrics=""');
    expect(me).not.toContain("V3ScreenHeader");
    expect(me).not.toContain("V3ActionCard");
    expect(me).not.toContain("V3Surface");
  });

  it("removes nested task surfaces from Participate while keeping task emphasis", () => {
    const participate = source("src/components/v3/V3ParticipateScreen.tsx");

    expect(participate).toContain('data-v3-participate-header=""');
    expect(participate).toContain('data-v3-participate-task-list=""');
    expect(participate).not.toContain("V3ScreenHeader");
    expect(participate).not.toContain("V3Surface");
    expect(participate).toContain("V3ActionCard");
  });

  it("keeps Results projections intact while flattening archive, personal and analysis navigation", () => {
    const results = source("src/components/v3/V3ResultsScreen.tsx");

    expect(results).toContain('data-v3-results-header=""');
    expect(results).toContain('data-v3-results-mode-control=""');
    expect(results).toContain("buildV3ResultsProjection");
    expect(results).toContain("V3ScoreboardPresentation");
    expect(results).not.toContain("V3ScreenHeader");
    expect(results).not.toContain("V3Surface");
  });
});
