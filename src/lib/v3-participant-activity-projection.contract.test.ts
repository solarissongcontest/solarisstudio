import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261019235930_v3_participant_activity_projection.sql"),
  "utf8",
);
const operationFoundation = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261002203000_organisation_os_v5_operation_contract.sql"),
  "utf8",
);
const eventFoundation = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261015180000_v3_s4_domain_event_outbox.sql"),
  "utf8",
);

describe("V3 participant activity recipient projection", () => {
  it("is caller-scoped and never accepts a caller-selected user identity", () => {
    expect(migration).toContain("v_actor uuid := auth.uid()");
    expect(migration).toContain("where event_row.actor_id = v_actor");
    expect(migration).toContain("receipt.actor_id = v_actor");
    expect(migration).not.toContain("p_user_id");
    expect(migration).toContain("raise exception 'AUTHENTICATION'");
  });

  it("derives activity from canonical successful receipts and immutable domain facts", () => {
    expect(migration).toContain("from private.v3_domain_events event_row");
    expect(migration).toContain("join public.studio2_operation_receipts receipt");
    expect(migration).toContain("receipt.status = 'succeeded'");
    expect(migration).not.toContain("content_events");
    expect(migration).not.toContain("create table public.v3_participant_activity");
  });

  it("allowlists only recipient-safe participant facts instead of exposing Organizer audit activity", () => {
    expect(migration).toContain("'entry.submitted'");
    expect(migration).toContain("'confirmation.submitted'");
    expect(migration).toContain("'televote.ballot_submitted'");
    expect(migration).toContain("receipt.command = 'confirmation.submit'");
    expect(migration).toContain("receipt.command = 'televote.submit'");
    expect(migration).not.toContain("jury.ballot_changed");
    expect(migration).not.toContain("confirmation.window_changed");
    expect(migration).not.toContain("results.published");
  });

  it("collapses multi-fact operations deterministically so replay cannot duplicate the feed", () => {
    expect(migration).toContain("partition by candidate.operation_id");
    expect(migration).toContain("candidate.display_priority");
    expect(migration).toContain("where ranked.operation_rank = 1");
    expect(migration).toContain("when 'entry.submitted' then 10");
    expect(migration).toContain("when 'confirmation.submitted' then 20");
  });

  it("reconciles corrected and unavailable source truth without caching a second history", () => {
    expect(migration).toContain("then 'unavailable'");
    expect(migration).toContain("then 'superseded'");
    expect(migration).toContain("newer.aggregate_version > fact.aggregate_version");
    expect(migration).toContain("submission.id is null");
    expect(migration).toContain("televote_submission.id is null");
  });

  it("does not expose ballot content or internal receipt/event metadata", () => {
    for (const forbiddenOutputKey of [
      "'payload',",
      "'scope',",
      "'result',",
      "'idempotency_key',",
      "'request_fingerprint',",
      "'actor_id',",
      "'correlation_id',",
    ]) {
      expect(migration).not.toContain(forbiddenOutputKey);
    }
    expect(migration).not.toContain("ranking");
    expect(migration).not.toContain("rankings");
    expect(migration).not.toContain("vote_points");
  });

  it("uses a bounded deterministic tuple cursor rather than timestamp-only pagination", () => {
    expect(migration).toContain("p_limit not between 1 and 50");
    expect(migration).toContain("p_before_operation_id uuid default null");
    expect(migration).toContain("shaped.operation_id < p_before_operation_id");
    expect(migration).toContain("order by filtered.occurred_at desc, filtered.operation_id desc");
    expect(migration).toContain("'next_before_operation_id'");
  });

  it("keeps raw canonical receipt and event stores unavailable to authenticated browsers", () => {
    expect(operationFoundation).toContain(
      "revoke all on table public.studio2_operation_receipts from public, anon, authenticated",
    );
    expect(eventFoundation).toContain(
      "revoke all on table private.v3_domain_events from public, anon, authenticated",
    );
    expect(eventFoundation).toContain("Canonical domain events are immutable");
  });

  it("grants only the shaped RPC to authenticated callers", () => {
    expect(migration).toContain(
      "grant execute on function public.v3_my_participant_activity(timestamptz, integer, uuid)",
    );
    expect(migration).toContain("to authenticated");
    expect(migration).toContain("revoke all on function public.v3_my_participant_activity");
  });
});
