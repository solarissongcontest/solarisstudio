import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const country = readFileSync("src/components/v3/V3DelegationScreen.tsx", "utf8");
const gate = readFileSync("src/components/v3/V3DelegationRouteGate.tsx", "utf8");
const edition = readFileSync("src/components/v3/V3EditionOverviewScreen.tsx", "utf8");
const css = readFileSync("src/styles/v3-cinematic-entities.css", "utf8");

describe("Explore Country/Edition cinematic second pass", () => {
  it("keeps World navigation behind a fresh public rollout decision", () => {
    expect(gate).toContain('allowsReleased("/world")');
    expect(gate).toContain("enabled: shouldLoadBundle && worldRouteAllowed");
    expect(gate).toContain("worldRollout.isSuccess");
    expect(gate).toContain("!worldRollout.isFetching");
    expect(gate).toContain("!worldRollout.isRefetchError");
    expect(gate).toContain("worldRollout.data === true");
    expect(country).toContain('worldEnabled ? <a href="#country-world">World</a>');
    expect(country).toContain('id="country-world"');
    expect(country).not.toContain('to="/world/countries/$code"');
  });
  it("preserves all published participation data in one calm history list", () => {
    expect(country).toContain("projection.participationHistory.map((entry)");
    expect(country).toContain('className="cinematic-country-history"');
    expect(country).toContain('className="cinematic-country-related"');
    expect(country).toContain("Published participation history");
    expect(css).toContain(".cinematic-country-history__row");
  });
  it("positions Edition nav before other sections and displays flat facts", () => {
    const n = edition.indexOf("      <SectionNav");
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(edition.indexOf("{projection.hub.liveAction ?"));
    expect(edition).toContain('className="cinematic-edition-facts"');
    expect(edition).toContain("<dt>{label}</dt>");
    expect(edition).toContain("<dd>{value}</dd>");
    expect(edition).toContain("cinematic-edition-entity-list");
    expect(edition).toContain("canOpenV3EditionResults");
  });
});
