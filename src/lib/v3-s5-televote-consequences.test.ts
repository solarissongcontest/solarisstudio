import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const migration = source(
  "supabase/migrations/20261016043000_v3_s5_televote_consequences.sql",
);
const registry = source("src/lib/v3-domain-consequence-registry.ts");

describe("System V3 S5 Televote consequences", () => {
  it("bridges accepted public ballots through the one-shot canonical preflight", () => {
    expect(migration).toContain("on televoting.vote_preflight_checks");
    expect(migration).toContain("new.channel <> 'televote'");
    expect(migration).toContain("new.submission_id is not null");
    expect(migration).toContain("private.v3_televote_recovery_handles");
    expect(migration).toContain("v_operation_id := coalesce(v_operation_id, new.id)");
    expect(migration).toContain("'televote.submit'");
    expect(migration).toContain("private.studio2_request_fingerprint");
  });

  it("keeps submit_vote_checked authoritative instead of creating a second ballot write path", () => {
    expect(migration).not.toContain("insert into televoting.vote_submissions");
    expect(migration).not.toContain("insert into televoting.vote_entries");
    expect(migration).not.toContain("update televoting.vote_submissions");
    expect(migration).not.toContain("update televoting.vote_entries");
    expect(migration).toContain("Completed Televote preflight does not match canonical ballot state");
  });

  it("emits round and ballot facts only after successful canonical operations", () => {
    expect(migration).toContain("on public.studio2_operation_receipts");
    expect(migration).toContain("new.status = 'succeeded'");
    expect(migration).toContain("'televote.round.open'");
    expect(migration).toContain("'televote.round.closed'");
    expect(migration).toContain("'televote.opened'");
    expect(migration).toContain("'televote.closed'");
    expect(migration).toContain("'televote.ballot_submitted'");
    expect(migration).toContain("private.v3_emit_domain_event");
  });

  it("binds consequence provenance to the canonical Solaris edition and exact round/preflight", () => {
    expect(migration).toContain("link.service = 'televoting'");
    expect(migration).toContain("link.entity_type = 'edition'");
    expect(migration).toContain("link.solaris_id = v_edition_id");
    expect(migration).toContain("preflight.submission_id = submission.id");
    expect(migration).toContain("preflight.round_id = submission.round_id");
    expect(migration).toContain("v_aggregate_version := nullif(new.result ->> 'roundVersion', '')::bigint");
  });

  it("does not leak ballot rankings or integrity details into event payloads", () => {
    expect(migration).not.toContain("'ballotMap'");
    expect(migration).not.toContain("'entries'");
    expect(migration).not.toContain("'points'");
    expect(migration).not.toContain("'ipHash'");
    expect(migration).not.toContain("'fingerprintHash'");
    expect(migration).toContain("'submissionId'");
    expect(migration).toContain("'preflightId'");
  });

  it("uses replay-safe service-role consumers for tasks and open notifications", () => {
    expect(migration).toContain("'televote.tasks'");
    expect(migration).toContain("'televote.notifications'");
    expect(migration).toContain("private.v3_domain_event_consumer_receipts");
    expect(migration).toContain("v_delivery.lease_owner is distinct from p_worker_id");
    expect(migration).toContain("private.studio2_reconcile_all_organizer_tasks");
    expect(migration).toContain("public.solaris_enqueue_app_notifications(now())");
    expect(migration).toContain("private.studio2_request_is_service_role()");
    expect(migration).toContain("to service_role;");
  });

  it("records concrete S5 evidence for all canonical Televote events", () => {
    expect(registry).toContain('"televote.opened": [');
    expect(registry).toContain('"televote.closed": [');
    expect(registry).toContain('"televote.ballot_submitted": [');
    expect(registry).toContain(
      '"supabase/migrations/20261016043000_v3_s5_televote_consequences.sql"',
    );
  });
});
