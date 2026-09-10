import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260910211500_integrity_case_center.sql",
  ),
  "utf8",
);

describe("anonymous integrity case security contract", () => {
  it("forces fully anonymous cases to have no reporter account identity", () => {
    expect(migration).toContain("fully_anonymous_has_no_reporter_identity");
    expect(migration).toContain("identity_mode <> 'anonymous' or reporter_user_id is null");
    expect(migration).toMatch(/'anonymous',\s*null,\s*_summary/s);
  });

  it("stores only a SHA-256 recovery-secret digest", () => {
    expect(migration).toContain("recovery_secret_hash");
    expect(migration).toContain("extensions.digest");
    expect(migration).toContain("'sha256'");
    expect(migration).not.toMatch(/recovery_secret\s+text/i);
  });

  it("revokes direct case-table access and exposes narrow RPCs instead", () => {
    expect(migration).toContain("alter table public.integrity_cases enable row level security");
    expect(migration).toContain("revoke all on public.integrity_cases from anon, authenticated");
    expect(migration).toContain("public_create_anonymous_integrity_case");
    expect(migration).toContain("public_get_anonymous_integrity_case");
    expect(migration).toContain("public_reply_anonymous_integrity_case");
  });

  it("keeps organizer-only internal notes separate from reporter-visible messages", () => {
    expect(migration).toContain("integrity_case_internal_notes");
    expect(migration).toContain("visible_to_reporter boolean not null default true");
    expect(migration).toContain("'internal.note', 'Internal investigator note added', false");
  });
});
