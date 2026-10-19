import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261020004500_v3_personal_participation_history.sql",
  ),
  "utf8",
);

describe("V3 P40 personal participation history System contract", () => {
  it("is an additive forward-fix projection with no caller-selected identity", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("20261020004500_v3_personal_participation_history");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).toContain("create or replace function public.v3_my_participation_history()\nreturns jsonb");
    expect(migration).toContain("v_user uuid := auth.uid()");
    expect(migration).toContain("if v_user is null then");
    expect(migration).toContain("using errcode = '42501'");
    expect(migration).not.toMatch(/v3_my_participation_history\s*\([^)]*(user|country|edition)/i);
  });

  it("derives HOD truth from canonical per-edition assignments", () => {
    expect(migration).toContain("from public.delegation_hod_assignments assignment");
    expect(migration).toContain("join public.delegation_people person");
    expect(migration).toContain("person.identity_key = 'account:' || v_user::text");
    expect(migration).toContain("assignment.channel = 'delegation'");
    expect(migration).toContain("'delegation_membership'::text as source");
    expect(migration).toContain("'hod'::text as role");
  });

  it("keeps legacy HOD self-attribution subordinate to canonical assignment truth", () => {
    expect(migration).toContain("from public.country_hod_edition_claims claim");
    expect(migration).toContain("claim.user_id = v_user");
    expect(migration).toContain("claim.status = 'mine'");
    expect(migration).toContain("when canonical_assignment.id is not null then 'superseded'");
    expect(migration).toContain("else 'unavailable'");
    expect(migration).toContain("not exists (");
    expect(migration).toContain("own_person.identity_key = 'account:' || v_user::text");
    expect(migration).not.toContain("'legacy_hod_claim'::text as source,\n      case\n        when canonical_assignment.id is not null then 'historical'");
  });

  it("uses explicit recipient-owned Jury membership and submission evidence without ballot contents", () => {
    expect(migration).toContain("from public.studio2_jury_members member");
    expect(migration).toContain("member.member_user_id = v_user");
    expect(migration).toContain("'jury_membership'::text as source");
    expect(migration).toContain("from public.jury_ballot_submissions submission");
    expect(migration).toContain("submission.user_id = v_user");
    expect(migration).toContain("'jury_submission'::text as source");
    expect(migration).toContain("'juror'::text as role");

    for (const forbidden of [
      "submission.risk_score",
      "submission.review_reason",
      "submission.preflight_id",
      "submission.voter_id",
      "member.display_name",
      "member.assigned_by",
      "member.removed_by",
    ]) {
      expect(migration).not.toContain(forbidden);
    }
  });

  it("uses edition-scoped historical country presentation without changing canonical identity", () => {
    expect(migration).toContain("left join public.country_edition_identities history_identity");
    expect(migration).toContain("history_identity.country_id = assignment.country_id");
    expect(migration).toContain("history_identity.edition_id = assignment.edition_id");
    expect(migration).toContain("coalesce(nullif(btrim(history_identity.display_name), ''), country.name)");
    expect(migration).toContain("country.short_code as country_code");
  });

  it("normalizes current versus historical state deterministically despite legacy active editions", () => {
    expect(migration).toContain("with current_edition as materialized (");
    expect(migration).toContain("not in ('completed', 'archived', 'cancelled')");
    expect(migration).toContain("edition.edition_number desc nulls last");
    expect(migration).toContain("assignment.edition_id = (select id from current_edition)");
    expect(migration).toContain("member.edition_id = (select id from current_edition)");
    expect(migration).toContain("submission.edition_id = (select id from current_edition)");
  });

  it("returns only safe role/state vocabulary and bounded stable rows", () => {
    expect(migration).toContain("limit 500");
    expect(migration).toContain("'ph_' || md5(");
    expect(migration).toContain("'schema_version', 1");
    expect(migration).toContain("'viewer_id', v_user");
    expect(migration).toContain("'generated_at', now()");
    expect(migration).not.toContain("studio2_role_assignments");
    expect(migration).not.toContain("role_key");
    expect(migration).not.toContain("permission_evaluation_events");
    expect(migration).not.toContain("studio2_capability_grants");
  });

  it("keeps the SECURITY DEFINER RPC closed to anonymous/public callers", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain(
      "revoke all on function public.v3_my_participation_history() from public, anon, authenticated;",
    );
    expect(migration).toContain(
      "grant execute on function public.v3_my_participation_history() to authenticated;",
    );
    expect(migration).toContain("set search_path = pg_catalog, public");
  });
});
