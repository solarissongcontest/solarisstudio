import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261020001500_v3_my_participation_history.sql"),
  "utf8",
);

describe("V3 personal participation history projection", () => {
  it("scopes the projection to the authenticated viewer", () => {
    expect(migration).toContain("v_actor uuid := auth.uid()");
    expect(migration).toContain("raise exception 'Authentication required'");
    expect(migration).toContain("'viewer_id', v_actor");
    expect(migration).toContain(
      "revoke all on function public.v3_my_participation_history()\n  from public, anon, authenticated, service_role;",
    );
    expect(migration).toContain(
      "grant execute on function public.v3_my_participation_history()\n  to authenticated;",
    );
  });

  it("preserves HOD handovers instead of trusting the one-row current assignment as history", () => {
    expect(migration).toContain("create table if not exists private.v3_delegation_hod_assignment_history");
    expect(migration).toContain("v3_hod_assignment_history_one_open_revision");
    expect(migration).toContain("create trigger v3_capture_delegation_hod_assignment_history");
    expect(migration).toContain("after insert or update or delete on public.delegation_hod_assignments");
    expect(migration).toContain("set valid_to = v_now");
    expect(migration).toContain("case when history.valid_to is not null then 'superseded'::text");
    expect(migration).toContain("'hod-history:' || history.id::text");
  });

  it("does not create a fictional handover for source/confidence metadata edits", () => {
    expect(migration).toContain("new.person_id");
    expect(migration).toContain("old.person_id");
    expect(migration).toContain("new.channel");
    expect(migration).toContain("old.channel");
    expect(migration).toContain("elsif new.source is distinct from old.source");
    expect(migration).toContain("source = new.source");
    expect(migration).toContain("confidence = new.confidence");
  });

  it("recovers older self-attribution evidence from durable country HOD claims", () => {
    expect(migration).toContain("from public.country_hod_edition_claims claim");
    expect(migration).toContain("claim.user_id = v_actor");
    expect(migration).toContain("claim.status = 'mine'");
    expect(migration).toContain("'country_hod_edition_claim'::text as source");
    expect(migration).toContain("then 'superseded'::text");
  });

  it("derives HOD history from durable account-linked edition evidence", () => {
    expect(migration).toContain("person.identity_key = 'account:' || v_actor::text");
    expect(migration).toContain("history.channel = 'delegation'");
    expect(migration).toContain("'hod'::text as role");
    expect(migration).not.toContain("from public.country_accounts");
  });

  it("derives juror history from immutable ballot evidence or canonical HOD jury selection", () => {
    expect(migration).toContain("from public.jury_ballot_submissions ballot");
    expect(migration).toContain("ballot.user_id = v_actor");
    expect(migration).toContain("assignment.channel in ('jury', 'delegation')");
    expect(migration).toContain("case when assignment.channel = 'jury' then 0 else 1 end");
    expect(migration).toContain("'juror'::text as role");
    expect(migration).toContain("where not exists (");
  });

  it("uses edition-scoped historical country presentation without changing canonical identity", () => {
    expect(migration).toContain("left join public.country_edition_identities identity");
    expect(migration).toContain("contest_entity.entity_type = 'global'");
    expect(migration).toContain("coalesce(identity.display_name, entity.display_name, country.name)");
    expect(migration).toContain("coalesce(entity.abbreviation, country.short_code)");
  });

  it("does not fabricate generic participant membership from current ownership", () => {
    expect(migration).not.toContain("'participant'::text as role");
    expect(migration).not.toContain("from public.country_accounts");
    expect(migration).not.toContain("account.country_id");
  });

  it("treats only terminal edition lifecycle states as historical when the relationship is not superseded", () => {
    expect(migration).toContain("coalesce(\n        evidence.relation_state,");
    expect(migration).toContain("edition.status in ('completed', 'archived', 'cancelled')");
    expect(migration).toContain("then 'historical'");
    expect(migration).toContain("else 'current'");
  });

  it("keeps the private revision ledger inaccessible to browser roles", () => {
    expect(migration).toContain(
      "revoke all on private.v3_delegation_hod_assignment_history\n  from public, anon, authenticated, service_role;",
    );
    expect(migration).toContain(
      "revoke all on function private.v3_capture_delegation_hod_assignment_history()\n  from public, anon, authenticated, service_role;",
    );
  });

  it("returns the contract consumed by Public V3 History", () => {
    for (const field of [
      "'id'",
      "'edition_id'",
      "'edition_number'",
      "'edition_name'",
      "'country_id'",
      "'country_code'",
      "'country_name'",
      "'role'",
      "'started_at'",
      "'ended_at'",
      "'source'",
      "'state'",
      "'items'",
      "'generated_at'",
    ]) {
      expect(migration).toContain(field);
    }
  });
});
