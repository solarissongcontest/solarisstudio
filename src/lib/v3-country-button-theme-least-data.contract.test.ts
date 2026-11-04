import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/lib/country-button-theme.ts"),
  "utf8",
);

describe("V3 country button theme least-data boundary", () => {
  it("does not request the full country theme row after a write", () => {
    expect(source).toContain('.from("country_themes")');
    expect(source).toContain(".upsert({ country_id: countryId, button_color: value }");
    expect(source).not.toContain('.select("*")');
    expect(source).not.toContain(".single()");
  });

  it("reconciles the canonical cached theme projections after the write", () => {
    expect(source).toContain('invalidateQueries({ queryKey: ["country-theme", countryId] })');
    expect(source).toContain('invalidateQueries({ queryKey: ["country-themes"] })');
  });
});
