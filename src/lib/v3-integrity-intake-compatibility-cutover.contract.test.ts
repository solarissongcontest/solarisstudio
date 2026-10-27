import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261027221000_v3_integrity_intake_compatibility_cutover.sql"),
  "utf8",
);

describe("V3 Integrity intake compatibility cutover", () => {
  it("routes both legacy case-intake shapes through retry-safe V3 commands", () => {
    expect(migration).toContain("return public.v3_public_create_anonymous_integrity_case(");
    expect(migration).toContain("return public.v3_create_protected_integrity_case(");
    expect(migration).not.toContain("return public.public_create_anonymous_integrity_case_impl(");
    expect(migration).not.toContain("return public.create_protected_integrity_case_impl(");
  });

  it("keeps compatibility aliases documented with owner reason scope and sunset", () => {
    expect(migration.match(/TEMPORARY COMPATIBILITY PATH/g)?.length).toBeGreaterThanOrEqual(9);
    expect(migration.match(/Owner: Integrity authority/g)?.length).toBeGreaterThanOrEqual(9);
    expect(migration.match(/Scope:/g)?.length).toBeGreaterThanOrEqual(9);
    expect(migration.match(/Reason:/g)?.length).toBeGreaterThanOrEqual(9);
    expect(migration.match(/Sunset:/g)?.length).toBeGreaterThanOrEqual(9);
  });

  it("does not expose protected intake to anonymous callers", () => {
    expect(migration).toContain("from public, anon");
    expect(migration).toContain("to authenticated, service_role");
  });
});
