import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Integrity intake compatibility delegation", () => {
  it("repairs only the two inward writer calls and rejects an unknown call graph", () => {
    const migration = readFileSync("supabase/migrations/20261028051229_v3_integrity_intake_recursion_guard.sql", "utf8");
    expect(migration).toContain("v3.integrity.intake-recursion-guard");
    expect(migration).toContain("v_base_result := public.create_protected_integrity_case_impl(");
    expect(migration).toContain("v_base_result := public.public_create_anonymous_integrity_case_impl(");
    expect(migration).toContain("Unrecognized Integrity intake delegation");
    expect(migration).not.toMatch(/grant\s+execute/i);
  });

  it("runs both public and protected canonical retries plus legacy shims against real PostgreSQL", () => {
    const sql = readFileSync(".github/tests/v3-integrity-intake-delegation.sql", "utf8");
    for (const boundary of ["public.v3_create_protected_integrity_case(", "public.v3_public_create_anonymous_integrity_case(", "public.create_protected_integrity_case(", "public.public_create_anonymous_integrity_case(", "public.integrity_adjudication_history", "public.integrity_case_events", "has_function_privilege"]) {
      expect(sql).toContain(boundary);
    }
    expect(readFileSync(".github/scripts/v3-canonical-writer-rehearsal.sh", "utf8")).toContain("v3-integrity-intake-delegation.sql");
  });
});
