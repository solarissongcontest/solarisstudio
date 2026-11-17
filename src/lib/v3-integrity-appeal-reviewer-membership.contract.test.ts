import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const authority = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261117161000_v3_integrity_case_appeal_authority.sql"), "utf8",
);
const hostile = readFileSync(
  resolve(process.cwd(), ".github/scripts/rules-integrity-security-rehearsal.sh"), "utf8",
);
const start = authority.indexOf("create or replace function public.studio2_integrity_assign_appeal_reviewer(");
const end = authority.indexOf("$body$;", start);
const assign = authority.slice(start, end);

describe("P04 Integrity appeal reviewer requires active global Permission Engine Organizer", () => {
  it("enforces the canonical, unexpired global role assignment rather than legacy user_roles", () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(assign).toContain("public.studio2_role_assignments assignment");
    expect(assign).toContain("assignment.user_id = p_user_id");
    expect(assign).toContain("assignment.role_key = 'organizer'");
    expect(assign).toContain("assignment.edition_id is null");
    expect(assign).toContain("assignment.expires_at is null or assignment.expires_at > now()");
    expect(assign).not.toContain("public.user_roles");
    expect(assign).toContain("Appeal reviewer must be an organizer");
  });

  it("retains the authorization, conflict checks, expected revision and canonical receipt", () => {
    expect(assign).toContain("studio2_access_allowed('integrity.sanction', null, false)");
    expect(assign).toContain("p_expected_version");
    expect(assign).toContain("v_appeal.version <> p_expected_version");
    expect(assign).toContain("The appeal submitter cannot review their own appeal");
    expect(assign).toContain("The original sanction decision-maker cannot be the appeal reviewer");
    expect(assign).toContain("The original finding decision-maker cannot be the appeal reviewer");
    expect(assign).toContain("private.studio2_claim_operation");
    expect(assign).toContain("private.studio2_complete_operation");
  });

  it("uses the actual local JWT/DB role rehearsal for allowed and forbidden assignments", () => {
    expect(hostile).toContain("studio2_role_assignments(user_id, role_key, edition_id, expires_at, assigned_by)");
    expect(hostile).toContain("fresh organizer B is assigned appeal review");
    expect(hostile).toContain("organizer-role appellant cannot review their own appeal");
    expect(hostile).toContain("original finding/sanction author cannot review the appeal");
    expect(hostile).toContain("fresh reviewer records final appeal outcome");
  });
});
