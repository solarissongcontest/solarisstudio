import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/lib/country-account.ts"), "utf8");

describe("V3 Country Account read budget", () => {
  it("keeps owned-country identity on the exact Country projection", () => {
    expect(source).toContain("const COUNTRY_FIELDS");
    expect(source).toContain(
      '"id,name,native_name,short_code,flag_image,flag_crop_x,flag_crop_y,flag_crop_zoom,region,accent_color,description,first_participation"',
    );
    expect(source).toContain(".select(COUNTRY_FIELDS)");
  });

  it("bounds world-profile reads to their typed renderer contracts", () => {
    expect(source).toContain(".select(COUNTRY_PROFILE_FIELDS)");
    expect(source).toContain(".select(COUNTRY_PROFILE_SECTION_FIELDS)");
    expect(source).toContain(".select(COUNTRY_MEDIA_FIELDS)");
    expect(source).toContain(
      '"country_id,capital,government_type,leader_name,leader_title,demonym,official_languages,currency,motto,population,established,summary,updated_at"',
    );
    expect(source).toContain(
      '"id,country_id,heading,body,image_url,image_caption,sort_order,created_at,updated_at"',
    );
    expect(source).toContain(
      '"id,country_id,storage_path,public_url,caption,alt_text,sort_order,created_at"',
    );
  });

  it("keeps mutation readback bounded instead of re-expanding the row", () => {
    expect(source.match(/\.select\(COUNTRY_PROFILE_FIELDS\)/g)?.length).toBe(2);
    expect(source.match(/\.select\(COUNTRY_PROFILE_SECTION_FIELDS\)/g)?.length).toBe(2);
    expect(source.match(/\.select\(COUNTRY_MEDIA_FIELDS\)/g)?.length).toBe(2);
  });

  it("contains no wildcard table read or mutation readback", () => {
    expect(source).not.toContain('.select("*")');
  });
});
