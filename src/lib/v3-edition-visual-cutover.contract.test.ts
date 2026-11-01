import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = () =>
  readFileSync(resolve(process.cwd(), "src/components/v3/V3EditionOverviewScreen.tsx"), "utf8");

describe("V3 Edition visual cutover", () => {
  it("replaces the old hero-card and pill-heavy overview composition", () => {
    const edition = source();

    expect(edition).toContain('data-v3-edition-hero=""');
    expect(edition).toContain('data-v3-edition-local-nav=""');
    expect(edition).not.toContain("V3ScreenHeader");
    expect(edition).not.toContain("V3ActionCard");
    expect(edition).not.toContain('title="At a glance"');
    expect(edition).not.toMatch(/rounded-full border border-white\/10 bg-white/);
  });

  it("uses flat metrics and content rows instead of mini-dashboard cards", () => {
    const edition = source();

    expect(edition).toContain('data-v3-edition-metrics=""');
    expect(edition).toContain("divide-y divide-white/[0.065] border-y");
    expect(edition).toContain("Published editorial timeline");
  });

  it("keeps collection actions deliberately separated from the preceding list", () => {
    const edition = source();

    expect(edition).toContain('data-v3-section-footer-action=""');
    expect(edition).toMatch(/mt-4 flex min-h-11[\s\S]*border-t[\s\S]*pt-3/);
    expect(edition).toContain("Browse all {projection.entries.length} songs");
    expect(edition).toContain("Open full schedule");
  });

  it("preserves publication and spoiler guards while changing presentation", () => {
    const edition = source();

    expect(edition).toContain('projection.results.state === "locked"');
    expect(edition).toContain("spoilerSafe");
    expect(edition).toContain("Reveal edition spoilers");
    expect(edition).toContain("projection.results.showHref");
  });
});
