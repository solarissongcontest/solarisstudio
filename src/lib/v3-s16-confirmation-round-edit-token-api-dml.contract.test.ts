import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20261117231500_v3_s16_confirmation_round_edit_token_api_dml_retirement.sql";
const probePath = ".github/tests/v3-s16-confirmation-round-edit-token-api-dml.sql";
const migration = readFileSync(migrationPath, "utf8");
const probe = readFileSync(probePath, "utf8");
const runner = readFileSync(".github/scripts/v3-s16-catalog-rehearsal.sh", "utf8");
const s14 = readFileSync(".github/workflows/v3-s14-archive-forward-effects-local.yml", "utf8");

describe("S16 P07 round and edit-token API DML single-authority cutover", () => {
  it("preflights existing canonical commands, intact guard/version triggers, owner, RLS and exact PG17 before revoking raw writes", () => {
    expect(migration).toContain("current_user <> 'postgres'");
    expect(migration).toContain("server_version_num");
    expect(migration).toContain("pg_get_userbyid(c.relowner) = 'postgres'");
    expect(migration).toContain("c.relrowsecurity");
    expect(migration).toContain("v3_touch_confirmation_edit_token_version");
    expect(migration).toContain("studio2_guard_direct_confirmation_round_update");
    expect(migration).toContain("studio2_confirmation_round_touch_version");
    expect(migration).toContain("public.studio2_apply_confirmation_round_change");
    expect(migration).toContain("public.studio2_apply_confirmation_response_access_change");
    expect(migration).toContain("public.v3_submit_confirmation");
    for (const table of ["public.submission_rounds", "public.edit_tokens"]) {
      expect(migration).toContain("on table " + table + " from public,anon,authenticated,service_role");
      expect(probe).toContain(table);
    }
    expect(migration).not.toMatch(/disable row level security|drop trigger|drop function|alter table .*disable trigger|grant all/i);
  });
  it("probes 24 actual denied SQL mutations across API roles, without substituting RLS or application-only checks", () => {
    expect(probe).toContain("\\set ON_ERROR_STOP on");
    for (const role of ["anon", "authenticated", "service_role"]) {
      expect(probe).toContain("set local role " + role + ";");
      expect(probe).toContain(role + " expected 8 ACL denials");
    }
    for (const operation of ["insert into", "update %s set", "delete from", "truncate table"]) {
      expect(probe).toContain(operation);
    }
    expect(probe).toContain("permission denied for table");
    expect(probe).toContain("public.v3_submit_confirmation");
  });
  it("wires the isolated PG17 catalog runner and independent SHA-bound S14 Publication producer", () => {
    expect(runner).toContain("src/lib/v3-s16-confirmation-round-edit-token-api-dml.contract.test.ts");
    expect(runner).toContain(probePath);
    for (const path of [migrationPath, probePath, "src/lib/v3-s16-confirmation-round-edit-token-api-dml.contract.test.ts"]) {
      expect(s14).toContain(path);
    }
  });
});
