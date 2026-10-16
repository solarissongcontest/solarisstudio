import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261016150000_v3_s7_next_in_line_authorization.sql",
  ),
  "utf8",
);

function functionBody(name: string): string {
  const marker = `create or replace function ${name}`;
  const start = migration.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = migration.indexOf("create or replace function", start + marker.length);
  return migration.slice(start, next === -1 ? migration.length : next);
}

describe("System V3 S7 Next in Line authorization + reconciliation", () => {
  it("removes anonymous mutation and requires authenticated canonical command execution", () => {
    const canonical = functionBody("public.v3_submit_next_in_line");
    const legacy = functionBody("public.submit_next_in_line");

    expect(canonical).toContain("v_actor uuid := auth.uid()");
    expect(canonical).toContain("message = 'AUTHENTICATION'");
    expect(canonical).toContain("private.v3_next_in_line_actor_controls_country");
    expect(legacy).toContain("v_actor uuid := auth.uid()");
    expect(legacy).toContain("public.v3_submit_next_in_line");

    expect(migration).toContain(
      "revoke all on function public.submit_next_in_line(jsonb)\n  from public, anon;",
    );
    expect(migration).toContain(
      "grant execute on function public.submit_next_in_line(jsonb)\n  to authenticated;",
    );
    expect(migration).not.toContain(
      "grant execute on function public.submit_next_in_line(jsonb)\n  to anon",
    );
  });

  it("binds edition/source selectors to the actor's current exact country authority", () => {
    const authorization = functionBody(
      "private.v3_next_in_line_actor_controls_country",
    );
    const canonical = functionBody("public.v3_submit_next_in_line");

    expect(authorization).toContain("account.user_id = p_actor");
    expect(authorization).toContain("account.country_id = p_country_id");
    expect(authorization).toContain("account.status = 'active'");
    expect(authorization).toContain("participant.edition_id = p_edition_id");
    expect(authorization).toContain("participant.country_id = p_country_id");
    expect(authorization).toContain("claim.status = 'mine'");
    expect(authorization).toContain("not exists (");
    expect(authorization).toContain("person.identity_key = 'account:' || p_actor::text");

    expect(canonical).toContain("v_source_submission_id");
    expect(canonical).toContain("v_country_id := private.v3_next_in_line_country_for_source");
    expect(canonical).toContain("message = 'AUTHORIZATION'");
    expect(canonical).not.toContain("studio2_access_allowed('next_in_line.manage'");
  });

  it("uses the canonical S2 idempotency receipt instead of browser-local success", () => {
    const canonical = functionBody("public.v3_submit_next_in_line");
    const legacy = functionBody("public.submit_next_in_line");

    expect(canonical).toContain("private.studio2_claim_operation(");
    expect(canonical).toContain("'next_in_line.submit'");
    expect(canonical).toContain("p_idempotency_key");
    expect(canonical).toContain("v_semantic_request");
    expect(canonical).toContain("private.studio2_complete_operation");
    expect(canonical).toContain("'receiptId', v_canonical_operation_id");
    expect(canonical).toContain("'replayed', true");

    expect(legacy).toContain("extensions.digest");
    expect(legacy).toContain("'legacy:'");
  });

  it("keeps one bounded canonical row and immutable revision evidence", () => {
    expect(migration).toContain(
      "next_in_line_submissions_edition_source_v3_uidx",
    );
    expect(migration).toContain("check (length(country) between 1 and 80)");
    expect(migration).toContain("length(artist) <= 160");
    expect(migration).toContain("length(song_title) <= 160");
    expect(migration).toContain("length(song_url) <= 500");
    expect(migration).toContain("studio2_next_in_line_submission_revisions");
    expect(migration).toContain("unique (submission_id, revision)");
    expect(migration).toContain("revision = v_new_revision");
    expect(migration).toContain("last_operation_id = v_canonical_operation_id");
    expect(migration).toContain(
      "revoke insert, update, delete on table public.next_in_line_submissions",
    );
  });

  it("preserves authoritative window, source, NF and duplicate validation", () => {
    const canonical = functionBody("public.v3_submit_next_in_line");

    expect(canonical).toContain("private.studio2_next_in_line_source_eligible");
    expect(canonical).toContain("private.studio2_next_in_line_window_is_open");
    expect(canonical).toContain("entry.id is distinct from nf.winning_entry_id");
    expect(canonical).toContain("entry.review_status = 'accepted'");
    expect(canonical).toContain("duplicate_song");
    expect(canonical).toContain("duplicate_artist");
    expect(canonical).toContain("payload - array[");
  });

  it("provides an authenticated reload projection with revision and receipt evidence", () => {
    const projection = functionBody("public.v3_my_next_in_line");

    expect(projection).toContain("v_actor uuid := auth.uid()");
    expect(projection).toContain("private.v3_next_in_line_actor_controls_country");
    expect(projection).toContain("studio2_next_in_line_submission_revisions");
    expect(projection).toContain("studio2_operation_receipts");
    expect(projection).toContain("'lastOperationId'");
    expect(projection).toContain("'history'");
    expect(projection).toContain("'serverTime'");
    expect(projection).toContain("'submitted'");
    expect(projection).toContain("'upcoming'");
    expect(projection).toContain("'cancelled'");

    expect(migration).toContain(
      "revoke all on function public.v3_my_next_in_line(uuid)\n  from public, anon;",
    );
    expect(migration).toContain(
      "grant execute on function public.v3_my_next_in_line(uuid)\n  to authenticated;",
    );
  });
});
