import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync("src/lib/visual-theme.ts", "utf8");

const COUNTRY_THEME_PROJECTION =
  "country_id,background_primary,background_secondary,background_tertiary,accent,text_primary,text_muted,surface,background_mode,gradient_style,gradient_angle,background_image_url,background_image_storage_path,background_position_x,background_position_y,background_overlay,background_blur,hero_layout,decoration_style,updated_at";

describe("Public visual theme egress contract", () => {
  it("pins the exact CountryThemeRow projection for shared reads", () => {
    expect(source).toContain("const COUNTRY_THEME_SELECT =");
    expect(source).toContain(COUNTRY_THEME_PROJECTION);
    expect(source).toContain('.from("country_themes").select(COUNTRY_THEME_SELECT)');
    expect(source).toContain(".select(COUNTRY_THEME_SELECT)\n        .eq(\"country_id\", countryId)");
  });

  it("uses the same bounded projection for country-theme mutation readback", () => {
    expect(source).toContain('.upsert(payload, { onConflict: "country_id" })');
    expect(source).toContain(".select(COUNTRY_THEME_SELECT)\n        .single()");
  });

  it("does not allow schema-wide country-theme payloads to return", () => {
    const countryThemeSection = source.slice(
      source.indexOf("export function useCountryThemes"),
      source.indexOf("export async function uploadEditionArtwork"),
    );

    expect(countryThemeSection).not.toContain('.select("*")');
    expect(countryThemeSection).not.toContain(".select('*')");
  });

  it("does not read back a full Edition row after saving visual theme fields", () => {
    const editionSaveSection = source.slice(
      source.indexOf("export async function saveEditionVisualTheme"),
      source.indexOf("export async function extractThemeFromImage"),
    );

    expect(editionSaveSection).toContain('.from("editions")');
    expect(editionSaveSection).toContain(".update({");
    expect(editionSaveSection).toContain('.eq("id", input.editionId)');
    expect(editionSaveSection).not.toContain(".select(");
    expect(editionSaveSection).not.toContain(".single(");
  });

  it("preserves bounded caching and authoritative cache reconciliation", () => {
    expect(source).toContain('queryKey: ["country-themes"]');
    expect(source).toContain('queryKey: ["country-theme", countryId]');
    expect(source).toContain("staleTime: 30 * 60 * 1000");
    expect(source).toContain('qc.invalidateQueries({ queryKey: ["country-theme", countryId] })');
    expect(source).toContain('qc.invalidateQueries({ queryKey: ["country-themes"] })');
    expect(source).not.toContain("refetchInterval");
    expect(source).not.toContain("postgres_changes");
  });
});
