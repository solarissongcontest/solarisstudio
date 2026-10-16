import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261017002000_v3_s14_televote_deadline_authority.sql"),
  "utf8",
);

function body(name: string) {
  const marker = `create or replace function ${name}`;
  const start = migration.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = migration.indexOf("create or replace function ", start + marker.length);
  return migration.slice(start, next === -1 ? migration.length : next);
}

describe("System V3 S14 Televote deadline authority", () => {
  it("persists an explicit server deadline with a migration-safe authority revision", () => {
    expect(migration).toContain("add column if not exists voting_deadline_at timestamptz");
    expect(migration).toContain("add column if not exists voting_deadline_revision bigint not null default 0");
    expect(migration).toContain("voting_deadline_revision = 0 and voting_deadline_at is null");
    expect(migration).toContain("voting_deadline_revision >= 1 and voting_deadline_at is not null");
    expect(migration).toContain("voting_deadline_revision >= 1 and status = 'open'");
  });

  it("keeps direct browser writes outside the canonical deadline authority", () => {
    const guard = body("private.v3_guard_direct_televote_deadline()");
    expect(guard).toContain("current_user in ('authenticated', 'anon')");
    expect(guard).toContain("Televote deadline changes must use the governed Organisation OS operation contract");
    expect(migration).toContain("before update of voting_deadline_at, voting_deadline_revision on televoting.rounds");
  });

  it("provides governed initial-deadline and extension preview/apply contracts", () => {
    for (const name of [
      "televoting.studio2_round_deadline_set_preview(",
      "televoting.studio2_apply_round_deadline_set(",
      "televoting.studio2_round_deadline_extension_preview(",
      "televoting.studio2_apply_round_deadline_extension(",
    ]) {
      expect(migration).toContain(`create or replace function ${name}`);
    }
    expect(migration).toContain("public.studio2_access_allowed('voting.manage', v_solaris_edition_id, false)");
    expect(migration).toContain("expectedGlobalVersion");
    expect(migration).toContain("expectedRoundVersion");
    expect(migration).toContain("using errcode = '40001'");
  });

  it("makes extension a real window change rather than a close/reopen cycle", () => {
    const extend = body("televoting.studio2_apply_round_deadline_extension(");
    expect(extend).toContain("'televote.round.extend_deadline'");
    expect(extend).toContain("private.studio2_claim_operation");
    expect(extend).toContain("v_new_deadline := v_previous_deadline + make_interval(secs => p_extend_seconds)");
    expect(extend).toContain("v_new_deadline_revision := v_previous_deadline_revision + 1");
    expect(extend).toContain("private.studio2_complete_operation");
    expect(extend).not.toContain("status = 'closed'");
    expect(extend).not.toContain("status = 'open'");
    expect(extend).not.toContain("opened_at =");
    expect(extend).not.toContain("closed_at =");
  });

  it("accepts V3 ballots only while database server time is within the canonical deadline", () => {
    const submit = body("televoting.submit_vote_checked(");
    expect(submit).toContain("if v_round.status<>'open'");
    expect(submit).toContain("if v_round.voting_deadline_revision >= 1 then");
    expect(submit).toContain("clock_timestamp() > v_round.voting_deadline_at");
    expect(submit).toContain("Voting deadline has passed");
    expect(submit).toContain("insert into televoting.vote_submissions");
    expect(submit).toContain("insert into televoting.vote_entries");
  });

  it("emits a durable versioned televote.extended fact with exact deadline provenance", () => {
    const emit = body("private.v3_emit_televote_deadline_event()");
    expect(emit).toContain("new.command <> 'televote.round.extend_deadline'");
    expect(emit).toContain("'televote.extended'");
    expect(emit).toContain("private.v3_emit_domain_event");
    expect(emit).toContain("'previousDeadline'");
    expect(emit).toContain("'newDeadline'");
    expect(emit).toContain("'previousDeadlineRevision'");
    expect(emit).toContain("'deadlineRevision'");
    expect(emit).toContain("array['televote.tasks']::text[]");
  });

  it("reuses the replay-safe Televote consequence consumer for deadline extensions", () => {
    const consumer = body("public.studio2_process_televote_domain_event(");
    expect(consumer).toContain("'televote.extended'");
    expect(consumer).toContain("private.v3_domain_event_consumer_receipts");
    expect(consumer).toContain("private.studio2_reconcile_all_organizer_tasks");
    expect(consumer).toContain("p_consumer_key = 'televote.notifications'");
    expect(consumer).toContain("v_event.event_type <> 'televote.opened'");
  });

  it("does not expose deadline management to anonymous callers", () => {
    expect(migration).toContain(
      "revoke all on function televoting.studio2_round_deadline_extension_preview(uuid, integer)\n  from public, anon;",
    );
    expect(migration).toContain(
      "grant execute on function televoting.studio2_apply_round_deadline_extension(\n  uuid, integer, uuid, text, bigint, bigint\n) to authenticated, service_role;",
    );
    expect(migration).toContain(
      "grant execute on function televoting.submit_vote_checked(uuid,text,text,jsonb,uuid,text,text,text,text,boolean) to anon, authenticated;",
    );
  });
});
