import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const search = readFileSync("src/routes/rules/search.tsx", "utf8");
const detail = readFileSync("src/components/rules/RuleDetailV5.tsx", "utf8");

describe("V3 Rules reading parity", () => {
  it("keeps rule search available while long results scroll", () => {
    expect(search).toContain('data-v3-rules-search-sticky=""');
    expect(search).toContain("sticky top-[calc(4.35rem+env(safe-area-inset-top))]");
    expect(search).toContain('aria-label="Search rules"');
    expect(search).toContain('enterKeyHint="search"');
  });

  it("gives long rule detail a safe-area-aware sticky orientation rail", () => {
    expect(detail).toContain('data-v3-rule-context-rail="sticky"');
    expect(detail).toContain("lg:sticky lg:top-[calc(5rem+env(safe-area-inset-top))]");
    expect(detail).toContain('aria-label="On this rule"');
    expect(detail).toContain('href="#official-rule-text"');
    expect(detail).toContain('to="/rules/search"');
  });

  it("preserves deep-linkable rule sections with sticky-scroll clearance", () => {
    for (const anchor of [
      "official-rule-text",
      "rule-practical-meaning",
      "rule-key-points",
      "rule-examples",
    ]) {
      expect(detail).toContain(`id="${anchor}"`);
    }
    expect(detail).toContain("scroll-mt-36");
  });
});
