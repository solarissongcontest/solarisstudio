import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261019235947_v3_personal_participation_history.sql",
  ),
  "utf8",
);

function projectionSql() {
  const start = migration.indexOf(
    "create or replace function public.v3_my_participation_history()",
  );
  const end = migration.indexOf(
    "comment on function public.v3_my_participation_history()",
    start,
  );
  return migration.slice(start, end);
}

describe("System V3 P40 personal participation history", () => {
  it("is classified by the S13 migration framework", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("'20261019235947_v3_personal_participation_history'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).toContain("false");
  });

  it("keeps mutable HOD operational rows from rewriting future history", () => {
    expect(migration).toContain("private.v3_hod_attribution_events");
    expect(migration).toContain("'attributed', 'ended', 'superseded'");
    expect(migration).toContain("after insert or update of person_id, edition_id, country_id, channel or delete");
    expect(migration).toContain("after insert or update of status or delete");
    expect(migration).toContain("V3 HOD attribution history is append-only");
    expect(migration).toContain("before update or delete on private.v3_hod_attribution_events");
  });

  it("backfills only surviving canonical HOD attribution and does not invent overwritten holders", () => {
    expect(migration).toContain("from public.delegation_hod_assignments assignment");
    expect(migration).toContain("assignment.channel = 'delegation'");
    expect(migration).toContain("claim.status = 'mine'");
    expect(migration).toContain("'assignment_backfill'");
    expect(migration).toContain("'claim_backfill'");
    expect(migration).not.toContain("audit_log");
    expect(migration).not.toContain("studio2_audit");
  });

  it("binds the projection exclusively to auth.uid without caller-selected scope", () => {
    const projection = projectionSql();

    expect(projection).toContain("v_user uuid := auth.uid()");
    expect(projection).toContain("event.user_id = v_user");
    expect(projection).toContain("ballot.user_id = v_user");
    expect(projection).toContain("event.actor_id = v_user");
    expect(projection).not.toContain("p_user_id");
    expect(projection).not.toContain("p_country_id");
    expect(projection).not.toContain("p_edition_id");
    expect(projection).toContain("message = 'AUTHENTICATION'");
  });

  it("limits public role vocabulary and preserves reconciliation states", () => {
    const projection = projectionSql();

    expect(projection).toContain("'hod'::text as role");
    expect(projection).toContain("'juror'::text as role");
    expect(projection).toContain("'participant'::text as role");
    expect(projection).toContain("then 'superseded'");
    expect(projection).toContain("then 'historical'");
    expect(projection).toContain("then 'unavailable'");
    expect(projection).toContain("else 'current'");
    expect(projection).not.toContain("organizer'::text as role");
    expect(projection).not.toContain("superadmin'::text as role");
  });

  it("uses edition-scoped historical country presentation", () => {
    const projection = projectionSql();

    expect(projection).toContain("public.country_edition_identities identity");
    expect(projection).toContain("coalesce(identity.display_name, country.name)");
    expect(projection).toContain("country.short_code");
  });

  it("derives juror history from submission identity without exposing Jury votes", () => {
    const projection = projectionSql();

    expect(projection).toContain("from public.jury_ballot_submissions ballot");
    expect(projection).toContain("ballot.voter_country_id as country_id");
    expect(projection).not.toContain("jury_votes");
    expect(projection).not.toContain("ranked_points");
  });

  it("derives participant history from actor-linked Confirmation facts", () => {
    const projection = projectionSql();

    expect(projection).toContain("from private.v3_domain_events event");
    expect(projection).toContain("event.event_type = 'confirmation.submitted'");
    expect(projection).toContain("event.aggregate_type = 'confirmation_submission'");
    expect(projection).toContain("join public.submissions submission");
    expect(projection).toContain("bool_or(submission.participating)");
    expect(projection).not.toContain("event.payload");
  });

  it("returns exactly the shape expected by the fail-closed Public History consumer", () => {
    const projection = projectionSql();

    for (const key of [
      "'viewer_id'",
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
      "'generated_at'",
    ]) {
      expect(projection).toContain(key);
    }
    expect(migration).toContain(
      "grant execute on function public.v3_my_participation_history()\n  to authenticated",
    );
    expect(migration).toContain(
      "revoke all on function public.v3_my_participation_history()\n  from public, anon",
    );
    expect(migration).not.toContain("grant select on private.v3_hod_attribution_events");
    expect(migration).not.toContain("grant select on private.v3_domain_events");
  });
});
