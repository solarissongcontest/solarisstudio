import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { V3_RETIRED_PHYSICAL_TABLES } from "./v3-system-retired-physical-tables";

const migration = readFileSync(
  "supabase/migrations/20261015173000_v3_s3_identity_access_invariants.sql",
  "utf8",
);
const rehearsal = readFileSync(
  ".github/scripts/v3-s3-identity-access-invariants-rehearsal.sh",
  "utf8",
);
const productionUpgrade = readFileSync(
  ".github/scripts/v3-production-head-upgrade-rehearsal.sh",
  "utf8",
);
const focusedWorkflow = readFileSync(
  ".github/workflows/v3-s3-identity-access-rehearsal.yml",
  "utf8",
);

describe("System V3 S3 Identity / Access invariants", () => {
  it("converges duplicate permission revision state on one canonical ledger", () => {
    expect(migration).toContain("studio2_permission_subject_versions");
    expect(migration).toContain("greatest(");
    expect(migration).toContain("select user_id from public.studio2_role_assignments");
    expect(migration).toContain("select user_id from public.studio2_capability_grants");
    expect(migration).toContain("drop table public.studio2_permission_state_versions");
    expect(V3_RETIRED_PHYSICAL_TABLES.has(
      "public.studio2_permission_state_versions",
    )).toBe(true);
  });

  it("removes the duplicate trigger path while preserving compatibility helpers", () => {
    expect(migration).toContain("drop trigger if exists studio2_role_assignment_version_bump");
    expect(migration).toContain("drop trigger if exists studio2_capability_grant_version_bump");
    expect(migration).toContain("studio2_role_assignments_touch_subject_version");
    expect(migration).toContain("studio2_capability_grants_touch_subject_version");
    expect(migration).toContain("create or replace function private.studio2_ensure_permission_version");
    expect(migration).toContain("create or replace function private.studio2_lock_permission_version");
    expect(migration).toContain("create or replace function private.studio2_bump_permission_version");
  });

  it("keeps private compatibility helpers inaccessible to browser roles", () => {
    expect(migration).toContain(
      "revoke all on function private.studio2_ensure_permission_version(uuid)",
    );
    expect(migration).toContain(
      "revoke all on function private.studio2_lock_permission_version(uuid)",
    );
    expect(migration).toContain(
      "revoke all on function private.studio2_bump_permission_version(uuid)",
    );
    expect(rehearsal).toContain(
      "authenticated direct permission revision read",
    );
    expect(rehearsal).toContain(
      "authenticated private permission helper call",
    );
  });

  it("proves one revision bump per authoritative permission mutation", () => {
    expect(rehearsal).toContain("role assignment did not advance revision exactly once");
    expect(rehearsal).toContain("capability grant did not advance revision exactly once");
    expect(rehearsal).toContain("role update did not advance revision exactly once");
    expect(rehearsal).toContain("capability revocation did not advance revision exactly once");
  });

  it("runs on clean, current-main and exact production-head upgrade paths", () => {
    expect(focusedWorkflow).toContain("clean-replay:");
    expect(focusedWorkflow).toContain("upgrade-from-main:");
    expect(focusedWorkflow.match(/v3-s3-identity-access-invariants-rehearsal\.sh/g)?.length)
      .toBeGreaterThanOrEqual(2);
    expect(productionUpgrade).toContain(
      "v3-s3-identity-access-invariants-rehearsal.sh",
    );
  });

  it("fails closed unless the hostile rehearsal is loopback-only", () => {
    expect(rehearsal).toContain("Refusing hosted Supabase rehearsal");
    expect(rehearsal).toContain("Refusing non-local database rehearsal");
  });
});
