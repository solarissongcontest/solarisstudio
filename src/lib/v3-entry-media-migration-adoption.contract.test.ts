import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261024224500_v3_p14_entry_media_participant_authority.sql",
  ),
  "utf8",
);

describe("V3 P14 Entry media migration adoption", () => {
  it("registers as a forward-fix-only S13 migration contract", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("v3.public.p14-entry-media-participant-authority");
    expect(migration).toContain("'forward_fix_only'");
  });

  it("uses the migration-time service-role registration context only for S13 adoption", () => {
    const registration = migration.slice(
      0,
      migration.indexOf("create or replace function private.v3_entry_media_supported_asset_type"),
    );
    expect(registration).toContain("set_config('request.jwt.claim.role', 'service_role', true)");
    expect(registration).toContain("set_config('request.jwt.claim.role', '', true)");

    const runtime = migration.slice(
      migration.indexOf("create or replace function private.v3_entry_media_supported_asset_type"),
    );
    expect(runtime).not.toContain("request.jwt.claim.role");
    expect(runtime).not.toContain("service_role");
  });
});
