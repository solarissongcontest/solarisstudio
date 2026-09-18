import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import { COUNTRY_PERSONALITY_SOURCES } from "./country-personality-sources";

const ADAPTER_PATHS: Record<string, string> = {
  "glass-card": "src/styles/personalities/glass-source.adapter.css",
  editorial: "src/styles/personalities/editorial-source.adapter.css",
  passport: "src/styles/personalities/passport-source.adapter.css",
  poster: "src/styles/personalities/poster-source.adapter.css",
  heritage: "src/styles/personalities/heritage-source.adapter.css",
  broadcast: "src/styles/personalities/broadcast-source.adapter.css",
  minimal: "src/styles/personalities/minimal-source.adapter.css",
  panorama: "src/styles/personalities/atlas-source.adapter.css",
  classic: "src/styles/personalities/diplomatic-source.adapter.css",
  spotlight: "src/styles/personalities/festival-source.adapter.css",
  duotone: "src/styles/personalities/brutalist-source.adapter.css",
  "sci-fi": "src/styles/personalities/retro-source.adapter.css",
  monument: "src/styles/personalities/luxury-source.adapter.css",
  newspaper: "src/styles/personalities/newspaper-source.adapter.css",
  horizon: "src/styles/personalities/scientific-source.adapter.css",
  "flag-focus": "src/styles/personalities/civic-source.adapter.css",
  ribbon: "src/styles/personalities/avant-garde-source.adapter.css",
};

describe("personality performance budgets", () => {
  it("keeps every personality adapter below the 70KB gzip hard review threshold", () => {
    for (const personality of COUNTRY_PERSONALITY_SOURCES) {
      const path = ADAPTER_PATHS[personality.id];
      expect(path, `Missing adapter path for ${personality.id}`).toBeTruthy();
      const css = readFileSync(resolve(process.cwd(), path));
      const gzipBytes = gzipSync(css).byteLength;
      expect(gzipBytes, `${personality.sourceName} adapter is ${gzipBytes} bytes gzip`).toBeLessThanOrEqual(70 * 1024);
    }
  });

  it("keeps ordinary CSS personalities free of dedicated runtime JS", () => {
    const atlasRuntime = statSync(resolve(process.cwd(), "src/components/country/AtlasMapModule.tsx")).size;
    const glassRuntime = statSync(resolve(process.cwd(), "src/vendor/liquid-glass/GlassMaterial.tsx")).size;
    expect(atlasRuntime).toBeGreaterThan(0);
    expect(glassRuntime).toBeGreaterThan(0);

    for (const personality of COUNTRY_PERSONALITY_SOURCES) {
      if (personality.id === "panorama" || personality.id === "glass-card") continue;
      expect(personality.importMode).not.toBe("remote-esm");
      expect(personality.importMode).not.toBe("vendored-source");
    }
  });

  it("keeps MapLibre lazy and outside the critical Country identity render", () => {
    const atlas = readFileSync(resolve(process.cwd(), "src/components/country/AtlasMapModule.tsx"), "utf8");
    expect(atlas).toContain('new Function("url", "return import(url)")');
    expect(atlas).toContain('state === "error"');
    expect(atlas).toContain("No verified map geometry is stored");
  });
});
