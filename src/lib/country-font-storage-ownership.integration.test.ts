import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261004230000_harden_country_font_storage_ownership.sql",
  ),
  "utf8",
);

describe("country font storage ownership", () => {
  it("requires the path user and country segments to match active ownership or elevated delegation access", () => {
    expect(migration).toContain("studio2_country_font_path_allowed");
    expect(migration).toContain("(storage.foldername(p_object_name))[1] = auth.uid()::text");
    expect(migration).toContain("ca.country_id::text = (storage.foldername(p_object_name))[2]");
    expect(migration).toContain("ca.status = 'active'");
    expect(migration).toContain("studio2_access_allowed('delegation.manage', null, false)");
  });

  it("applies the same ownership predicate to insert, update and delete", () => {
    expect(migration.match(/studio2_country_font_path_allowed\(name\)/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });
});
