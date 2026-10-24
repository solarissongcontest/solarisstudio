import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20261024205500_v3_p40_personal_participation_history.sql";
const migration = readFileSync(
  resolve(process.cwd(), migrationPath),
  "utf8",
);

function historyBody() {
  const start = migration.indexOf("create or replace function public.v3_my_participation_history()");
  expect(start).toBeGreaterThanOrEqual(0);
  return migration.slice(start);
}

describe("V3 P40 personal participation history projection", () => {
  it("is caller-scoped and never accepts another user id", () => {
    const body = historyBody();
    expect(body).toContain("v_actor uuid := auth.uid()");
    expect(body).toContain("message = 'AUTHENTICATION'");
    expect(body).toContain("claim.user_id = v_actor");
    expect(body).toContain("member.member_user_id = v_actor");
    expect(body).not.toMatch(/v3_my_participation_history\s*\([^)]*(?:user|viewer|actor)/i);
    expect(migration).toContain(
      "revoke all on function public.v3_my_participation_history()\n  from public, anon;",
    );
    expect(migration).toContain(
      "grant execute on function public.v3_my_participation_history()\n  to authenticated;",
    );
  });

  it("uses only affirmative edition-scoped recipient evidence for personal roles", () => {
    const body = historyBody();
    expect(body).toContain("public.country_hod_edition_claims");
    expect(body).toContain("claim.status = 'mine'");
    expect(body).toContain("public.delegation_hod_assignments");
    expect(body).toContain("person.identity_key = 'account:' || v_actor::text");
    expect(body).toContain("public.studio2_jury_members");
    expect(body).not.toContain("from public.country_accounts");
    expect(body).not.toContain("public.admin_audit_log");
    expect(body).not.toContain("public.jury_votes");
    expect(body).not.toContain("public.jury_ballot_submissions");
  });

  it("does not leak unpublished edition identity through the History surface", () => {
    const body = historyBody();
    expect(body.match(/edition\.published = true/g)?.length).toBe(3);
    expect(body).not.toContain("edition.published = false");
  });

  it("preserves canonical country identity while using edition-scoped display history", () => {
    const body = historyBody();
    expect(body).toContain("public.country_edition_identities");
    expect(body).toContain("country.short_code as country_code");
    expect(body).toContain("country.name");
    expect(body).toContain("'country_id', row.country_id");
    expect(body).toContain("'country_name', row.country_name");
    expect(body).not.toContain("update public.countries");
    expect(body).not.toContain("update public.country_edition_identities");
  });

  it("marks contradictory HOD evidence superseded and suppresses negative self-claims", () => {
    const body = historyBody();
    expect(body).toContain("assignment.person_id <> own_person.id");
    expect(body).toContain("then 'superseded'::text");
    expect(body).toContain("claim.status = 'mine'");
    expect(body).toContain("and (claim.status is null or claim.status = 'mine')");
    expect(body).not.toContain("claim.status in ('other', 'unknown') then 'unavailable'::text");
  });

  it("never derives personal-current state from legacy edition lifecycle status", () => {
    const body = historyBody();
    expect(body).not.toContain("edition.status = 'active'");
    expect(body).not.toContain("edition.status <> 'completed'");
    expect(body).not.toMatch(/edition\.status\s*(?:=|<>|in\s*\()/i);
  });

  it("uses the Jury membership lifecycle itself for current versus historical", () => {
    const body = historyBody();
    expect(body).toContain("member.status = 'assigned' and member.removed_at is null");
    expect(body).toContain("then 'current'::text");
    expect(body).toContain("member.removed_at as ended_at");
  });

  it("exposes only safe role/state vocabulary and stable row identities", () => {
    const body = historyBody();
    expect(body).toContain("'hod:' || claim.edition_id::text || ':' || claim.country_id::text");
    expect(body).toContain("'juror:' || member.id::text");
    expect(body).toContain("'hod'::text as role");
    expect(body).toContain("'juror'::text as role");
    expect(body).toContain("'historical'::text");
    expect(body).toContain("'current'::text");
    expect(body).toContain("'superseded'::text");
    expect(body).not.toContain("capability");
    expect(body).not.toContain("assigned_by");
    expect(body).not.toContain("removed_by");
    expect(body).not.toContain("notes");
  });

  it("orders inside jsonb_agg so equal-time history is deterministic", () => {
    const body = historyBody();
    const aggregate = body.slice(body.indexOf("jsonb_agg("), body.indexOf("into v_items"));
    expect(aggregate).toContain("order by");
    expect(aggregate).toContain("row.edition_number desc nulls last");
    expect(aggregate).toContain("row.evidence_at desc nulls last");
    expect(aggregate).toContain("row.role");
    expect(aggregate).toContain("row.id");
  });

  it("registers as an additive semantic forward-fix-only S13 migration", () => {
    expect(migrationPath).not.toContain("20261019235700");
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("v3.public.p40-personal-participation-history");
    expect(migration).toContain("'forward_fix_only'");
  });
});
