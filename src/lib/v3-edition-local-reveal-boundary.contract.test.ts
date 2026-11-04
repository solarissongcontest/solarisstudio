import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const overview = readFileSync(
  resolve(process.cwd(), "src/components/v3/V3EditionOverviewScreen.tsx"),
  "utf8",
);

describe("V3 Edition local spoiler reveal stays within its route", () => {
  it("keeps the page-local reveal independent of the global spoiler preference", () => {
    expect(overview).toContain("const spoilerSafe = hideSpoilers && !revealed");
    expect(overview).toContain("onReveal={() => setRevealed(true)}");
    expect(overview).toContain("Your spoiler-free preference stays unchanged");
    expect(overview).not.toContain("update({ spoilerFree");
  });

  it("keeps the Stories and Results collection links blocked by the global preference", () => {
    expect(overview).toContain("globalSpoilerProtection={hideSpoilers}");
    expect(overview).toContain(
      'locked: globalSpoilerProtection || spoilerSafe || !projection.story,',
    );
    expect(overview).toContain(
      'locked: globalSpoilerProtection || spoilerSafe || projection.results.state !== "available",',
    );
  });

  it("does not turn a local reveal into a direct cross-product Story or Results action", () => {
    expect(overview).toMatch(
      /!hideSpoilers\s*\?\s*\(\s*<V3ActionCard\s+title="Open full story"/,
    );
    expect(
      overview.match(/!hideSpoilers && projection\.results\.showHref/g),
    ).toHaveLength(2);
    expect(overview).toContain("title=\"Open official result\"");
    expect(overview).toContain("title=\"Open complete official result\"");
  });
});
