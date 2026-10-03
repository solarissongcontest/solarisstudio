import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Organisation OS V5 participation-status operations", () => {
  const migration = source(
    "supabase/migrations/20261003015000_organisation_os_v5_participation_status_operations.sql",
  );
  const route = source(
    "src/routes/_authenticated/admin/participant-status/$slug.tsx",
  );

  it("versions participant and entry truth for every identity", () => {
    expect(migration).toContain(
      "create table if not exists public.studio2_participation_status_versions",
    );
    expect(migration).toContain(
      "private.studio2_touch_participation_status_version",
    );
    expect(migration).toContain(
      "after insert or delete or update of",
    );
    expect(migration).toContain("on public.participants");
    expect(migration).toContain("on public.entries");
    expect(migration).toContain(
      "public.studio2_participation_status_versions.version + 1",
    );
  });

  it("requires an R2 preview, stable replay identity and expected version", () => {
    expect(migration).toContain(
      "public.studio2_participation_status_change_preview",
    );
    expect(migration).toContain(
      "public.studio2_apply_participation_status",
    );
    expect(migration).toContain("private.studio2_claim_operation");
    expect(migration).toContain("'R2'");
    expect(migration).toContain("p_idempotency_key");
    expect(migration).toContain("p_expected_version");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain(
      "Participation status changed since this preview was loaded. Refresh before continuing.",
    );
    expect(migration).toContain("using errcode = '40001'");
  });

  it("previews scoreboard and publication impact without deleting result rows", () => {
    expect(migration).toContain("'participantRows'");
    expect(migration).toContain("'resultRows'");
    expect(migration).toContain("'publishedResultRows'");
    expect(migration).toContain("'shows'");
    expect(migration).not.toContain("delete from public.results");
  });

  it("closes the authenticated legacy mutation bypass", () => {
    expect(migration).toContain(
      "revoke execute on function public.admin_set_participation_status(",
    );
    expect(migration).toContain("from authenticated");
  });

  it("keeps one retry identity in the confirmation sheet", () => {
    expect(route).toContain(
      'rpc(\n        "studio2_participation_status_change_preview"',
    );
    expect(route).toContain(
      'rpc(\n        "studio2_apply_participation_status"',
    );
    expect(route).not.toContain(
      'rpc("admin_set_participation_status"',
    );
    expect(route).toContain("AdminConfirmSheet");
    expect(route).toContain("operationId: crypto.randomUUID()");
    expect(route).toContain("idempotencyKey: crypto.randomUUID()");
    expect(route).toContain("p_operation_id: pending.operationId");
    expect(route).toContain("p_idempotency_key: pending.idempotencyKey");
    expect(route).toContain(
      "p_expected_version: pending.preview.expectedVersion",
    );
    expect(route).toContain("publishedResultRows");
    expect(route).toContain("Existing score rows are not deleted.");
  });
});
