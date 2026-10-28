import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const correction = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261027213500_v3_integrity_authority_corrections.sql",
  ),
  "utf8",
);

describe("V3 Integrity authority runtime corrections", () => {
  it("uses the shared operation contract's real R0-R3 risk vocabulary", () => {
    const resolveStart = correction.indexOf(
      "create or replace function public.studio2_integrity_resolve_appeal",
    );
    expect(resolveStart).toBeGreaterThan(-1);
    const resolveBody = correction.slice(resolveStart);
    expect(resolveBody).toContain("'integrity.appeal.resolve'");
    expect(resolveBody).toContain("'R3'");
    expect(resolveBody).not.toContain("'R4'");
  });

  it("keeps protected appeal submission available without Organizer platform-mode gating", () => {
    const submitStart = correction.indexOf(
      "create or replace function public.v3_submit_integrity_appeal",
    );
    const resolveStart = correction.indexOf(
      "create or replace function public.studio2_integrity_resolve_appeal",
    );
    const submitBody = correction.slice(submitStart, resolveStart);

    expect(submitBody).toContain("insert into public.studio2_operation_receipts");
    expect(submitBody).toContain("request_fingerprint");
    expect(submitBody).toContain("IDEMPOTENCY_CONFLICT");
    expect(submitBody).toContain("private.studio2_complete_operation");
    expect(submitBody).not.toContain("private.studio2_claim_operation");
    expect(submitBody).not.toContain("studio2_platform_mutation_allowed");
  });

  it("removes service-role direct DML on canonical Integrity changed-event storage", () => {
    expect(correction).toContain(
      "revoke insert, update, delete, truncate on table public.integrity_case_events",
    );
    expect(correction).toContain("from anon, authenticated, service_role");
  });
});
