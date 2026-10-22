import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261021024100_v3_s9_jury_submit_event_validation.sql",
  ),
  "utf8",
);

function functionBody(signature: string, delimiter: string) {
  const start = migration.indexOf(`create or replace function ${signature}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const bodyStart = migration.indexOf(`as $${delimiter}$`, start);
  expect(bodyStart).toBeGreaterThanOrEqual(0);
  const end = migration.indexOf(`$${delimiter}$;`, bodyStart + delimiter.length + 5);
  expect(end).toBeGreaterThan(bodyStart);
  return migration.slice(start, end + delimiter.length + 3);
}

describe("System V3 participant Jury submit closure", () => {
  it("is a forward-only migration with no hosted Supabase endpoint", () => {
    expect(migration).toContain("'v3.s9.jury-submit-event-validation-v1'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).not.toMatch(/https:\/\/[^\s'"]+\.supabase\.co/i);
  });

  it("places a safe public argument gate in front of the S2-observed Jury command", () => {
    expect(migration).toContain("rename to v3_submit_jury_ballot_s2_impl");
    expect(migration).toContain(
      "revoke all on function public.v3_submit_jury_ballot_s2_impl",
    );

    const body = functionBody("public.v3_submit_jury_ballot(", "jury_submit_gate");
    const typeCheck = body.indexOf("jsonb_typeof(_entries) is distinct from 'array'");
    const lengthCheck = body.indexOf("jsonb_array_length(_entries) < 1");
    const delegate = body.indexOf("public.v3_submit_jury_ballot_s2_impl(");

    expect(typeCheck).toBeGreaterThanOrEqual(0);
    expect(lengthCheck).toBeGreaterThan(typeCheck);
    expect(delegate).toBeGreaterThan(lengthCheck);
    expect(body.slice(typeCheck, lengthCheck)).toContain("raise exception 'Jury ballot must be an array'");
    expect(body).toContain("jsonb_array_length(_entries) > 50");
    expect(body).toContain("pg_column_size(_entries) > 131072");
  });

  it("bridges only successful real participant Jury operations into the existing S5 lifecycle event", () => {
    const body = functionBody(
      "private.v3_emit_jury_submission_event()",
      "jury_submit_event",
    );
    expect(body).toContain("new.command <> 'jury.submit'");
    expect(body).toContain("new.status <> 'succeeded'");
    expect(body).toContain("new.result ->> 'ballot_submission_id'");
    expect(body).toContain("from public.jury_ballot_submissions ballot");
    expect(body).toContain("ballot.user_id = new.actor_id");
    expect(body).toContain("private.v3_emit_domain_event(");
    expect(body).toContain("'jury.ballot_changed'");
    expect(body).toContain("'changeKind', 'submitted'");
    expect(body).toContain("array['jury.tasks']::text[]");
  });

  it("does not invent a second Jury task worker or participant ballot writer", () => {
    expect(migration).not.toContain("create or replace function public.studio2_process_jury_domain_event");
    expect(migration).not.toContain("insert into public.jury_ballot_submissions");
    expect(migration).not.toContain("insert into public.jury_votes");
    expect(migration).not.toContain("'jury.ballot_submitted'");
  });

  it("attaches the event bridge transactionally to S2 success", () => {
    expect(migration).toContain("after update of status on public.studio2_operation_receipts");
    expect(migration).toContain("new.status = 'succeeded'");
    expect(migration).toContain("new.command = 'jury.submit'");
    expect(migration).toContain("execute function private.v3_emit_jury_submission_event()");
  });
});
