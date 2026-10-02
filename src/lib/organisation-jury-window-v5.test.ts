import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Organisation OS V5 jury-window operations", () => {
  const migration = source(
    "supabase/migrations/20261003014000_organisation_os_v5_jury_window_operations.sql",
  );
  const control = source("src/components/admin/JuryVotingWindowControl.tsx");

  it("versions the whole edition when any jury window changes", () => {
    expect(migration).toContain(
      "create table if not exists public.studio2_jury_window_versions",
    );
    expect(migration).toContain("private.studio2_touch_jury_window_version");
    expect(migration).toContain(
      "after insert or update or delete on public.jury_voting_windows",
    );
    expect(migration).toContain(
      "public.studio2_jury_window_versions.version + 1",
    );
  });

  it("requires preview, R2 replay identity and an expected edition version", () => {
    expect(migration).toContain("public.studio2_jury_window_change_preview");
    expect(migration).toContain("public.studio2_apply_jury_voting_status");
    expect(migration).toContain("private.studio2_claim_operation");
    expect(migration).toContain("'R2'");
    expect(migration).toContain("p_idempotency_key");
    expect(migration).toContain("p_expected_version");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain(
      "Jury voting windows changed since this preview was loaded. Refresh before continuing.",
    );
    expect(migration).toContain("using errcode = '40001'");
  });

  it("closes the authenticated legacy status-mutation bypass", () => {
    expect(migration).toContain(
      "revoke execute on function public.admin_set_jury_voting_status(uuid, text)",
    );
    expect(migration).toContain("from authenticated");
  });

  it("shows the real cross-show impact before applying the change", () => {
    expect(control).toContain('rpc("studio2_jury_window_change_preview"');
    expect(control).toContain('rpc("studio2_apply_jury_voting_status"');
    expect(control).not.toContain('rpc("admin_set_jury_voting_status"');
    expect(control).toContain("AdminConfirmSheet");
    expect(control).toContain("otherOpenWindows");
    expect(control).toContain("submittedBallots");
    expect(control).toContain("operationId: crypto.randomUUID()");
    expect(control).toContain("idempotencyKey: crypto.randomUUID()");
    expect(control).toContain("pending.preview.expectedVersion");
  });
});
