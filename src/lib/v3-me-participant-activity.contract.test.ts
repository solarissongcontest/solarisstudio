import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const migration = source(
  "supabase/migrations/20261019235317_v3_me_participant_activity_projection.sql",
);

function projectionSql() {
  const start = migration.indexOf(
    "create or replace function public.v3_my_participant_activity(",
  );
  const end = migration.indexOf(
    "comment on function public.v3_my_participant_activity",
    start,
  );
  return migration.slice(start, end);
}

describe("System V3 P40 participant activity projection", () => {
  it("binds identity only to the authenticated caller", () => {
    const projection = projectionSql();

    expect(projection).toContain("v_actor uuid := auth.uid()");
    expect(projection).toContain("event_row.actor_id = v_actor");
    expect(projection).toContain("receipt.actor_id = v_actor");
    expect(projection).toContain("ballot.user_id = v_actor");
    expect(projection).not.toContain("p_user_id");
    expect(projection).not.toContain("p_actor_id");
  });

  it("fails closed for anonymous callers and unbounded pages", () => {
    const projection = projectionSql();

    expect(projection).toContain("message = 'AUTHENTICATION'");
    expect(projection).toContain("v_limit < 1 or v_limit > 50");
    expect(projection).toContain("message = 'VALIDATION'");
    expect(migration).toContain(
      "revoke all on function public.v3_my_participant_activity(text, integer)",
    );
    expect(migration).toContain("from public, anon");
    expect(migration).toContain("to authenticated");
  });

  it("uses an explicit participant-event allowlist instead of exposing the event ledger", () => {
    const projection = projectionSql();

    expect(projection).toContain("event_row.event_type = 'confirmation.submitted'");
    expect(projection).toContain("receipt.command = 'confirmation.submit'");
    expect(projection).toContain("event_row.event_type = 'entry.submitted'");
    expect(projection).toContain("event_row.event_type = 'televote.ballot_submitted'");
    expect(projection).toContain("receipt.command = 'televote.submit'");
    expect(migration).not.toContain("grant select on private.v3_domain_events");
    expect(migration).not.toContain("grant select on private.v3_domain_event_outbox");
  });

  it("never projects ballot contents or raw event/operation payloads", () => {
    const projection = projectionSql();
    const publicShape = projection.slice(projection.indexOf("page_json as ("));

    expect(projection).toContain("from public.jury_ballot_submissions ballot");
    expect(publicShape).not.toContain("jury_votes");
    expect(publicShape).not.toContain("event_row.payload");
    expect(publicShape).not.toContain("receipt.result");
    expect(publicShape).not.toContain("request_fingerprint");
    expect(publicShape).not.toContain("error_metadata");
    expect(publicShape).not.toContain("idempotency_key");
  });

  it("reconciles superseded Jury and repeated semantic facts explicitly", () => {
    const projection = projectionSql();

    expect(projection).toContain("partition by source_row.semantic_key");
    expect(projection).toContain("ranked.semantic_rank > 1 then 'superseded'");
    expect(projection).toContain("source_row.status = 'superseded'");
    expect(projection).toContain("source_row.status = 'excluded' then 'unavailable'");
  });

  it("uses a stable keyset cursor with an id tie-breaker", () => {
    const projection = projectionSql();

    expect(projection).toContain("v_cursor_at timestamptz");
    expect(projection).toContain("v_cursor_id text");
    expect(projection).toContain("item.occurred_at = v_cursor_at and item.id < v_cursor_id");
    expect(projection).toContain("order by item.occurred_at desc, item.id desc");
    expect(projection).toContain("limit v_limit + 1");
    expect(projection).toContain("'next_before'");
  });

  it("keeps historical receipt fallback privacy-shaped", () => {
    const projection = projectionSql();

    expect(projection).toContain("receipt.command in ('confirmation.submit', 'televote.submit')");
    expect(projection).toContain("not exists (");
    expect(projection).toContain("'operation.receipt'::text as source_event_type");
    expect(projection).not.toContain("receipt.scope as");
    expect(projection).not.toContain("receipt.result as");
  });
});
