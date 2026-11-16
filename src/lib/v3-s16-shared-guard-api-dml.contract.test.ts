import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261116193000_v3_s16_shared_guard_reviewed_api_dml_retirement.sql",
  "utf8",
);
const execution = readFileSync(
  ".github/tests/v3-s16-shared-guard-reviewed-api-dml.sql",
  "utf8",
);
const rehearsal = readFileSync(
  ".github/scripts/v3-observed-owner-recovery-local.sh",
  "utf8",
);

describe("S16 shared platform guard API-role authority cutover", () => {
  it("removes direct mutation only from two reviewed canonical tables", () => {
    for (const table of ["public.results", "public.televote_votes"])
      expect(migration).toContain(table);
    expect(migration).toMatch(/revoke insert,update,delete,truncate,references,trigger,maintain on table/);
    expect(migration).toContain("from public,anon,authenticated,service_role");
    expect(migration).not.toMatch(/drop trigger .*studio2_platform_direct_write_guard/i);
    expect(migration).not.toMatch(/alter table .*disable row level security/i);
    expect(migration).not.toMatch(/drop function .*studio2_execute_result_operation_v2/i);
  });

  it("requires actual shared trigger attachment, owner and effective privileges", () => {
    expect(migration).toContain("t.tgtype=30");
    expect(migration).toContain("t.tgfoid=v_guard");
    expect(migration).toContain("not v_rel.relrowsecurity");
    expect(migration).toContain("pg_get_userbyid(v_rel.relowner)<>'postgres'");
    expect(migration).toContain("has_any_column_privilege");
    expect(migration).toContain("has_table_privilege('service_role',v_table,'SELECT'");
  });

  it("preserves existing canonical definer commands and preserves current owner functions", () => {
    for (const command of [
      "public.studio2_execute_result_operation_v2(uuid,text,text,uuid,bigint,bigint,uuid,uuid)",
      "public.v3_reconcile_published_televote(text,uuid)",
    ]) expect(migration).toContain(command);
    expect(migration).not.toContain("alter function public.claim_country_account(uuid)");
    expect(migration).not.toContain("revoke insert,update,delete on table public.country_accounts");
  });

  it("recovers the existing S14 reconciliation command before applying this ACL cutover", () => {
    const donor = "supabase/migrations/20261103220000_v3_s14_atomic_televote_recovery.sql";
    const cutover = "supabase/migrations/20261116193000_v3_s16_shared_guard_reviewed_api_dml_retirement.sql";
    const sql = readFileSync(donor, "utf8");
    expect(sql).toContain("create or replace function public.v3_reconcile_published_televote(");
    expect(sql).toContain("security definer");
    expect(sql).toContain("grant execute on function public.v3_reconcile_published_televote(text,uuid)");
    expect(rehearsal).toContain("to_regprocedure('public.v3_reconcile_published_televote(text,uuid)') is not null");
    expect(rehearsal).toContain("migration_key='v3.results.atomic-televote-recovery'");
    expect(rehearsal).toContain("operator_apply " + donor);
    expect(rehearsal.indexOf("operator_apply " + donor)).toBeLessThan(
      rehearsal.indexOf("operator_apply " + cutover)
    );
  });

  it("executes 24 SQL ACL negatives even with adversarial recovery markers", () => {
    for (const role of ["anon", "authenticated", "service_role"])
      expect(execution).toContain("set local role " + role);
    for (const marker of ["studio2.platform_recovery_write", "studio2.confirmation_maintenance_write"])
      expect(execution).toContain(marker);
    for (const action of ["insert into", "update %s", "delete from", "truncate table"])
      expect(execution).toContain(action);
    expect(execution).toContain("exception when insufficient_privilege");
    expect(rehearsal).toContain("24 real API-role direct-write denials");
    expect(rehearsal).toContain("42501: permission denied for table");
  });
});
