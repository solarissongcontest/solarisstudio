import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const migration = source(
  "supabase/migrations/20261016234500_v3_s13_migration_hardening.sql",
);
const rehearsal = source(
  ".github/scripts/v3-s13-migration-hardening-rehearsal.sh",
);
const workflow = source(
  ".github/workflows/v3-s13-migration-hardening-rehearsal.yml",
);
const runbook = source("docs/runbooks/migration-hardening.md");

function functionBody(name: string) {
  const marker = `create or replace function ${name}`;
  const start = migration.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = migration.indexOf("create or replace function", start + marker.length);
  return migration.slice(start, next === -1 ? migration.length : next);
}

describe("System V3 S13 migration hardening", () => {
  it("encodes the canonical ordered expand-to-contract doctrine", () => {
    expect(migration).toContain(
      "expand-backfill-dual-compatible-switch-validate-contract",
    );
    for (const phase of [
      "expand",
      "backfill",
      "dual-compatible",
      "switch",
      "validate",
      "contract",
    ]) {
      expect(migration).toContain(`'${phase}'`);
    }
    expect(migration).toContain("Schema compatibility phases cannot be skipped");
    expect(migration).toContain("Schema compatibility phase cannot move backwards");
    expect(migration).toContain("A new schema version must begin in expand phase");
    expect(migration).toContain("A migration identity change must begin in expand phase");
    expect(runbook).toContain(
      "expand → backfill → dual-compatible → switch → validate → contract",
    );
  });

  it("makes compatibility versioning browser-readable but mutations service-only", () => {
    const compatibility = functionBody("public.v3_schema_compatibility");
    const transition = functionBody("public.v3_set_schema_compatibility");

    expect(compatibility).toContain("'upgrade_required'");
    expect(compatibility).toContain("'server_upgrade_required'");
    expect(compatibility).toContain("'compatible'");
    expect(migration).toContain(
      "grant execute on function public.v3_schema_compatibility(integer)\n  to anon, authenticated, service_role;",
    );
    expect(transition).toContain("private.studio2_request_is_service_role()");
    expect(migration).toContain(
      "revoke all on function public.v3_set_schema_compatibility(integer, integer, integer, text, text, text)\n  from public, anon, authenticated;",
    );
  });

  it("requires explicit rollback semantics and semantic-idempotent migration contracts", () => {
    const register = functionBody("public.v3_register_migration_contract");
    expect(migration).toContain("rollback_mode in ('reversible', 'forward_fix_only')");
    expect(register).toContain("p_rollback_mode is null");
    expect(register).toContain("Migration contract semantic conflict");
    expect(register).toContain("'replayed', v_existing.migration_key is not null");
    expect(migration).toContain("'v3.s13.migration-hardening'");
    expect(migration).toContain("'forward_fix_only'");
    expect(runbook).toContain("repair forward");
  });

  it("keeps backfills bounded, leased, resumable and idempotent", () => {
    const claim = functionBody("public.v3_claim_backfill");
    const checkpoint = functionBody("public.v3_checkpoint_backfill");
    const fail = functionBody("public.v3_fail_backfill");

    expect(claim).toContain("p_batch_size not between 1 and 1000");
    expect(claim).toContain("p_lease_seconds not between 5 and 3600");
    expect(claim).toContain("Backfill is not registered by a migration contract");
    expect(claim).toContain("pg_advisory_xact_lock");
    expect(claim).toContain("Backfill lease is owned by another worker");
    expect(claim).toContain("'replayed', true");
    expect(checkpoint).toContain("p_processed_delta > v_job.batch_size");
    expect(checkpoint).toContain("Backfill processed count exceeds expected count");
    expect(checkpoint).toContain(
      "Backfill cannot complete before expected count is reached",
    );
    expect(checkpoint).toContain("lease_owner = null");
    expect(checkpoint).toContain("cursor = coalesce(p_next_cursor, '{}'::jsonb)");
    expect(fail).toContain("status = 'failed'");
    expect(fail).toContain("lease_owner = null");
  });

  it("requires exact parity evidence before cutover", () => {
    const parity = functionBody("public.v3_record_migration_parity");
    const transition = functionBody("public.v3_set_schema_compatibility");

    expect(parity).toContain("Parity backfill key does not match migration contract");
    expect(parity).toContain("Backfill must be completed before parity validation");
    expect(parity).toContain("p_expected_count = p_actual_count");
    expect(parity).toContain("p_missing_count = 0");
    expect(parity).toContain("p_duplicate_count = 0");
    expect(parity).toContain("p_critical_query_failures = 0");
    expect(transition).toContain(
      "Passing migration parity evidence is required before cutover",
    );
    expect(transition).toContain("order by parity.sequence desc");
    expect(transition).toContain(
      "Contract phase requires retiring older/newer client schema versions",
    );
  });

  it("prevents application workers from bypassing migration invariants with direct private writes", () => {
    for (const table of [
      "private.v3_migration_contracts",
      "private.v3_schema_compatibility",
      "private.v3_schema_compatibility_history",
      "private.v3_backfill_jobs",
      "private.v3_migration_parity_runs",
    ]) {
      expect(migration).toContain(
        `revoke all on table ${table} from public, anon, authenticated;`,
      );
    }
    expect(migration).not.toContain("grant select, insert, update on table private.v3_");
    expect(migration).not.toContain("grant select, insert on table private.v3_");
  });

  it("rehearses only on isolated local Supabase and applies feature delta without deleting current-main migrations", () => {
    expect(rehearsal).toContain("Refusing hosted Supabase rehearsal");
    expect(rehearsal).toContain("Refusing non-local database rehearsal");
    expect(rehearsal).toContain("concurrent foreign-worker claim");
    expect(rehearsal).toContain("cutover without passing parity");
    expect(rehearsal).toContain("schema version skipping");
    expect(workflow).toContain("supabase db reset --local --no-seed");
    expect(workflow).toContain("supabase migration up --local --include-all");
    expect(workflow).toContain(
      'cp "$GITHUB_WORKSPACE/supabase/migrations/20261016234500_v3_s13_migration_hardening.sql"',
    );
    expect(workflow).not.toContain("rsync -a --delete");
    expect(`${workflow}\n${rehearsal}`).not.toMatch(/supabase\.co/i);
  });

  it("is additive foundation rather than a destructive cutover migration", () => {
    expect(migration).not.toMatch(/\bdrop\s+(table|column|schema)\b/i);
    expect(migration).not.toMatch(/\btruncate\b/i);
    expect(migration).not.toMatch(/\bdelete\s+from\b/i);
    expect(runbook).toContain("This foundation is not full S13 certification");
  });
});
