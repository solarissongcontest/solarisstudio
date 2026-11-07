import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const s9 = read("docs/v3/recovery-candidates/forward-only-s9-observability-local.sql");
const s10 = read("docs/v3/recovery-candidates/forward-only-s10-sli-local.sql");
const indexStage = read("docs/v3/recovery-candidates/forward-only-s9-indexes-concurrent-local.sql");
const baseS9 = read("supabase/migrations/20261019110000_v3_s9_safe_metrics.sql");
const baseS10 = read("supabase/migrations/20261019112000_v3_s10_sli_snapshot.sql");
const fixture = read("docs/v3/recovery-candidates/fixtures/s9-s10-production-ledger-subset-20261107.sql");
const harness = read("scripts/rehearse-v3-s9-s10-forward-local.sh");

const noWrapper = (source: string) =>
  source.replace(/^begin;\s*/i, "").replace(/\s*commit;\s*$/i, "").trimEnd();

describe("V3 S9/S10 non-deployable forward-only recovery candidate", () => {
  it("retains the source S9 and S10 effects without modifying immutable SQL", () => {
    const canonicalS9WithoutIndexes = noWrapper(baseS9)
      .replace(/create index if not exists\s+[\s\S]*?;/gi, "");
    expect(s9).toContain(canonicalS9WithoutIndexes);
    expect(s10).toContain(noWrapper(baseS10));
    expect(s9).toContain("NOT a migration");
    expect(s10).toContain("NOT a migration");
    expect(s10).toContain("v3.s10.sli-snapshot");
  });
  it("requires original S2/S4 ledgers, capability authority and strict S13 registry", () => {
    for (const name of [
      "public.studio2_operation_receipts",
      "private.v3_domain_events",
      "private.v3_domain_event_outbox",
      "public.studio2_access_allowed(text,uuid,boolean)",
    ]) expect(s9).toContain(name);
    expect(s9).toContain("S9 blocked: existing observability function");
    expect(s9).toContain("S9 blocked: required concurrent index not installed");
    expect(s9).toContain("i.indisvalid and i.indisready");
    const canonicalIndexStatements = Array.from(
      baseS9.matchAll(/create index if not exists\s+[\s\S]*?;/gi),
      ([statement]) => statement.replace(/^create index if not exists/i, "create index concurrently"),
    );
    expect(canonicalIndexStatements).toHaveLength(3);
    for (const statement of canonicalIndexStatements) {
      expect(indexStage).toContain(statement);
    }
    expect(indexStage).not.toMatch(/\bbegin;[\s\S]*\bcommit;/i);
    expect(indexStage).toContain("S9 index stage blocked: existing index/object");
    expect(indexStage).toContain("i.indisvalid and i.indisready");
    expect(s10).toContain("S10 blocked: canonical S9 projection missing");
    expect(s10).toContain("S10 blocked: canonical S13 registry missing");
    expect(s10).toContain("S10 blocked: existing SLI function");
  });
  it("keeps source truth and privacy-safe restrictions", () => {
    expect(s9).toContain("admin_system_observability_snapshot");
    expect(s10).toContain("admin_system_observability_snapshot(v_window)");
    expect(s9).toContain("studio2_access_allowed('system.read'");
    expect(s10).toContain("studio2_access_allowed('system.read'");
    for (const s of [s9,s10]) {
      expect(s).toContain("security definer");
      expect(s).toContain("from public, anon");
      expect(s).toContain("to authenticated, service_role");
      expect(s).not.toContain("supabase_migrations.schema_migrations");
      expect(s).toContain("set local lock_timeout = '5s'");
      expect(s.trimEnd()).toMatch(/commit;$/);
    }
    expect(fixture).toContain("CANARY_SECRET_RESULT");
    expect(fixture).toContain("CANARY_SECRET_EVENT");
    expect(harness).toContain("position('CANARY_SECRET' in a.s9::text)=0");
    expect(harness).toContain("position('CANARY_SECRET' in a.s10::text)=0");
  });
  it("runs only on loopback, with original S13 registration in disposable Postgres", () => {
    expect(harness).toContain("SOLARIS_RUN_LOCAL_DB_REHEARSAL");
    expect(harness).toContain("PGHOST=127.0.0.1");
    expect(harness).toContain("PGSSLMODE=disable");
    expect(harness).toContain("20261019111000_v3_s13_migration_hardening.sql");
    expect(harness).toContain("20261019113300_v3_s13_strict_registration_restore.sql");
    expect(harness).toContain("Authenticated without system.read accessed S9");
    expect(harness).toContain("S10 canonical S13 registration record missing");
    expect(harness).toContain('run -f "$index_stage"');
    expect(harness).toContain('expect_reject "$index_stage"');
    expect(harness).not.toContain("dkxmnvekiopyesuzggeu");
  });
});
