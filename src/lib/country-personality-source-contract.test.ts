import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  COUNTRY_PERSONALITY_SOURCES,
  countryPersonalitySource,
} from "./country-personality-sources";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const manifest = (path: string) => JSON.parse(source(path)) as Record<string, unknown>;

describe("source-driven Country personality contract", () => {
  it("freezes one canonical human-designed source for all seventeen personalities", () => {
    expect(COUNTRY_PERSONALITY_SOURCES).toHaveLength(17);
    expect(new Set(COUNTRY_PERSONALITY_SOURCES.map((item) => item.id)).size).toBe(17);

    const expected = new Map([
      ["glass-card", "Sam Asante liquid-glass"],
      ["editorial", "Tufte CSS"],
      ["passport", "Jesus Ramirez International Airline Ticket CSS"],
      ["poster", "RampStack Swiss Style Theme"],
      ["heritage", "The National Archives Design System"],
      ["broadcast", "BBC GEL Grid + GEL Typography"],
      ["minimal", "Pico CSS"],
      ["panorama", "MapLibre GL JS"],
      ["classic", "GOV.UK Frontend"],
      ["spotlight", "GDG-X Hoverboard"],
      ["duotone", "RampStack Brutalist Web Theme"],
      ["sci-fi", "98.css"],
      ["monument", "Aimeos Pagible Luxury"],
      ["newspaper", "Guardian Source / Interactive Style Library"],
      ["horizon", "IBM Carbon"],
      ["flag-focus", "USWDS"],
      ["ribbon", "Superilles Grid System"],
    ]);

    for (const personality of COUNTRY_PERSONALITY_SOURCES) {
      expect(personality.sourceName).toBe(expected.get(personality.id));
      expect(personality.license.length).toBeGreaterThan(2);
      expect(personality.visualAuthority.length).toBeGreaterThan(8);
      expect(personality.flag.mobile[0]).toBeLessThanOrEqual(168);
      expect(personality.flag.mobile[1]).toBeLessThanOrEqual(112);
      expect(personality.backgroundModes.length).toBeGreaterThan(0);
      expect(personality.backgroundModes).toContain("solid");
      expect(countryPersonalitySource(personality.id).sourceName).toBe(personality.sourceName);
    }
  });

  it("pins the four architecture-proof sources before their adapters are accepted", () => {
    expect(countryPersonalitySource("minimal")).toMatchObject({
      repository: "picocss/pico",
      version: "2.1.1",
      pinnedRef: "1039a4788d6abc368d5485ae6bac84a8f0e3096f",
      status: "prototype",
    });
    expect(countryPersonalitySource("sci-fi")).toMatchObject({
      repository: "jdan/98.css",
      version: "0.1.21",
      pinnedRef: "b1d7a907371bbe523d6f64e3af97f714fdbd6d6a",
      status: "prototype",
    });
    expect(countryPersonalitySource("editorial")).toMatchObject({
      repository: "edwardtufte/tufte-css",
      version: "1.9.0",
      pinnedRef: "b5d7b7bbe5ce9c4c50fcfad4f19ee3646cfd7ae1",
      status: "prototype",
    });
    expect(countryPersonalitySource("glass-card")).toMatchObject({
      repository: "samasante/liquid-glass",
      version: "0.1.1",
      pinnedRef: "4e7b769e1df7e5a7d3669fef22417fe3d2f79ade",
      status: "prototype",
    });
  });

  it("pins every GitHub-backed canonical source before visual implementation starts", () => {
    for (const personality of COUNTRY_PERSONALITY_SOURCES) {
      if (personality.repository) {
        expect(personality.pinnedRef, `${personality.id} must pin its canonical source`).toMatch(/^[a-f0-9]{40}$/);
      } else {
        expect(personality.id).toBe("passport");
        expect(personality.sourceUrl).toContain("international-airline-ticket");
      }

      for (const companion of personality.companionSources ?? []) {
        expect(companion.repository.length).toBeGreaterThan(5);
        expect(companion.pinnedRef).toMatch(/^[a-f0-9]{40}$/);
      }
    }

    expect(countryPersonalitySource("broadcast").companionSources).toEqual([
      expect.objectContaining({
        repository: "bbc/gel-typography",
        pinnedRef: "d4fea6fc03586bc7fa066cd22abbae9fbd7005a6",
      }),
    ]);
    expect(countryPersonalitySource("newspaper").companionSources).toEqual([
      expect.objectContaining({
        repository: "guardian/interactive-style-library",
        pinnedRef: "19533f580cfa7ff6f5e2db6ffc75334cd9cf02a8",
      }),
    ]);
  });

  it("marks rendered source adapters as prototypes while keeping future sources planned", () => {
    for (const id of [
      "glass-card",
      "editorial",
      "poster",
      "heritage",
      "broadcast",
      "minimal",
      "classic",
      "duotone",
      "sci-fi",
      "monument",
      "horizon",
      "flag-focus",
    ] as const) {
      expect(countryPersonalitySource(id).status).toBe("prototype");
    }
    for (const id of ["passport", "panorama", "spotlight", "newspaper", "ribbon"] as const) {
      expect(countryPersonalitySource(id).status).toBe("planned");
    }
  });

  it("locks the deliberately small source-driven flag boxes", () => {
    expect(countryPersonalitySource("minimal").flag).toEqual({
      desktop: [120, 80],
      mobile: [104, 70],
    });
    expect(countryPersonalitySource("editorial").flag).toEqual({
      desktop: [144, 96],
      mobile: [120, 80],
    });
    expect(countryPersonalitySource("sci-fi").flag).toEqual({
      desktop: [144, 96],
      mobile: [128, 86],
    });
    expect(countryPersonalitySource("glass-card").flag).toEqual({
      desktop: [176, 118],
      mobile: [144, 96],
    });
  });

  it("exposes source composition metadata on the shared semantic hero", () => {
    const hero = source("src/components/country/CountryIdentityHero.tsx");
    expect(hero).toContain('countryPersonalitySource(definition.id)');
    expect(hero).toContain("data-country-composition={sourceDefinition.compositionFamily}");
    expect(hero).toContain("data-country-background-policy={sourceDefinition.backgroundPolicy}");
    expect(hero).toContain("data-country-source-status={sourceDefinition.status}");

    const countryRoute = source("src/routes/countries/$code.tsx");
    expect(countryRoute).toContain("countryPersonalitySource(heroPersonality)");
    expect(countryRoute).toContain("data-country-composition={sourcePersonality.compositionFamily}");
    expect(countryRoute).toContain("data-country-background-policy={sourcePersonality.backgroundPolicy}");
  });

  it("loads the source foundation and first human-source adapters after V8", () => {
    const styles = source("src/components/CountryPersonalityStyles.tsx");
    expect(styles).toContain('import sourceFoundation from "@/country-personality-source-foundation.css?inline"');
    expect(styles).toContain('import minimalSource from "@/styles/personalities/minimal-source.adapter.css?inline"');
    expect(styles).toContain('import retroSource from "@/styles/personalities/retro-source.adapter.css?inline"');
    expect(styles).toContain('import editorialSource from "@/styles/personalities/editorial-source.adapter.css?inline"');
    expect(styles).toContain('import posterSource from "@/styles/personalities/poster-source.adapter.css?inline"');
    expect(styles).toContain('import diplomaticSource from "@/styles/personalities/diplomatic-source.adapter.css?inline"');
    expect(styles).toContain('import broadcastSource from "@/styles/personalities/broadcast-source.adapter.css?inline"');
    expect(styles).toContain('import heritageSource from "@/styles/personalities/heritage-source.adapter.css?inline"');
    expect(styles).toContain('import brutalistSource from "@/styles/personalities/brutalist-source.adapter.css?inline"');
    expect(styles).toContain('import luxurySource from "@/styles/personalities/luxury-source.adapter.css?inline"');
    expect(styles).toContain('import scientificSource from "@/styles/personalities/scientific-source.adapter.css?inline"');
    expect(styles).toContain('import civicSource from "@/styles/personalities/civic-source.adapter.css?inline"');

    const listStart = styles.indexOf("const countryPersonalityStyles");
    const v8 = styles.indexOf("personalityV8,", listStart);
    const sourceFoundation = styles.indexOf("sourceFoundation,", listStart);
    const minimal = styles.indexOf("minimalSource,", listStart);
    expect(v8).toBeGreaterThan(-1);
    expect(sourceFoundation).toBeGreaterThan(v8);
    expect(minimal).toBeGreaterThan(sourceFoundation);
  });

  it("uses source-derived prototype adapters rather than invented blank-slate skins", () => {
    const pico = source("src/styles/personalities/minimal-source.adapter.css");
    const retro = source("src/styles/personalities/retro-source.adapter.css");
    const tufte = source("src/styles/personalities/editorial-source.adapter.css");
    const swiss = source("src/styles/personalities/poster-source.adapter.css");
    const govuk = source("src/styles/personalities/diplomatic-source.adapter.css");
    const gel = source("src/styles/personalities/broadcast-source.adapter.css");
    const archives = source("src/styles/personalities/heritage-source.adapter.css");
    const brutalist = source("src/styles/personalities/brutalist-source.adapter.css");
    const luxury = source("src/styles/personalities/luxury-source.adapter.css");
    const scientific = source("src/styles/personalities/scientific-source.adapter.css");
    const civic = source("src/styles/personalities/civic-source.adapter.css");

    expect(pico).toContain("Pico CSS v2.1.1 selective translated adapter");
    expect(pico).toContain("--pico-border-radius: .25rem");
    expect(pico).toContain("line-height: 1.125");

    expect(retro).toContain("98.css v0.1.21 selective translated adapter");
    expect(retro).toContain("--retro-surface: #c0c0c0");
    expect(retro).toContain("SOLARIS COUNTRY DATABASE");
    expect(retro).toContain("inset -1px -1px var(--retro-window-frame)");

    expect(tufte).toContain("Tufte CSS 1.9.0 selective translated adapter");
    expect(tufte).toContain("minmax(0, 55fr) minmax(0, 40fr)");
    expect(tufte).toContain("column-gap: 5%");

    expect(pico).toContain('data-country-hero-layout="minimal"');
    expect(retro).toContain('data-country-hero-layout="sci-fi"');
    expect(tufte).toContain('data-country-hero-layout="editorial"');

    expect(swiss).toContain("RampStack Swiss Style Theme translated adapter");
    expect(swiss).toContain("grid-template-columns: repeat(12, minmax(0, 1fr))");
    expect(swiss).toContain("--sw-scale-ratio: 1.25");

    expect(govuk).toContain("GOV.UK Frontend translated adapter");
    expect(govuk).toContain("--govuk-space-1: 5px");
    expect(govuk).toContain("grid-template-columns: minmax(7rem, 30%)");

    expect(gel).toContain("BBC GEL Grid + GEL Typography translated adapter");
    expect(gel).toContain("--gel-unit: .5rem");
    expect(gel).toContain("grid-template-columns: minmax(0, 8fr) minmax(9rem, 4fr)");

    expect(archives).toContain("The National Archives Design System translated adapter");
    expect(archives).toContain("grid-template-columns: minmax(0, 2fr) minmax(9rem, 1fr)");

    expect(brutalist).toContain("RampStack Brutalist Web Theme translated adapter");
    expect(luxury).toContain("Aimeos Pagible Luxury translated adapter");
    expect(scientific).toContain("IBM Carbon translated adapter");
    expect(civic).toContain("USWDS translated adapter");
  });

  it("records prototype provenance next to the adapters", () => {
    const pico = manifest("src/styles/personality-sources/minimal/source-manifest.json");
    const retro = manifest("src/styles/personality-sources/retro-digital/source-manifest.json");
    const editorial = manifest("src/styles/personality-sources/editorial/source-manifest.json");
    const glass = manifest("src/styles/personality-sources/glass/source-manifest.json");
    const poster = manifest("src/styles/personality-sources/poster/source-manifest.json");
    const diplomatic = manifest("src/styles/personality-sources/diplomatic/source-manifest.json");
    const broadcast = manifest("src/styles/personality-sources/broadcast/source-manifest.json");
    const heritage = manifest("src/styles/personality-sources/heritage/source-manifest.json");
    const passport = manifest("src/styles/personality-sources/passport/source-manifest.json");
    const atlas = manifest("src/styles/personality-sources/atlas/source-manifest.json");
    const festival = manifest("src/styles/personality-sources/festival/source-manifest.json");
    const brutalist = manifest("src/styles/personality-sources/brutalist/source-manifest.json");
    const luxury = manifest("src/styles/personality-sources/luxury/source-manifest.json");
    const newspaper = manifest("src/styles/personality-sources/newspaper/source-manifest.json");
    const scientific = manifest("src/styles/personality-sources/scientific/source-manifest.json");
    const civic = manifest("src/styles/personality-sources/civic/source-manifest.json");
    const avantGarde = manifest("src/styles/personality-sources/avant-garde/source-manifest.json");

    expect(pico).toMatchObject({ repository: "picocss/pico", version: "2.1.1", license: "MIT" });
    expect(retro).toMatchObject({ repository: "jdan/98.css", version: "0.1.21", license: "MIT" });
    expect(editorial).toMatchObject({ repository: "edwardtufte/tufte-css", version: "1.9.0", license: "MIT" });
    expect(glass).toMatchObject({ repository: "samasante/liquid-glass", version: "0.1.1", license: "MIT" });
    expect(poster).toMatchObject({ repository: "rampstackco/swiss-style-theme", license: "MIT" });
    expect(diplomatic).toMatchObject({ repository: "alphagov/govuk-frontend", license: "MIT" });
    expect(broadcast).toMatchObject({ repository: "bbc/gel-grid", license: "MIT" });
    expect(heritage).toMatchObject({ repository: "nationalarchives/design-system", license: "MIT" });
    expect(passport).toMatchObject({ license: "MIT", visualAuthority: "ICAO Doc 9303 document zoning" });
    expect(atlas).toMatchObject({ repository: "maplibre/maplibre-gl-js", license: "BSD-3-Clause" });
    expect(festival).toMatchObject({ repository: "gdg-x/hoverboard", license: "MIT" });
    expect(brutalist).toMatchObject({ repository: "rampstackco/brutalist-web-theme", license: "MIT" });
    expect(luxury).toMatchObject({ repository: "aimeos/pagible-themes-luxury", license: "MIT" });
    expect(newspaper).toMatchObject({ repository: "guardian/source", license: "Apache-2.0" });
    expect(scientific).toMatchObject({ repository: "carbon-design-system/carbon", license: "Apache-2.0" });
    expect(civic).toMatchObject({ repository: "uswds/uswds" });
    expect(avantGarde).toMatchObject({ repository: "zetareticoli/superilles", license: "MIT" });

    expect(source("THIRD_PARTY_DESIGN_LICENSES.md")).toContain("## Architecture prototypes");
  });

  it("overrides the old giant mobile flag rule with per-personality source bounds", () => {
    const foundation = source("src/country-personality-source-foundation.css");
    expect(foundation).toContain("--cp-flag-max-inline");
    expect(foundation).toContain("--cp-flag-max-block");
    expect(foundation).toContain('data-country-personality="minimal"');
    expect(foundation).toContain("--cp-flag-max-inline: 6.5rem");
    expect(foundation).toContain('data-country-personality="glass-card"');
    expect(foundation).toContain("--cp-flag-max-inline: 9rem");
    expect(foundation).toContain("inline-size: auto !important");
    expect(foundation).toContain("object-fit: contain !important");
  });

  it("prevents the appearance editor from offering source-incompatible backgrounds", () => {
    expect(countryPersonalitySource("glass-card").backgroundModes).toEqual(["solid", "gradient", "image"]);
    expect(countryPersonalitySource("spotlight").backgroundModes).toEqual(["solid", "gradient", "image"]);
    expect(countryPersonalitySource("sci-fi").backgroundModes).toEqual(["solid", "image"]);
    expect(countryPersonalitySource("minimal").backgroundModes).toEqual(["solid"]);
    expect(countryPersonalitySource("poster").backgroundModes).toEqual(["solid"]);
    expect(countryPersonalitySource("flag-focus").backgroundModes).toEqual(["solid"]);

    const appearance = source("src/components/mysolaris/modules/MySolarisAppearanceModule.tsx");
    expect(appearance).toContain("source.backgroundModes.includes(existing.backgroundMode)");
    expect(appearance).toContain("source.backgroundModes.includes(current.backgroundMode)");
    expect(appearance).toContain("sourcePersonality.backgroundModes.length > 1");
    expect(appearance).toContain("Solid background locked by source design");
  });

  it("disables full atmospheric scenes where the canonical source design forbids them", () => {
    const foundation = source("src/country-personality-source-foundation.css");
    for (const id of ["minimal", "poster", "classic", "newspaper", "horizon", "flag-focus"]) {
      expect(foundation).toContain(`[data-country-personality="${id}"]`);
    }
    expect(foundation).toContain(".country-hero-scene {");
    expect(foundation).toContain("display: none;");
  });
});
