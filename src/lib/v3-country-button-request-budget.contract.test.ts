import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/lib/country-button-theme.ts", "utf8");
const saveBoundary = source.slice(source.indexOf("export function useSaveCountryButtonColour"));

describe("V3 country button theme request budget", () => {
  it("does not request an unused country_themes row after the upsert", () => {
    expect(saveBoundary).toContain('.from("country_themes")');
    expect(saveBoundary).toContain(".upsert({ country_id: countryId, button_color: value }, { onConflict: \"country_id\" })");
    expect(saveBoundary).not.toContain('.select("*")');
    expect(saveBoundary).not.toContain(".single()");
  });

  it("keeps read-after-write authority in the existing canonical query invalidation", () => {
    expect(saveBoundary).toContain('queryKey: ["country-theme", countryId]');
    expect(saveBoundary).toContain('queryKey: ["country-themes"]');
  });
});
