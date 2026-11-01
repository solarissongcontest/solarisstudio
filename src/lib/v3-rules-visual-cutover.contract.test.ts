import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = () =>
  readFileSync(resolve(process.cwd(), "src/components/rules/RulesHomeV5.tsx"), "utf8");

describe("V3 Rules visual cutover", () => {
  it("uses one coherent header hierarchy for official version metadata", () => {
    const rules = source();

    expect(rules).toContain('data-v3-rules-header=""');
    expect(rules).toContain("Official regulations");
    expect(rules).toContain("General Regulations · v{version}");
    expect(rules).toContain("Previous versions");
    expect(rules).toContain('data-v3-rulebook-release-meta=""');
  });

  it("keeps search important without wrapping it in a dashboard surface", () => {
    const rules = source();

    expect(rules).toContain('data-v3-rules-search=""');
    expect(rules).toContain("Search rules or ask a question…");
    expect(rules).toContain("Ask about a rule");
    expect(rules).not.toContain("SolarisDepthSurface");
  });

  it("renders Quick Answers and browsing as flat native lists", () => {
    const rules = source();

    expect(rules).toContain('data-v3-rules-quick-answers=""');
    expect(rules).toContain('data-v3-rules-browse=""');
    expect(rules).toContain("divide-y divide-white/[0.075] border-y");
    expect(rules).not.toContain("solaris-depth-row");
    expect(rules).not.toContain("solaris-depth-verdict");
  });
});
