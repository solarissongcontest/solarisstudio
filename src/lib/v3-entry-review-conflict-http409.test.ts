import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261018024500_v3_entry_review_conflict_http409.sql",
  ),
  "utf8",
);

function functionBody(name: string) {
  const marker = `create or replace function ${name}`;
  const start = migration.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = migration.indexOf("\nrevoke all on function", start);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end);
}

describe("System V3 Entry review optimistic-concurrency HTTP contract", () => {
  it("maps both exact-version conflicts to a non-retryable HTTP 409", () => {
    const apply = functionBody("public.studio2_apply_confirmation_entry_review");

    expect(apply.match(/raise sqlstate 'PT409' using message = 'VERSION_CONFLICT';/g)).toHaveLength(2);
    expect(apply).not.toContain("errcode = '40001'");
    expect(apply).not.toContain("sqlstate '40001'");
  });

  it("preserves exact Entry revision and submission review CAS checks", () => {
    const apply = functionBody("public.studio2_apply_confirmation_entry_review");

    expect(apply).toContain("currentVersionId");
    expect(apply).toContain("p_expected_entry_version");
    expect(apply).toContain("studio2_confirmation_review_versions");
    expect(apply).toContain("p_expected_version");
    expect(apply).toContain("for update");
  });

  it("preserves semantic idempotency, authorization, audit, and receipt completion", () => {
    const apply = functionBody("public.studio2_apply_confirmation_entry_review");

    expect(apply).toContain("studio2_access_allowed('confirmation.manage'");
    expect(apply).toContain("private.studio2_claim_operation(");
    expect(apply).toContain("'expectedEntryVersion', p_expected_entry_version");
    expect(apply).toContain("insert into public.submission_review_history");
    expect(apply).toContain("private.studio2_complete_operation");
    expect(apply).toContain("public.studio2_reconcile_operation");
  });

  it("keeps the authenticated/service-role RPC boundary unchanged", () => {
    expect(migration).toContain(
      "revoke all on function public.studio2_apply_confirmation_entry_review(\n  text, uuid, text, text, uuid, text, bigint, uuid, uuid\n) from public, anon;",
    );
    expect(migration).toContain(
      "grant execute on function public.studio2_apply_confirmation_entry_review(\n  text, uuid, text, text, uuid, text, bigint, uuid, uuid\n) to authenticated, service_role;",
    );
  });
});
