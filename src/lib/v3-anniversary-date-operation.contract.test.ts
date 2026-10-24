import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261024203000_v3_anniversary_date_operation.sql",
  ),
  "utf8",
);

describe("V3 governed Anniversary edition-date operation", () => {
  it("registers one semantic S13 forward-fix contract", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("'v3.anniversary-date-operation'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).not.toContain("'20261019235900_v3_anniversary_date_operation'");
  });

  it("binds both read and write authority to one exact edition", () => {
    expect(migration).toContain("studio2_anniversary_date_snapshot");
    expect(migration).toContain("studio2_set_anniversary_date");
    expect(migration).toContain("studio2_access_allowed('edition.manage', p_edition_id, true)");
    expect(migration).not.toMatch(/update\s+public\.editions\s+set[\s\S]*where\s+slug\s*=/i);
  });

  it("claims the canonical V3 operation before mutable-state validation so lost responses replay", () => {
    const claim = migration.indexOf("private.studio2_claim_operation(");
    const lock = migration.indexOf("where id = p_edition_id\n  for update;");
    expect(claim).toBeGreaterThan(-1);
    expect(lock).toBeGreaterThan(claim);
    expect(migration).toContain("'edition.anniversary_date.update'");
    expect(migration).toContain("'R2'");
    expect(migration).toContain("public.studio2_reconcile_operation(v_canonical_operation_id)");
    expect(migration).toContain("private.studio2_complete_operation(v_canonical_operation_id, v_result)");
  });

  it("rejects stale reviewed date/year state rather than using last-write-wins", () => {
    expect(migration).toContain("v_edition.event_date is distinct from p_expected_event_date");
    expect(migration).toContain("v_edition.year is distinct from p_expected_year");
    expect(migration).toContain("message = 'VERSION_CONFLICT'");
    expect(migration).toContain("for update");
  });

  it("derives year from an exact date and preserves year when the date is deliberately cleared", () => {
    expect(migration).toContain("when p_event_date is null then v_edition.year");
    expect(migration).toContain("extract(year from p_event_date)::integer");
    expect(migration).toContain("event_date = p_event_date");
    expect(migration).toContain("year = v_next_year");
  });

  it("binds reason and before/after historical evidence into the durable operation result", () => {
    expect(migration).toContain("'reason', v_reason");
    expect(migration).toContain("'before', jsonb_build_object(");
    expect(migration).toContain("'after', jsonb_build_object(");
    expect(migration).toContain("'expectedEventDate', p_expected_event_date");
    expect(migration).toContain("'expectedYear', p_expected_year");
  });

  it("keeps browser execution authenticated-only and derives the actor server-side", () => {
    expect(migration).toContain("v_actor uuid := auth.uid()");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to authenticated;");
    expect(migration).not.toMatch(/to authenticated,\s*service_role/);
  });

  it("does not expose a generic editions mutation surface", () => {
    expect(migration).not.toContain("jsonb_populate_record");
    expect(migration).not.toContain("execute format(");
    expect(migration).not.toContain("p_column");
  });
});
