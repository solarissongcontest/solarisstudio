import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("V3 Country current-result boundary", () => {
  it("keeps country identity and result authority separate", () => {
    const delegation = source("src/integrations/v3/delegation-source.server.ts");

    expect(delegation).toContain('client.rpc("v3_public_country_profile"');
    expect(delegation).toContain("loadV3ResultsBundle()");
    expect(delegation).not.toContain('.from("results")');
    expect(delegation).not.toContain('.from("jury_votes")');
    expect(delegation).not.toContain('.from("televote_votes")');
  });

  it("requires exact current-edition and stable country identity", () => {
    const delegation = source("src/integrations/v3/delegation-source.server.ts");

    expect(delegation).toContain("resultsBundle.input.editionId !== input.currentEdition.id");
    expect(delegation).toContain("candidate.canonicalCountryId === input.countryId");
    expect(delegation).not.toMatch(/countryName\s*===\s*input\.(countryName|name)/);
    expect(delegation).not.toMatch(/shortCode\s*===|code\s*===\s*input\.code/);
  });

  it("redacts unpublished Jury and Televote splits before the browser bundle", () => {
    const results = source("src/integrations/v3/results-source.server.ts");

    expect(results).toContain(
      "juryPoints: publication.jury_results === true ? row.jury_points : null",
    );
    expect(results).toContain(
      "televotePoints: publication.televote_results === true ? row.televote_points : null",
    );
    expect(results).not.toContain("juryPoints: row.jury_points,\n      televotePoints: row.televote_points");
  });

  it("treats current-result context as supplemental and fail-closed", () => {
    const delegation = source("src/integrations/v3/delegation-source.server.ts");

    expect(delegation).toContain("async function loadCurrentPublishedResult");
    expect(delegation).toContain("if (!input.currentEdition) return null");
    expect(delegation).toContain("catch {");
    expect(delegation).toContain("return null;");
  });

  it("uses the shared spoiler preference authority before rendering rank or points", () => {
    const gate = source("src/components/v3/V3DelegationRouteGate.tsx");
    const screen = source("src/components/v3/V3DelegationScreen.tsx");

    expect(gate).toContain("resolveV3ResultsSpoilerProtection({");
    expect(gate).toContain("localSpoilerFree: preferences.spoilerFree");
    expect(gate).toContain("serverSpoilerFree: serverPreferences.data?.spoiler_free ?? null");
    expect(gate).toContain("hideResultSpoilers={hideResultSpoilers}");
    expect(screen).toContain("hideResultSpoilers ? (");
    expect(screen).toContain("Official result published");
    expect(screen).toContain("#{currentResult.rank} · {currentResult.points} pts");
  });

  it("keeps direct result navigation on the canonical Show/Results path", () => {
    const delegation = source("src/integrations/v3/delegation-source.server.ts");
    const projection = source("src/lib/v3-explore-entities.ts");

    expect(delegation).toContain(
      "showHref: `/shows/${encodeURIComponent(resultsBundle.input.showId)}?from=results`",
    );
    expect(projection).toContain("currentResult: V3CountryCurrentResult | null");
    expect(projection).toContain("resultsDestination: '/results'");
  });
});
