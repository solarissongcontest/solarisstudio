import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(resolve(process.cwd(),
  "supabase/migrations/20261114185000_v3_confirmation_governed_maintenance_gate.sql"), "utf8");

describe("Confirmation governed read-only maintenance gate", () => {
  it("preserves current shared gate definitions using guarded minimal replacements", () => {
    expect(src).toContain("pg_get_functiondef('private.studio2_data_api_operational_gate()");
    expect(src).toContain("pg_get_functiondef('private.studio2_platform_mutation_allowed(text)");
    expect(src).toContain("refusing unsafe extension");
    expect(src).not.toContain("create or replace function private.studio2_data_api_operational_gate");
    expect(src).not.toContain("create or replace function private.studio2_platform_mutation_allowed");
  });
  it("admits only R2 response access commands, never R3 deletion in read_only", () => {
    expect(src).toContain("confirmation.response.access.update");
    expect(src).toContain("confirmation.response.recovery.issue");
    expect(src).toContain("confirmation.response.recovery.invalidate");
    expect(src).not.toContain("''confirmation.response.delete'',");
    expect(src).toContain("position('''confirmation.response.delete''' in v_after) > 0");
  });
});
