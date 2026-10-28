import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261027215001_v3_integrity_reporter_response_authority.sql"),
  "utf8",
);

describe("V3 Integrity reporter response authority", () => {
  it("moves authenticated and anonymous reporter replies behind canonical commands", () => {
    expect(migration).toContain("function public.v3_reporter_reply_integrity_case");
    expect(migration).toContain("function public.v3_public_reply_anonymous_integrity_case");
    expect(migration).toContain("integrity.case.reporter_reply");
    expect(migration).toContain("integrity.case.reporter_reply.anonymous");
  });

  it("requires expected revision and rejects ambiguous idempotency reuse", () => {
    expect(migration).toContain("p_expected_version");
    expect(migration).toContain("v_case.version <> p_expected_version");
    expect(migration).toContain("IDEMPOTENCY_CONFLICT");
    expect(migration).toContain("using errcode = '40001'");
    expect(migration).toContain("private.v3_anonymous_integrity_response_operations");
  });

  it("binds reporter-triggered case transitions to canonical event provenance", () => {
    expect(migration).toContain("set_config('app.integrity_operation_id'");
    expect(migration).toContain("set_config('app.integrity_command'");
    expect(migration).toContain("reporter_reply_integrity_case_impl");
    expect(migration).toContain("public_reply_anonymous_integrity_case_impl");
  });

  it("keeps only documented compatibility delegates externally reachable", () => {
    expect(migration).toContain("TEMPORARY COMPATIBILITY PATH");
    expect(migration).toContain("Sunset:");
    expect(migration.match(/from public, anon, authenticated, service_role/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
