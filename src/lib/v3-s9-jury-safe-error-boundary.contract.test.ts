import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const authority = read(
  "supabase/migrations/20261024200200_v3_s9_s10_observability_authority_fixes.sql",
);
const safeBoundary = read(
  "supabase/migrations/20261024211000_v3_s9_jury_submit_safe_error_boundary.sql",
);

function body(source: string, signature: string, delimiter: string) {
  const start = source.indexOf(`create or replace function ${signature}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const bodyStart = source.indexOf(`as $${delimiter}$`, start);
  expect(bodyStart).toBeGreaterThanOrEqual(0);
  const end = source.indexOf(`$${delimiter}$;`, bodyStart + delimiter.length + 5);
  expect(end).toBeGreaterThan(bodyStart);
  return source.slice(start, end + delimiter.length + 3);
}

describe("System V3 participant Jury safe error boundary", () => {
  it("keeps the forward S13 migration contract explicit", () => {
    expect(safeBoundary).toContain("'v3.s9.jury-submit-safe-error-boundary-v1'");
    expect(safeBoundary).toContain("'forward_fix_only'");
    expect(safeBoundary).not.toMatch(/https:\/\/[^\s'\"]+\.supabase\.co/i);
  });

  it("retains bounded operator diagnostics in S2 while excluding them from participant errors", () => {
    expect(authority).toContain("'sqlstate', v_sqlstate");
    expect(authority).toContain("'message', left(coalesce(v_sqlerrm");

    const publicError = body(
      safeBoundary,
      "private.v3_public_operation_error(",
      "public_error",
    );
    expect(publicError).toContain("jsonb_build_object(");
    expect(publicError).toContain("'code'");
    expect(publicError).toContain("else 'UNKNOWN'");
    expect(publicError).not.toContain("'metadata'");
    expect(publicError).not.toContain("'sqlstate'");
    expect(publicError).not.toContain("'message'");
  });

  it("sanitizes both failed submit/replay responses and reconciliation responses", () => {
    const submit = body(
      safeBoundary,
      "public.v3_submit_jury_ballot(",
      "jury_submit_safe",
    );
    const reconcile = body(
      safeBoundary,
      "public.v3_reconcile_jury_submission(",
      "jury_reconcile_safe",
    );

    for (const rpc of [submit, reconcile]) {
      expect(rpc).toContain("v_response ? 'error'");
      expect(rpc).toContain("private.v3_public_operation_error(v_response -> 'error')");
      expect(rpc).not.toContain("'metadata'");
      expect(rpc).not.toContain("'sqlstate'");
    }
  });

  it("keeps internal Jury implementation layers unavailable to request roles", () => {
    expect(safeBoundary).toContain(
      "revoke all on function public.v3_submit_jury_ballot_validated_impl(uuid, jsonb, uuid, uuid, text)",
    );
    expect(safeBoundary).toContain(
      "revoke all on function public.v3_submit_jury_ballot_s2_impl(uuid, jsonb, uuid, uuid, text)",
    );
    expect(safeBoundary).toContain(
      "revoke all on function public.v3_reconcile_jury_submission_internal_impl(uuid)",
    );
    expect(safeBoundary).toContain(
      "from public, anon, authenticated, service_role;",
    );
    expect(safeBoundary).toContain(
      "grant execute on function public.v3_submit_jury_ballot(uuid, jsonb, uuid, uuid, text)\n  to authenticated;",
    );
  });
});
