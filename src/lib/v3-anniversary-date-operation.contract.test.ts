import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261024202000_v3_anniversary_date_operation.sql",
  ),
  "utf8",
);

describe("V3 governed Anniversary edition-date operation", () => {
  it("registers a semantic S13 forward-only migration contract", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("'v3.edition.anniversary-date-operation'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).not.toContain("'20261024202000_v3_anniversary_date_operation'");
  });

  it("binds snapshot and mutation authorization to one exact edition", () => {
    expect(migration).toContain("studio2_anniversary_date_snapshot");
    expect(migration).toContain("studio2_set_anniversary_date");
    expect(migration.match(/studio2_access_allowed\('edition\.manage', p_edition_id, true\)/g)).toHaveLength(2);
    expect(migration).toContain("where id = p_edition_id");
    expect(migration).not.toMatch(/update\s+public\.editions\s+set[\s\S]*where\s+slug\s*=/i);
  });

  it("uses the canonical System error taxonomy at the RPC boundary", () => {
    expect(migration).toContain("message = 'AUTHENTICATION'");
    expect(migration).toContain("message = 'AUTHORIZATION'");
    expect(migration).toContain("message = 'VALIDATION'");
    expect(migration).toContain("message = 'VERSION_CONFLICT'");
    expect(migration).toContain("message = 'UNKNOWN'");
    expect(migration).not.toContain("AUTHENTICATION_REQUIRED");
    expect(migration).not.toContain("REASON_REQUIRED");
    expect(migration).not.toContain("EDITION_NOT_FOUND");
  });

  it("claims one semantic R2 operation before mutable-state validation so a lost response replays", () => {
    const claim = migration.indexOf("private.studio2_claim_operation(");
    const lock = migration.indexOf("where id = p_edition_id\n  for update;");
    const cas = migration.indexOf("v_edition.event_date is distinct from p_expected_event_date");
    const update = migration.indexOf("update public.editions");

    expect(claim).toBeGreaterThan(-1);
    expect(lock).toBeGreaterThan(claim);
    expect(cas).toBeGreaterThan(lock);
    expect(update).toBeGreaterThan(cas);
    expect(migration).toContain("'edition.anniversary_date.update'");
    expect(migration).toContain("'R2'");
    expect(migration).toContain("'expectedEventDate', p_expected_event_date");
    expect(migration).toContain("'expectedYear', p_expected_year");
    expect(migration).toContain("public.studio2_reconcile_operation(v_canonical_operation_id)");
    expect(migration).toContain("private.studio2_complete_operation(v_canonical_operation_id, v_result)");
  });

  it("rejects stale reviewed date/year state under a row lock instead of using last-write-wins", () => {
    expect(migration).toContain("for update");
    expect(migration).toContain("v_edition.event_date is distinct from p_expected_event_date");
    expect(migration).toContain("v_edition.year is distinct from p_expected_year");
    expect(migration).toContain("raise exception using errcode = '40001', message = 'VERSION_CONFLICT'");
  });

  it("derives year from an exact date and preserves historical year when the date is cleared", () => {
    expect(migration).toContain("when p_event_date is null then v_edition.year");
    expect(migration).toContain("extract(year from p_event_date)::integer");
    expect(migration).toContain("event_date = p_event_date");
    expect(migration).toContain("year = v_next_year");
  });

  it("binds audit reason and before/after archive evidence into the durable receipt", () => {
    expect(migration).toContain("'reason', v_reason");
    expect(migration).toContain("'before', jsonb_build_object(");
    expect(migration).toContain("'after', jsonb_build_object(");
    expect(migration).toContain("'operationId', v_canonical_operation_id");
    expect(migration).toContain("'serverTime', now()");
  });

  it("does not expose a generic editions mutation or bypass the shared platform mutation gate", () => {
    expect(migration).toContain("private.studio2_claim_operation(");
    expect(migration).not.toContain("jsonb_populate_record");
    expect(migration).not.toContain("execute format(");
    expect(migration).not.toContain("p_column");
    expect(migration).not.toContain("studio2_platform_mutation_allowed('edition.anniversary_date.update')");
  });

  it("keeps both new RPCs authenticated-only and omits service-role execution grants", () => {
    expect(migration).toContain(
      "revoke all on function public.studio2_anniversary_date_snapshot(uuid)\n  from public, anon;",
    );
    expect(migration).toContain(
      "grant execute on function public.studio2_anniversary_date_snapshot(uuid)\n  to authenticated;",
    );
    expect(migration).toContain(
      "revoke all on function public.studio2_set_anniversary_date(\n  uuid, date, date, integer, text, uuid, text, uuid\n) from public, anon;",
    );
    expect(migration).toContain(
      "grant execute on function public.studio2_set_anniversary_date(\n  uuid, date, date, integer, text, uuid, text, uuid\n) to authenticated;",
    );
    expect(migration).not.toContain("to authenticated, service_role;");
  });
});
