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
  });

  it("loads the source foundation and first human-source adapters after V8", () => {
    const styles = source("src/components/CountryPersonalityStyles.tsx");
    expect(styles).toContain('import sourceFoundation from "@/country-personality-source-foundation.css?inline"');
    expect(styles).toContain('import minimalSource from "@/styles/personalities/minimal-source.adapter.css?inline"');
    expect(styles).toContain('import retroSource from "@/styles/personalities/retro-source.adapter.css?inline"');
    expect(styles).toContain('import editorialSource from "@/styles/personalities/editorial-source.adapter.css?inline"');

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
  });

  it("records prototype provenance next to the adapters", () => {
    const pico = manifest("src/styles/personality-sources/minimal/source-manifest.json");
    const retro = manifest("src/styles/personality-sources/retro-digital/source-manifest.json");
    const editorial = manifest("src/styles/personality-sources/editorial/source-manifest.json");
    const glass = manifest("src/styles/personality-sources/glass/source-manifest.json");

    expect(pico).toMatchObject({ repository: "picocss/pico", version: "2.1.1", license: "MIT" });
    expect(retro).toMatchObject({ repository: "jdan/98.css", version: "0.1.21", license: "MIT" });
    expect(editorial).toMatchObject({ repository: "edwardtufte/tufte-css", version: "1.9.0", license: "MIT" });
    expect(glass).toMatchObject({ repository: "samasante/liquid-glass", version: "0.1.1", license: "MIT" });

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

  it("disables full atmospheric scenes where the canonical source design forbids them", () => {
    const foundation = source("src/country-personality-source-foundation.css");
    for (const id of ["minimal", "poster", "classic", "newspaper", "horizon", "flag-focus"]) {
      expect(foundation).toContain(`[data-country-personality="${id}"]`);
    }
    expect(foundation).toContain(".country-hero-scene {");
    expect(foundation).toContain("display: none;");
  });
});
