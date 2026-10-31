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
});
