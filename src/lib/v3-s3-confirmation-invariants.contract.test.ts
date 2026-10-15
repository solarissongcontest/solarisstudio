import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261015050000_v3_s3_confirmation_invariants.sql",
  "utf8",
);
const rehearsal = readFileSync(
  ".github/scripts/v3-s3-confirmation-invariants-rehearsal.sh",
  "utf8",
);

describe("System V3 S3 Confirmation invariants", () => {
  it("audits the existing one-effective-requirement index instead of creating another model", () => {
    expect(migration).toContain("studio2_confirmation_requirements_current_idx");
    expect(migration).toContain("duplicate effective requirements exist");
    expect(migration).not.toContain("create table");
  });

  it("stages, validates and enforces the canonical lifecycle shape", () => {
    expect(migration).toContain("studio2_confirmation_requirement_lifecycle_v3_check");
    expect(migration).toContain(") not valid;");
    expect(migration).toContain("validate constraint");
    expect(migration).toContain("resolved_by_submission_id is null");
  });

  it("binds a resolution submission to the exact requirement scope", () => {
    expect(migration).toContain("studio2_guard_confirmation_resolution_scope");
    expect(migration).toContain("v_submission.edition_id is distinct from new.edition_id");
    expect(migration).toContain("v_submission_country_id is distinct from new.country_id");
    expect(migration).toContain(
      "coalesce(v_submission.updated_at, v_submission.submitted_at) < new.valid_from",
    );
  });

  it("rehearses both headline invariants against local Supabase only", () => {
    expect(rehearsal).toContain("Refusing hosted Supabase rehearsal");
    expect(rehearsal).toContain("duplicate effective requirement");
    expect(rehearsal).toContain("A later round remains only a window");
    expect(rehearsal).toContain("cross-delegation resolution link");
  });
});
