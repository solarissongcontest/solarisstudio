import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const columnPrerequisite = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261017001900_v3_s14_televote_deadline_column.sql"),
  "utf8",
);
const foundation = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261017002000_v3_s14_televote_deadline_extension.sql"),
  "utf8",
);
const replayFix = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261017002100_v3_s14_televote_deadline_replay_fix.sql"),
  "utf8",
);
const compatibility = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261017002200_v3_s14_televote_deadline_open_compatibility.sql"),
  "utf8",
);
const migration = `${columnPrerequisite}\n${foundation}\n${replayFix}\n${compatibility}`;

function latestFunctionBody(name: string) {
  const marker = `create or replace function ${name}`;
  const start = migration.lastIndexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = migration.indexOf("create or replace function", start + marker.length);
  return migration.slice(start, next === -1 ? migration.length : next);
}

describe("System V3 S14 authoritative Televote deadline extension", () => {
  it("creates the persisted deadline column before any trigger or RPC depends on it", () => {
    expect(columnPrerequisite).toContain("alter table televoting.rounds");
    expect(columnPrerequisite).toContain("add column if not exists closes_at timestamptz");
    expect(columnPrerequisite).toContain("Existing rows intentionally remain");
    expect(columnPrerequisite).not.toContain("update televoting.rounds");
    expect(foundation).toContain("before update of closes_at on televoting.rounds");
  });

  it("uses closes_at as the authoritative persisted acceptance deadline", () => {
    expect(foundation).toContain("new.closes_at is distinct from old.closes_at");
    expect(foundation).toContain("Televote deadline must use the governed deadline operation contract");
    expect(compatibility).toContain("NULL as the explicit legacy-unbounded state");
    expect(compatibility).toContain("drop trigger if exists v3_require_televote_deadline_on_open");
  });

  it("enforces server time at the final canonical ballot write boundary", () => {
    const guard = latestFunctionBody("private.v3_enforce_televote_submission_deadline");
    expect(guard).toContain("from televoting.rounds");
    expect(guard).toContain("v_status <> 'open'");
    expect(guard).toContain("v_deadline is not null and now() >= v_deadline");
    expect(guard).toContain("Voting deadline has passed");
    expect(foundation).toContain("before insert on televoting.vote_submissions");
    expect(migration).not.toContain("opened_at > closed_at");
    expect(migration).not.toContain("extension-reopen");
  });

  it("binds preview/apply to exact round-derived Solaris edition and voting.manage", () => {
    const resolver = latestFunctionBody("private.v3_televote_solaris_edition_for_round");
    const preview = latestFunctionBody("televoting.studio2_round_deadline_change_preview");
    const apply = latestFunctionBody("televoting.studio2_apply_round_deadline_change");
    expect(resolver).toContain("public.televoting_round_bindings");
    expect(resolver).toContain("public.integration_links");
    expect(resolver).toContain("binding and edition integration link disagree");
    expect(preview).toContain("studio2_access_allowed('voting.manage'");
    expect(apply).toContain("studio2_access_allowed('voting.manage'");
    expect(preview).toContain("'expectedRoundVersion'");
  });

  it("uses replay-stable S2 semantic idempotency and optimistic round versioning", () => {
    const apply = latestFunctionBody("televoting.studio2_apply_round_deadline_change");
    expect(apply).toContain("private.studio2_claim_operation(");
    expect(apply).toContain("'televote.deadline.change'");
    expect(apply).toContain("'newDeadline', p_new_deadline_at");
    expect(apply).toContain("'expectedRoundVersion', p_expected_round_version");
    expect(apply).toContain("p_expected_round_version <> v_current_round_version");
    expect(apply).toContain("private.studio2_complete_operation");
    expect(apply).toContain("case when v_round.closes_at is null then 'set' else 'extend' end");
  });

  it("only permits future monotonic deadline changes before locked/published results", () => {
    const apply = latestFunctionBody("televoting.studio2_apply_round_deadline_change");
    expect(apply).toContain("p_new_deadline_at <= now()");
    expect(apply).toContain("p_new_deadline_at <= v_round.closes_at");
    expect(apply).toContain("v_round.results_status in ('locked', 'published')");
  });

  it("emits deadline_set/extended with previous and new deadline/version evidence", () => {
    const emitter = latestFunctionBody("private.v3_emit_televote_deadline_operation_event");
    expect(emitter).toContain("new.command <> 'televote.deadline.change'");
    expect(emitter).toContain("'televote.extended'");
    expect(emitter).toContain("'televote.deadline_set'");
    expect(emitter).toContain("'previousDeadline'");
    expect(emitter).toContain("'deadline'");
    expect(emitter).toContain("'previousRoundVersion'");
    expect(emitter).toContain("'roundVersion'");
    expect(emitter).toContain("array['televote.tasks']::text[]");
  });

  it("keeps new deadline events compatible with the existing Televote task consumer", () => {
    const processor = latestFunctionBody("public.studio2_process_televote_domain_event");
    expect(processor).toContain("'televote.deadline_set'");
    expect(processor).toContain("'televote.extended'");
    expect(processor).toContain("studio2_reconcile_all_organizer_tasks");
    expect(processor).toContain("studio2_sync_task_notifications");
    expect(processor).toContain("studio2_prune_stale_task_notifications");
  });
});
