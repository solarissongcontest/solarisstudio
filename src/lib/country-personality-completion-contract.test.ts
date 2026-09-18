import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("canonical Country + Wiki completion contract", () => {
  it("exposes the full six-section Country information architecture", () => {
    const route = source("src/routes/countries/$code.tsx");
    for (const tab of ["Overview", "Entries", "Results", "Voting", "Relationships", "Form"]) {
      expect(route).toContain(`label: "${tab}"`);
    }
    expect(route).toContain('title="Current entry"');
    expect(route).toContain('title="Entry history"');
    expect(route).toContain("canonicalEditionEntries");
  });

  it("removes the legacy all-personality V8 layer from production", () => {
    const loader = source("src/components/CountryPersonalityStyles.tsx");
    const shared = source("src/country-personality-shared-foundation.css");
    expect(loader).toContain("country-personality-shared-foundation.css");
    expect(loader).not.toContain("country-personality-system-v8.css");
    expect(shared).not.toContain("data-country-personality=");
    const forbiddenLegacyCss = [
      "src/country-personality-system-v8.css",
      "src/country-glass-final.css",
      "src/country-glass-parity.css",
      "src/country-personalities-beta2.css",
      "src/country-personalities-v2.css",
      "src/country-personalities-v3.css",
      "src/country-personalities-v4.css",
      "src/country-personalities-v5.css",
      "src/country-personalities-v6-layout.css",
      "src/country-personalities-v6.css",
      "src/country-personalities.css",
      "src/country-personality-feedback.css",
      "src/country-water-drop-v61.css",
    ];
    for (const path of forbiddenLegacyCss) {
      expect(existsSync(resolve(process.cwd(), path)), `Legacy personality CSS returned: ${path}`).toBe(false);
    }
  });

  it("ships the shared semantic Country and Wiki data contracts", () => {
    const model = source("src/lib/country-semantic-model.ts");
    expect(model).toContain("interface CountryIdentityModel");
    expect(model).toContain("interface CountryWikiModel");
    expect(model).toContain("CountryGeography");
    expect(model).toContain("hasVerifiedCountryGeography");
  });

  it("uses real pinned MapLibre runtime behavior and refuses fabricated geography", () => {
    const atlas = source("src/components/country/AtlasMapModule.tsx");
    const adapter = source("src/styles/personalities/atlas-source.adapter.css");
    const manifest = source("src/styles/personality-sources/atlas/source-manifest.json");
    expect(atlas).toContain('MAPLIBRE_VERSION = "6.10.0"');
    expect(atlas).toContain('import(/* @vite-ignore */ MAPLIBRE_MODULE_URL)');
    expect(atlas).toContain("No verified map geometry is stored");
    expect(atlas).toContain('addSource("solaris-country"');
    expect(adapter).toContain("real MapLibre map");
    expect(manifest).toContain('"implementationMode": "remote-esm"');
    expect(manifest).toContain("never infer or fabricate coordinates");
    const registry = source("src/lib/country-personality-sources.ts");
    expect(registry).toContain('pinnedRef: "codehim-2024-03-04"');
    expect(registry).toContain('version: "2024-03-04"');
  });

  it("ships the mandatory Personality Lab, Gallery and hostile QA fixtures", () => {
    expect(source("src/routes/dev/personality-lab.tsx")).toContain("Personality Lab");
    expect(source("src/routes/dev/personality-gallery.tsx")).toContain("Personality Gallery");
    const fixtures = source("src/lib/personality-fixtures.ts");
    for (const id of ["oland", "neutral", "hostile", "sparse"]) expect(fixtures).toContain(`id: "${id}"`);
    expect(fixtures).toContain("THE UNITED CONFEDERATED REPUBLICS OF NORTHERN AURELIAN ISLANDS");
    expect(fixtures).toContain("国際太陽連邦共和国");
    expect(fixtures).toContain("جمهورية سولاريس الشمالية");
  });

  it("locks the exact ten canonical viewport sizes", () => {
    const config = source("playwright.config.ts");
    for (const pair of [
      "width: 320, height: 568",
      "width: 360, height: 800",
      "width: 375, height: 812",
      "width: 390, height: 844",
      "width: 430, height: 932",
      "width: 768, height: 1024",
      "width: 1024, height: 768",
      "width: 1280, height: 800",
      "width: 1440, height: 900",
      "width: 1920, height: 1080",
    ]) expect(config).toContain(pair);
  });

  it("keeps zero-overlap collision checks and personality-aware Atlas map sizing", () => {
    const audit = source("e2e/audit-helpers.ts");
    expect(audit).toContain("return width > 0 && height > 0");
    expect(audit).toContain('personality === "panorama" ? 196 : 114');
  });
  it("keeps all source adapters on logical CSS for RTL-safe layout", () => {
    const adapters = [
      "minimal", "retro", "editorial", "poster", "diplomatic", "broadcast", "heritage",
      "brutalist", "luxury", "scientific", "civic", "festival", "newspaper",
      "avant-garde", "passport", "atlas", "glass",
    ];
    for (const adapter of adapters) {
      const css = source(`src/styles/personalities/${adapter}-source.adapter.css`);
      expect(css, `${adapter} contains physical left/right layout CSS`).not.toMatch(
        /\b(?:margin-left|margin-right|padding-left|padding-right|border-left|border-right|left:|right:)\b/,
      );
    }
  });

  it("keeps Overview in the canonical information order", () => {
    const route = source("src/routes/countries/$code.tsx");
    const world = source("src/components/CountryWorldOverview.tsx");
    expect(world.indexOf('title="About"')).toBeLessThan(world.indexOf('title="Quick Facts"'));
    const glance = route.indexOf('title="SSC at a glance"');
    const current = route.indexOf('title="Current entry"');
    const recent = route.indexOf('title="Recent SSC history"');
    const allTime = route.indexOf('title="All-time record"');
    expect(glance).toBeGreaterThan(-1);
    expect(glance).toBeLessThan(current);
    expect(current).toBeLessThan(recent);
    expect(recent).toBeLessThan(allTime);
  });

});
