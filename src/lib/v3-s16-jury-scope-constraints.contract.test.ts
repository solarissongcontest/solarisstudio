import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261029165000_v3_s16_jury_scope_constraints.sql",
  "utf8",
).toLowerCase();

describe("V3 S16 Jury scope constraints", () => {
  it("binds Jury windows and ballots to the exact show edition declaratively", () => {
    expect(migration).toContain(
      "foreign key (show_id, edition_id)\n  references public.shows(id, edition_id)",
    );
    expect(migration).toContain(
      "jury_voting_windows_show_edition_v3_fkey",
    );
    expect(migration).toContain(
      "jury_ballot_submissions_show_edition_v3_fkey",
    );
  });

  it("protects linked vote/ballot reverse drift with a composite foreign key", () => {
    expect(migration).toContain(
      "foreign key (ballot_submission_id, show_id, edition_id)",
    );
    expect(migration).toContain(
      "references public.jury_ballot_submissions(id, show_id, edition_id)",
    );
    expect(migration).toContain("jury_votes_ballot_scope_v3_fkey");
  });

  it("audits and validates before retiring the procedural guards", () => {
    expect(migration).toContain("do $audit$");
    expect(migration).toContain(
      "validate constraint jury_voting_windows_show_edition_v3_fkey",
    );
    expect(migration).toContain(
      "validate constraint jury_ballot_submissions_show_edition_v3_fkey",
    );
    expect(migration).toContain(
      "validate constraint jury_votes_ballot_scope_v3_fkey",
    );
    expect(migration).toContain(
      "drop trigger if exists v3_s3_validate_jury_window_scope",
    );
    expect(migration).toContain(
      "drop trigger if exists v3_guard_jury_ballot_reference_scope",
    );
  });

  it("keeps retired helper signatures fail-closed and non-writing", () => {
    expect(migration).toContain(
      "retired jury window scope trigger must not be invoked",
    );
    expect(migration).toContain(
      "retired jury ballot reference guard must not be invoked",
    );
    expect(migration).toContain("from public, anon, authenticated, service_role");
  });

  it("carries replay-time structural proof", () => {
    expect(migration).toContain("do $proof$");
    expect(migration).toContain("constraint_row.convalidated");
    expect(migration).toContain("retired jury scope trigger remains attached");
  });
});
