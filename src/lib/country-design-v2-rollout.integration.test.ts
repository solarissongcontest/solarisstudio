// Rebased onto the authoritative Permission Engine mainline.
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = readdirSync(resolve(process.cwd(), "supabase/migrations")).find((name) =>
  name.endsWith("_country_design_v2_full_rollout.sql"),
);
if (!migrationName) throw new Error("Country Design V2 rollout migration missing");

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations", migrationName), "utf8");

describe("Country Design V2 full rollout", () => {
  it("maps the canonical V1 personality families into V2 axes", () => {
    expect(migration).toContain("when 'glass-card' then 'glass'");
    expect(migration).toContain("when 'newspaper' then 'editorial'");
    expect(migration).toContain("when 'spotlight' then 'cinematic'");
    expect(migration).toContain("when 'passport' then 'retro'");
  });

  it("preserves legacy palette and background data", () => {
    for (const column of [
      "background_primary",
      "background_secondary",
      "background_tertiary",
      "accent",
      "text_primary",
      "text_muted",
      "surface",
      "background_image_url",
      "background_image_storage_path",
    ]) {
      expect(migration).toContain(`t.${column}`);
    }
  });

  it("preserves the old flag visibility preference in V2", () => {
    expect(migration).toContain("'showFlag', coalesce(t.flag_enabled, true)");
  });

  it("keeps V1 columns in place as rollback data", () => {
    expect(migration).not.toContain("drop column");
    expect(migration).not.toContain("hero_layout =");
    expect(migration).not.toContain("decoration_style =");
  });

  it("fails closed unless every existing theme is a valid V2 document", () => {
    expect(migration).toContain("Country Design V2 rollout incomplete");
    expect(migration).toContain("Country Design V2 rollout produced invalid documents");
  });
});
