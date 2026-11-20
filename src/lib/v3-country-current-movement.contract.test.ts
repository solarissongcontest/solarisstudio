import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const countries = readFileSync("src/components/v3/V3CountriesDiscoveryScreen.tsx", "utf8");
const styles = readFileSync("src/styles/v3-countries-discovery.css", "utf8");

describe("Explore countries editorial movement and stale filter protection", () => {
  it("only advertises movement after the authoritative public lineup read succeeds", () => {
    expect(countries).toContain("const currentLineupReady = Boolean(activeEdition?.id) && participantsQuery.isSuccess");
    expect(countries).toContain("currentParticipants: participantsQuery.isSuccess ? participantsQuery.data ?? [] : []");
    expect(countries).toContain("currentLineupReady && movementGroups.length > 0");
    expect(countries).toContain('href="#countries-current-movement"');
    expect(countries).toContain('id="countries-current-movement"');
    expect(countries).not.toContain("useAllResults(");
  });

  it("never claims the previous region exists when published lineup facets change", () => {
    expect(countries).toContain("resolvePublicDirectoryFacet(region, regionOptions.map");
    expect(countries).toContain('if (region !== effectiveRegion) setRegion("all")');
    expect(countries).toContain("region: effectiveRegion");
    expect(countries).toContain("value={effectiveRegion}");
    expect(countries).toContain("aria-pressed={effectiveRegion === item.name}");
  });

  it("provides visible responsive keyboard and forced-colour styling", () => {
    expect(styles).toContain(".v3-countries-current-pulse__link:focus-visible");
    expect(styles).toContain("#countries-current-movement");
    expect(styles).toContain("@media (max-width: 28rem)");
    expect(styles).toContain("@media (forced-colors: active)");
  });
});
