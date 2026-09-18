import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { countryPersonalitySource } from "./country-personality-sources";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const manifest = (path: string) => JSON.parse(source(path)) as Record<string, unknown>;

describe("source-driven Country personality batch three", () => {
  it("loads the four new source adapters after the V8 compatibility foundation", () => {
    const styles = source("src/components/CountryPersonalityStyles.tsx");
    expect(styles).toContain('brutalist-source.adapter.css?inline');
    expect(styles).toContain('luxury-source.adapter.css?inline');
    expect(styles).toContain('scientific-source.adapter.css?inline');
    expect(styles).toContain('civic-source.adapter.css?inline');
  });

  it("uses source-derived grammar for Brutalist, Luxury, Scientific and Civic", () => {
    const brutalist = source("src/styles/personalities/brutalist-source.adapter.css");
    const luxury = source("src/styles/personalities/luxury-source.adapter.css");
    const scientific = source("src/styles/personalities/scientific-source.adapter.css");
    const civic = source("src/styles/personalities/civic-source.adapter.css");

    expect(brutalist).toContain("RampStack Brutalist Web Theme translated adapter");
    expect(brutalist).toContain("--bw-rule-heavy: 6px");
    expect(brutalist).toContain("transition: none !important");

    expect(luxury).toContain("Aimeos Pagible Luxury translated adapter");
    expect(luxury).toContain("Bodoni 72");
    expect(luxury).toContain("letter-spacing: .32em");

    expect(scientific).toContain("IBM Carbon translated adapter");
    expect(scientific).toContain("--carbon-05: 1rem");
    expect(scientific).toContain("font-variant-numeric: tabular-nums");

    expect(civic).toContain("U.S. Web Design System translated adapter");
    expect(civic).toContain("--uswds-site-mobile: 1rem");
    expect(civic).toContain("USWDS summary-box translation");
  });

  it("promotes the new rendered personalities from planned to prototype", () => {
    for (const id of ["duotone", "monument", "horizon", "flag-focus"] as const) {
      expect(countryPersonalitySource(id).status).toBe("prototype");
    }
  });

  it("records file-level provenance for the third batch", () => {
    expect(manifest("src/styles/personality-sources/brutalist/source-manifest.json")).toMatchObject({
      repository: "rampstackco/brutalist-web-theme",
      license: "MIT",
      implementationMode: "translated-components",
    });
    expect(manifest("src/styles/personality-sources/luxury/source-manifest.json")).toMatchObject({
      repository: "aimeos/pagible-themes-luxury",
      license: "MIT",
      implementationMode: "translated-components",
    });
    expect(manifest("src/styles/personality-sources/scientific/source-manifest.json")).toMatchObject({
      repository: "carbon-design-system/carbon",
      license: "Apache-2.0",
      implementationMode: "translated-components",
    });
    expect(manifest("src/styles/personality-sources/civic/source-manifest.json")).toMatchObject({
      repository: "uswds/uswds",
      implementationMode: "translated-components",
    });
  });
});
