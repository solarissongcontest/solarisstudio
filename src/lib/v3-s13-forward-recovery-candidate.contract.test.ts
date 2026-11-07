import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const load = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const candidate = load("docs/v3/recovery-candidates/forward-only-s13-foundation.sql");
const base = load("supabase/migrations/20261019111000_v3_s13_migration_hardening.sql");
const strict = load("supabase/migrations/20261019113300_v3_s13_strict_registration_restore.sql");
const fixture = load("docs/v3/recovery-candidates/fixtures/s13-production-dependency-subset-20261107.sql");
const rehearsal = load("scripts/rehearse-v3-s13-forward-recovery-local.sh");

describe("System V3 S13 forward-only candidate source and safety", () => {
  it("preserves the historical S13 foundation exactly between the safety gates", () => {
    const baseBody = base.replace(/^begin;\s*/i, "").replace(/\s*commit;\s*$/i, "");
    expect(candidate).toContain(baseBody);
    const strictBody = strict.slice(strict.indexOf("create or replace function public.v3_register_migration_contract"));
    expect(candidate).toContain(strictBody.replace(/\s*commit;\s*$/i, ""));
    expect(candidate).not.toContain("20261019113000_v3_s6_notification_reconciliation'");
  });

  it("refuses every existing target object rather than replacing partial production state", () => {
    const names = [
      "v3_migration_contracts", "v3_schema_compatibility",
      "v3_schema_compatibility_history", "v3_backfill_jobs",
      "v3_migration_parity_runs", "v3_claim_backfill", "v3_checkpoint_backfill",
      "v3_fail_backfill", "v3_schema_compatibility", "v3_register_migration_contract",
      "v3_record_migration_parity", "v3_set_schema_compatibility",
    ];
    for (const name of names) expect(candidate).toContain(name);
    expect(candidate).toContain("S13 recovery blocked: target already exists");
    expect(candidate).toContain("private.studio2_request_is_service_role()");
    expect(candidate).toContain("has_schema_privilege('service_role', 'private', 'USAGE')");
  });

  it("is transaction-atomic, bounded and strictly least-privileged", () => {
    expect(candidate).toMatch(/^-- LOCAL REHEARSAL CANDIDATE ONLY/);
    expect(candidate).toMatch(/\bbegin;[\s\S]*\bcommit;\s*$/);
    expect(candidate).toContain("set local lock_timeout = '5s'");
    expect(candidate).toContain("set local statement_timeout = '120s'");
    expect(candidate).toContain("S13 recovery unsafe migration-contract registration ACL");
    expect(candidate).toContain("Restore strict semantic migration-key validation");
    expect(candidate).not.toContain("supabase_migrations.schema_migrations");
    expect(candidate).not.toMatch(/\b(drop\s+table|truncate\s+table|delete\s+from)\b/i);
  });

  it("pins the isolated fixture to the exact observed production helper and privileges", () => {
    expect(fixture).toContain("server_version_num");
    expect(fixture).toContain("170011");
    expect(fixture).toContain("84d3f05e5f537908732a3875ba0178e6");
    expect(fixture).toContain("341a58cafc38a872c684592babc76f83");
    expect(fixture).toContain("SET search_path TO 'pg_catalog'");
    expect(fixture).toContain("current_setting('request.jwt.claim.role', true)");
    expect(fixture).toContain("grant usage on schema private to anon, authenticated, service_role");
    expect(fixture).toContain("revoke all on function private.studio2_request_is_service_role()");
    expect(rehearsal).toContain("catalog_fingerprint");
    expect(rehearsal).toContain("20261019112900_v3_s13_migration_registration_context.sql");
    expect(rehearsal).toContain("expect_preflight_rejection nohelper");
    expect(rehearsal).toContain("expect_preflight_rejection nogrant");
    expect(rehearsal).toContain("expect_preflight_rejection partialtable");
    expect(rehearsal).toContain("expect_preflight_rejection partialrpc");
    expect(rehearsal).toContain("PGHOST=127.0.0.1");
    expect(rehearsal).toContain("PGSSLMODE=disable");
    expect(rehearsal).not.toContain("dkxmnvekiopyesuzggeu");
    expect(fixture).not.toContain("dkxmnvekiopyesuzggeu");
  });

  it("remains staged outside the deployable migration directory", () => {
    expect(candidate).toContain("not a tracked migration");
    expect(candidate).toContain("Do not paste into hosted Supabase");
    expect(candidate).not.toContain("SOLARIS_PRODUCTION_COMMIT=YES");
  });
});
