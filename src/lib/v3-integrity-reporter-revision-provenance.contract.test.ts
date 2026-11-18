import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = source("supabase/migrations/20261118202000_v3_integrity_reporter_reply_revision_provenance.sql");
const replies = source("supabase/migrations/20261118181000_v3_integrity_reporter_reply_primitive_consolidation.sql");
const rehearsal = source(".github/scripts/rules-integrity-security-rehearsal.sh");

describe("P04 reporter replies advance canonical case revision with historical evidence", () => {
  it("updates existing revision and event trigger functions, without a competing trigger or bypass", () => {
    for (const token of [
      "create or replace function private.v3_integrity_case_before_update()",
      "create or replace function private.v3_integrity_case_changed_event()",
      "security definer",
      "set search_path = pg_catalog, public, private",
      "new.version := old.version + 1",
      "old.retention_until is distinct from new.retention_until",
      "old.retention_until is not distinct from new.retention_until",
      "and not v_reporter_reply then",
      "or v_reporter_reply then",
      "integrity.case.reporter_reply.anonymous",
      "integrity.case.reporter_reply",
      "integrity_adjudication_history",
      "integrity.case_changed",
      "private.v3_integrity_operation_id()",
      "Canonical reporter response changed case revision",
    ]) expect(migration).toContain(token);
    expect(migration).not.toMatch(/drop trigger|disable trigger|create trigger|truncate table|row_security\s*=\s*off/i);
    expect(migration.match(/create or replace function private\.v3_integrity_case_(before_update|changed_event)\(\)/g)).toHaveLength(2);
    expect(migration).toContain("Both case revision and changed-event triggers");
  });

  it("requires the actual canonical reporter command to carry the provenance marker", () => {
    for (const command of [
      "integrity.case.reporter_reply",
      "integrity.case.reporter_reply.anonymous",
    ]) {
      expect(replies).toContain(command);
      expect(migration).toContain(command);
    }
    expect(replies.match(/update public\.integrity_cases/g)).toHaveLength(2);
    expect(replies).toContain("p_expected_version");
    expect(replies).toContain("PT409");
    expect(replies).toContain("app.integrity_operation_id");
    expect(replies).toContain("private.studio2_complete_operation");
    expect(migration).not.toContain("create or replace function public.");
  });

  it("keeps exact live PostgreSQL positive, replay and stale-revision expectations", () => {
    expect(rehearsal).toContain('REPLY_NEW_VERSION > REPLY_OLD_VERSION');
    expect(rehearsal).toContain('ANON_REPLY_NEW_VERSION > ANON_REPLY_OLD_VERSION');
    expect(rehearsal).toContain('registered reporter CAS SQLSTATE');
    expect(rehearsal).toContain('registered reporter idempotency replay');
    expect(rehearsal).toContain('anonymous reply idempotency replay');
    expect(migration).toContain("v3_register_migration_contract");
    expect(migration).toContain("has_function_privilege");
  });
});
