import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/components/rules/RulesHomeV5.tsx", "utf8");
const styles = readFileSync("src/styles/v3-rules-editorial.css", "utf8");

describe("Rules web editorial layout", () => {
  it("puts the actual rulebook before supporting promotion and quick answers", () => {
    const rulebook = page.indexOf("<SolarisDepthEyebrow>Rulebook");
    const answers = page.indexOf("<SolarisDepthEyebrow>Quick answers");
    const spotlight = page.indexOf('to="/rules/chapters/$chapter" params={{ chapter: "roleplay-worldbuilding" }}');

    expect(rulebook).toBeGreaterThan(0);
    expect(answers).toBeGreaterThan(rulebook);
    expect(spotlight).toBeGreaterThan(answers);
  });

  it("keeps search accessible and keyboard-submit friendly", () => {
    expect(page).toContain('role="search"');
    expect(page).toContain('htmlFor="v3-rules-query"');
    expect(page).toContain('id="v3-rules-query"');
    expect(page).toContain('type="search"');
    expect(page).toContain('event.preventDefault()');
    expect(page).toContain('submitSearch()');
    expect(page).not.toContain('<label className="flex min-h-14');
  });

  it("keeps published rulebook provenance and optional suggestions", () => {
    expect(page).toContain('data-v3-rulebook-release-meta=""');
    expect(page).toContain("effectiveDate");
    expect(page).toContain('to="/rules/changes"');
    expect(page).toContain('<details className="v3-rules-search-suggestions');
    expect(page).toContain("GovernanceStatusStrip");
  });

  it("does not leak browser editorial layout into installed PWA chrome", () => {
    expect(styles).toContain('html:not([data-solaris-app]) .v3-rules-editorial');
    expect(styles).not.toMatch(/position:\s*fixed/);
    expect(styles).not.toMatch(/!important/);
  });
});
