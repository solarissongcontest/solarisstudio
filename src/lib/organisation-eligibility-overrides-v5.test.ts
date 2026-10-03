import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Organisation OS V5 eligibility override operations", () => {
  const migration = source(
    "supabase/migrations/20261003016000_organisation_os_v5_eligibility_override_operations.sql",
  );
  const model = source("src/lib/studio2-eligibility.ts");
  const route = source("src/routes/_authenticated/admin/eligibility.tsx");

  it("versions each edition-country-rule exception decision", () => {
    expect(migration).toContain(
      "create table if not exists public.studio2_eligibility_override_versions",
    );
    expect(migration).toContain(
      "private.studio2_touch_eligibility_override_version",
    );
    expect(migration).toContain(
      "after insert or update or delete on public.studio2_eligibility_overrides",
    );
    expect(migration).toContain(
      "public.studio2_eligibility_override_versions.version + 1",
    );
  });

  it("requires R2 preview, replay identity and stale-decision rejection", () => {
    expect(migration).toContain(
      "public.studio2_eligibility_override_change_preview",
    );
    expect(migration).toContain(
      "public.studio2_apply_eligibility_override_change",
    );
    expect(migration).toContain("private.studio2_claim_operation");
    expect(migration).toContain("'R2'");
    expect(migration).toContain("p_idempotency_key");
    expect(migration).toContain("p_expected_version");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain(
      "Eligibility override state changed since this preview was loaded. Refresh before continuing.",
    );
    expect(migration).toContain("using errcode = '40001'");
  });

  it("keeps factual eligibility unchanged while changing only effective exception state", () => {
    expect(route).toContain("The factual eligibility result does not change.");
    expect(route).toContain("pending.rule.factualStatus");
    expect(route).toContain("Effective after change");
    expect(route).toContain("pending.rule.evidence");
    expect(route).toContain("Prior decisions");
  });

  it("removes authenticated access to primitive create and revoke RPCs", () => {
    expect(migration).toContain(
      "revoke execute on function public.studio2_create_eligibility_override(",
    );
    expect(migration).toContain(
      "revoke execute on function public.studio2_revoke_eligibility_override(",
    );
    expect(migration).toContain("from authenticated");
  });

  it("keeps one operation identity across confirmation retries", () => {
    expect(model).toContain("'studio2_eligibility_override_change_preview'");
    expect(model).toContain("'studio2_apply_eligibility_override_change'");
    expect(route).toContain("AdminConfirmSheet");
    expect(route).toContain("operationId: crypto.randomUUID()");
    expect(route).toContain("idempotencyKey: crypto.randomUUID()");
    expect(route).toContain("operationId: pending.operationId");
    expect(route).toContain("idempotencyKey: pending.idempotencyKey");
    expect(route).toContain("expectedVersion: pending.preview.expectedVersion");
  });
});
