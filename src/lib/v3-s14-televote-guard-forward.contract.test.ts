import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const load = (name: string) => readFileSync(resolve(process.cwd(), name), "utf8");
const candidatePath = "docs/v3/recovery-candidates/forward-only-s14-televote-provenance-guard-local.sql";
const candidate = load(candidatePath);
const historical = load("supabase/migrations/20261017001000_v3_s14_televote_result_truth.sql");
const hardened = load("supabase/migrations/20261017001010_v3_s14_televote_projection_guard_hardening.sql");
const harness = load("scripts/rehearse-v3-s14-televote-guard-local.sh");
const fixture = load("docs/v3/recovery-candidates/fixtures/s14-televote-guard-catalog-subset-local.sql");

describe("S14 Televote result provenance guard forward recovery candidate", () => {
  it("reuses the historical source table and trigger while explicitly restricting scope", () => {
    const tableSource = historical.slice(
      historical.indexOf("create table if not exists private.v3_televote_result_projection_sources"),
      historical.indexOf("create or replace function private.v3_apply_published_televote_projection"),
    ).trim().replace("create table if not exists", "create table");
    expect(candidate).toContain(tableSource);
    expect(candidate).toContain("create trigger v3_guard_source_managed_televote_projection");
    expect(candidate).toContain("for each row execute function private.v3_guard_source_managed_televote_projection()");
    expect(candidate).not.toContain("create or replace function private.v3_apply_published_televote_projection");
    expect(candidate).not.toContain("v3_sync_published_televote_round_trigger()");
    expect(candidate).not.toContain("supabase_migrations.schema_migrations");
    expect(candidatePath).not.toMatch(/^supabase\/migrations\//);
  });

  it("adds old-and-new show scope protection absent from the earlier guard hardening", () => {
    expect(hardened).not.toContain("v_previous_show_id");
    expect(candidate).toContain("v_previous_show_id := old.show_id");
    expect(candidate).toContain("source.show_id = v_previous_show_id");
    expect(candidate).toContain("source.show_id = v_show_id");
    expect(candidate).toContain("tg_op = 'UPDATE'");
    expect(candidate).toContain("Published Televote projection is server-managed for this show");
    expect(candidate).not.toContain("session_user in ('postgres', 'supabase_admin')");
    expect(candidate).toContain("private.studio2_request_is_service_role()");
  });

  it("fails closed on partial installations or weakened provenance ACL", () => {
    expect(candidate).toMatch(/\bbegin;[\s\S]*\bcommit;\s*$/);
    expect(candidate).toContain("set local lock_timeout = '5s'");
    expect(candidate).toContain("S14 provenance blocked: partial or preexisting guard artifacts");
    expect(candidate).toContain("S14 provenance postcondition failed: unsafe direct client privileges");
    expect(candidate).toContain("tgenabled='O'");
    expect(candidate).not.toMatch(/\b(?:delete\s+from|truncate\s+table|update\s+public\.televote_votes)\b/i);
  });

  it("tests genuine original-source move-away bypass and prevents result-sync consequences", () => {
    expect(harness).toContain("20261017001010_v3_s14_televote_projection_guard_hardening.sql");
    expect(harness).toContain("historical_show");
    expect(harness).toContain('"move managed to unmanaged"');
    expect(harness).toContain('"remove managed show scope"');
    expect(harness).toContain("private.local_vote_sync_counter");
    expect(harness).toContain("Unauthorized Televote attempts");
    expect(fixture).toContain("create policy local_worst_case_authenticated_vote_write");
    expect(fixture).toContain("studio2_platform_direct_write_guard");
    expect(harness).toContain("PGHOST=127.0.0.1");
    expect(harness).toContain("PGSSLMODE=disable");
    expect(harness).not.toContain("dkxmnvekiopyesuzggeu");
    expect(candidate).toContain("NOT DEPLOYABLE");
  });
});
