import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const migration = source(
  "supabase/migrations/20260913120500_fix_studio2_communications_rls.sql",
);

function policyBody(name: string) {
  const start = migration.indexOf(`create policy ${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const remainder = migration.slice(start);
  const nextPolicy = remainder.indexOf("\ncreate policy ", 1);
  return nextPolicy >= 0 ? remainder.slice(0, nextPolicy) : remainder;
}

describe("Official Communications RLS regression", () => {
  it("keeps private authorization helpers behind public security-definer predicates", () => {
    expect(migration).toContain(
      "create or replace function public.studio2_can_manage_communications",
    );
    expect(migration).toContain(
      "create or replace function public.studio2_can_read_notice",
    );
    expect(migration).toMatch(/studio2_can_manage_communications[\s\S]*security definer/i);
    expect(migration).toMatch(/studio2_can_read_notice[\s\S]*security definer/i);
    expect(migration).toContain("private.studio2_user_has_capability");
    expect(migration).toContain("private.studio2_user_can_receive_notice_v2");
  });

  it("never makes RLS execute private helpers directly as the authenticated caller", () => {
    const noticePolicy = policyBody("studio2_official_notices_read");
    expect(noticePolicy).toContain("public.studio2_can_read_notice(");
    expect(noticePolicy).not.toContain("private.studio2_user_has_capability");
    expect(noticePolicy).not.toContain("private.studio2_user_can_receive_notice");

    const revisionsPolicy = policyBody("studio2_notice_versions_organizer_read");
    expect(revisionsPolicy).toContain("public.studio2_can_manage_communications(edition_id)");
    expect(revisionsPolicy).not.toContain("private.studio2_user_has_capability");
  });

  it("does not expose the authorization predicates to anonymous clients", () => {
    expect(migration).toContain(
      "revoke all on function public.studio2_can_manage_communications(uuid)",
    );
    expect(migration).toContain(
      "revoke all on function public.studio2_can_read_notice(uuid, text, timestamptz, text, uuid[], text)",
    );
    expect(migration).toContain("to authenticated, service_role");
  });

  it("uses the current single-HOD-aware notice recipient resolver", () => {
    expect(migration).toContain("private.studio2_user_can_receive_notice_v2(");
    expect(migration).not.toContain("studio2_user_can_receive_notice_v2_legacy_roster");
  });
});
