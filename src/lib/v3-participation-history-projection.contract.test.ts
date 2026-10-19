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

  it("derives HOD history from durable edition-scoped identity evidence", () => {
    expect(migration).toContain("from public.delegation_hod_assignments assignment");
    expect(migration).toContain("person.identity_key = 'account:' || v_actor::text");
    expect(migration).toContain("assignment.channel = 'delegation'");
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

  it("treats only terminal edition lifecycle states as historical", () => {
    expect(migration).toContain("edition.status in ('completed', 'archived', 'cancelled')");
    expect(migration).toContain("then 'historical'");
    expect(migration).toContain("else 'current'");
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
