import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261015080000_v3_s3_jury_invariants.sql",
  "utf8",
);

describe("System V3 S3 Jury invariants", () => {
  it("audits the existing final-ballot identity and production-compatible legacy evidence", () => {
    expect(migration).toContain(
      "show/delegation final-ballot uniqueness is missing",
    );
    expect(migration).toContain(
      "legacy jury_votes are intentionally preserved without ballot_submission_id",
    );
    expect(migration).not.toContain("delete from public.jury_votes");
    expect(migration).not.toContain("update public.jury_votes");
  });

  it("allows only one open Jury window per edition and validates lifecycle timestamps", () => {
    expect(migration).toContain(
      "jury_voting_windows_one_open_per_edition_v3_idx",
    );
    expect(migration).toContain("where status = 'open'");
    expect(migration).toContain("jury_voting_windows_lifecycle_v3_check");
    expect(migration).toContain("opened_at is not null");
    expect(migration).toContain("closed_at >= opened_at");
  });

  it("stages and validates the row-local Jury lifecycle constraints", () => {
    expect(migration).toContain(
      "jury_ballot_submissions_review_lifecycle_v3_check",
    );
    expect(migration).toContain("jury_ballot_statuses_timeline_v3_check");
    expect(migration.match(/not valid;/g)).toHaveLength(3);
    expect(migration.match(/validate constraint/g)).toHaveLength(3);
  });

  it("binds every modern ballot to its exact show, edition, user and completed preflight", () => {
    expect(migration).toContain("v3_validate_jury_submission_scope");
    expect(migration).toContain("v3_validate_jury_preflight_ballot_link");
    expect(migration).toContain(
      "preflight.jury_ballot_submission_id is distinct from new.id",
    );
    expect(migration).toContain(
      "preflight.account_user_id is distinct from new.user_id",
    );
    expect(migration).toContain("preflight.submitted_at is null");
    expect(
      migration.match(/deferrable initially deferred/g) ?? [],
    ).toHaveLength(expect.any(Number));
    expect((migration.match(/deferrable initially deferred/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it("keeps linked vote evidence inside the exact submitted ballot scope", () => {
    expect(migration).toContain("v3_validate_jury_vote_ballot_scope");
    expect(migration).toContain(
      "new.voter_country_id is distinct from v_ballot.voter_country_id",
    );
    expect(migration).toContain(
      "Linked jury vote must remain inside its exact ballot scope",
    );
  });

  it("prevents did-not-vote state from coexisting with a submitted ballot", () => {
    expect(migration).toContain("v3_validate_jury_dnv_scope");
    expect(migration).toContain(
      "Jury did-not-vote state cannot coexist with a submitted ballot",
    );
    expect(migration).toContain(
      "Jury invariant audit failed: did-not-vote state coexists with a submitted ballot",
    );
  });

  it("revokes direct execution of private S3 guard functions", () => {
    for (const functionName of [
      "v3_validate_jury_window_scope",
      "v3_validate_jury_submission_scope",
      "v3_validate_jury_preflight_ballot_link",
      "v3_validate_jury_vote_ballot_scope",
      "v3_validate_jury_dnv_scope",
    ]) {
      expect(migration).toContain(`revoke all on function private.${functionName}()`);
    }
  });
});
