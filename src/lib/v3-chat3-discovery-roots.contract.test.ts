import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("V3 Public completion Chat 3 discovery roots", () => {
  it("keeps Countries as discovery first and the complete directory secondary", () => {
    const route = source("src/routes/countries/index.tsx");
    const screen = source("src/components/v3/V3CountriesDiscoveryScreen.tsx");

    expect(route).toContain("V3CountriesDiscoveryScreen");
    expect(screen).toContain('eyebrow={discovery.currentEdition ? "Current edition" : "Between editions"}');
    expect(screen).toContain('eyebrow="Current movement"');
    expect(screen).toContain('eyebrow="Explore by region"');
    expect(screen).toContain('eyebrow="Browse all"');
    expect(screen.indexOf('eyebrow="Browse all"')).toBeGreaterThan(
      screen.indexOf('eyebrow="Explore by region"'),
    );
    expect(screen).toContain("usePublicEditionParticipants(activeEdition?.id)");
    expect(screen).not.toContain("useAllParticipants");
    expect(screen).not.toContain("useAllResults");
    expect(screen).not.toContain("useAllJuryVotes");
    expect(screen).not.toContain("useAllTelevotes");
  });

  it("keeps Shows state-led instead of rendering edition headings followed by one grouped list", () => {
    const route = source("src/routes/shows/index.tsx");
    const screen = source("src/components/v3/V3ShowsDiscoveryScreen.tsx");

    expect(route).toContain("V3ShowsDiscoveryScreen");
    expect(screen).toContain('eyebrow="Live now"');
    expect(screen).toContain('eyebrow="Up next"');
    expect(screen).toContain('eyebrow="Recent"');
    expect(screen).toContain('eyebrow="Current edition"');
    expect(screen).toContain('eyebrow="Browse"');
    expect(screen).toContain('eyebrow="Archive"');
    expect(screen).toContain("showPublishesResults(item.show)");
    expect(screen).toContain("item.broadcastUrl");
    expect(screen).not.toContain("useAllResults");
    expect(screen).not.toContain("useCountries");
  });

  it("keeps paused, delayed, cancelled and terminal edition states in the shared model", () => {
    const model = source("src/lib/v3-discovery-entities.ts");

    for (const state of ["paused", "delayed", "cancelled", "ended"] as const) {
      expect(model).toContain(`\"${state}\"`);
    }
    expect(model).toContain('state === "post_edition" || state === "archived"');
    expect(model).toContain("participation_status");
  });
});
