import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261015090000_v3_s3_televote_invariants.sql",
  "utf8",
);

describe("System V3 S3 Televote invariants", () => {
  it("preserves the existing configured active-ballot identity instead of inventing a second rule", () => {
    expect(migration).toContain("televoting_vs_round_username");
    expect(migration).toContain("canonical round/username uniqueness index");
    expect(migration).toContain("duplicate active canonical ballots exist");
    expect(migration).not.toContain("delete from televoting.vote_submissions");
    expect(migration).not.toContain("update televoting.vote_submissions");
  });

  it("keeps historical evidence outside modern normalization and scope rewrites", () => {
    expect(migration).toContain("vote_submissions_modern_identity_v3_check");
    expect(migration).toContain("is_historical");
    expect(migration).toContain("Historical ballots remain exempt");
    expect(migration).toContain("vote-entry history classification differs from its ballot");
  });

  it("stages and validates modern identity and preflight binding state", () => {
    expect(migration).toContain("vote_preflight_checks_televote_binding_state_v3_check");
    expect(migration.match(/not valid;/g)).toHaveLength(2);
    expect(migration.match(/validate constraint/g)).toHaveLength(2);
  });

  it("makes a completed Televote preflight one-to-one with its exact modern ballot", () => {
    expect(migration).toContain("vote_preflight_checks_televote_submission_v3_idx");
    expect(migration).toContain("v3_validate_televote_preflight_link");
    expect(migration).toContain("preflight.submission_id = new.id");
    expect(migration).toContain("upper(new.country_code) is distinct from upper(v_submission.country_code)");
    expect(migration).toContain("deferrable initially deferred");
  });

  it("keeps modern vote entries inside the parent ballot round in both write directions", () => {
    expect(migration).toContain("v3_guard_televote_entry_scope");
    expect(migration).toContain("round_entry.round_id = v_submission.round_id");
    expect(migration).toContain("round_entry.round_id = new.round_id");
    expect(migration).toContain("Modern Televote ballot cannot move outside the scope of its vote entries");
  });

  it("requires modern ballot country identity to resolve through the Televoting country registry", () => {
    expect(migration).toContain("v3_guard_televote_submission_identity");
    expect(migration).toContain("country.code = new.country_code");
    expect(migration).toContain("Modern Televote ballot must use a known voting country");
  });

  it("revokes direct execution of private S3 guards", () => {
    for (const functionName of [
      "v3_guard_televote_submission_identity",
      "v3_guard_televote_entry_scope",
      "v3_validate_televote_preflight_link",
    ]) {
      expect(migration).toContain(`revoke all on function private.${functionName}()`);
    }
  });
});
