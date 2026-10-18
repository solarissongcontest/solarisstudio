import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261018053000_v3_s6_confirmation_requirement_reconciliation.sql",
  ),
  "utf8",
);
const requirementAuthority = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261002235000_organisation_os_v5_confirmation_requirements.sql",
  ),
  "utf8",
);

function verifierBody() {
  const startMarker = "create or replace function public.studio2_verify_confirmation_requirements(";
  const start = migration.indexOf(startMarker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = migration.indexOf(
    "revoke all on function public.studio2_verify_confirmation_requirements",
    start,
  );
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end);
}

describe("System V3 S6 Confirmation requirement verification", () => {
  it("keeps canonical requirement reconciliation inside the existing domain invariant", () => {
    expect(requirementAuthority).toContain(
      "create or replace function private.studio2_reconcile_confirmation_requirement(",
    );
    expect(requirementAuthority).toContain(
      "create trigger studio2_confirmation_requirement_reconcile",
    );
    expect(migration).not.toContain(
      "create or replace function public.studio2_reconcile_confirmation_requirements(",
    );
    expect(migration).not.toContain(
      "perform private.studio2_reconcile_confirmation_requirement(",
    );
  });

  it("documents why bulk recovery must not mutate canonical Confirmation truth", () => {
    expect(migration).toContain(
      "studio2_confirmation_requirements is part of the Confirmation",
    );
    expect(migration).toContain("canonical write model, not a disposable projection");
    expect(migration).toContain("this migration deliberately adds no bulk repair");
  });

  it("provides an independent read-only verifier with a hard 500-country ceiling", () => {
    const verify = verifierBody();
    expect(verify).toContain("language plpgsql\nstable");
    expect(verify).toContain("p_limit integer default 500");
    expect(verify).toContain("p_limit > 500");
    expect(verify).toContain("'verification_limit_exceeded'");
    expect(verify).toContain("'state', 'unknown'");
    expect(verify).not.toContain("insert into");
    expect(verify).not.toContain("update public.");
    expect(verify).not.toContain("delete from");
  });

  it("verifies only countries evidenced by a current requirement or canonical submission", () => {
    const verify = verifierBody();
    expect(verify).toContain("from public.studio2_confirmation_requirements requirement");
    expect(verify).toContain("from public.submissions submission");
    expect(verify).toContain("private.studio2_confirmation_country_id(submission.country)");
    expect(verify).not.toContain("country_accounts");
    expect(verify).not.toContain("participants");
  });

  it("reuses the canonical country resolver for candidate and submission lookup", () => {
    const verify = verifierBody();
    expect(verify).toContain(
      "private.studio2_confirmation_country_id(submission.country) = v_country_id",
    );
    expect(verify).not.toContain("v_country.name");
    expect(verify).not.toContain("v_country.short_code");
    expect(verify).not.toContain("v_country public.countries%rowtype");
  });

  it("clears row records between candidates so a missing row cannot reuse prior loop state", () => {
    const verify = verifierBody();
    expect(verify).toContain("v_requirement := null;");
    expect(verify).toContain("v_submission := null;");
  });

  it("matches canonical requirement semantics for invalidation and retained legacy completion", () => {
    const verify = verifierBody();
    expect(verify).toContain("v_requirement.status = 'invalidated'");
    expect(verify).toContain("v_requirement.resolved_by_submission_id is not null");
    expect(verify).toContain("'missing_requirement'");
    expect(verify).toContain("'resolution_mismatch'");
    expect(verify).toContain("'stale_resolution'");
  });

  it("exposes verification only to service-role recovery tooling", () => {
    expect(migration).toContain(
      "revoke all on function public.studio2_verify_confirmation_requirements(uuid, integer)",
    );
    expect(migration).toContain("from public, anon, authenticated;");
    expect(migration).toContain(
      "grant execute on function public.studio2_verify_confirmation_requirements(uuid, integer)\n  to service_role;",
    );
  });
});