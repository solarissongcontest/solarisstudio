import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const maintenanceMigration = readFileSync(
  new URL("../../supabase/migrations/20261017143000_confirmation_maintenance_hotfix.sql", import.meta.url),
  "utf8",
);

const dashboardMigration = readFileSync(
  new URL(
    "../../supabase/migrations/20261017143100_confirmation_maintenance_hod_projection.sql",
    import.meta.url,
  ),
  "utf8",
);

const inspectionMigration = readFileSync(
  new URL(
    "../../supabase/migrations/20261017143200_confirmation_maintenance_read_authority.sql",
    import.meta.url,
  ),
  "utf8",
);

const roundMigration = readFileSync(
  new URL("../../supabase/migrations/20261003018000_organisation_os_v5_confirmation_round_operations.sql", import.meta.url),
  "utf8",
);

function compact(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ");
}

describe("Confirmation maintenance authority hotfix", () => {
  const migration = compact(maintenanceMigration);
  const dashboard = compact(dashboardMigration);
  const inspection = compact(inspectionMigration);

  it("permits Confirmation management only in read-only mode, not full maintenance", () => {
    const readOnlyStart = migration.indexOf("when 'read_only' then");
    const maintenanceStart = migration.indexOf("when 'maintenance' then");
    const fallbackStart = migration.indexOf("else false", maintenanceStart);

    expect(readOnlyStart).toBeGreaterThanOrEqual(0);
    expect(maintenanceStart).toBeGreaterThan(readOnlyStart);
    expect(fallbackStart).toBeGreaterThan(maintenanceStart);

    expect(migration.slice(readOnlyStart, maintenanceStart)).toContain("'confirmation.manage'");
    expect(migration.slice(maintenanceStart, fallbackStart)).not.toContain("'confirmation.manage'");
  });

  it("scopes response editing authority to the response edition", () => {
    expect(migration).toContain(
      "studio2_access_allowed('confirmation.manage', v_before.edition_id, false)",
    );
    expect(migration).not.toContain("missing solaris capability: delegation.manage");
  });

  it("keeps read authority distinct from the emergency manage exception", () => {
    expect(inspection).toContain("studio2_access_allowed('confirmation.read', null, true)");
    expect(inspection).toContain(
      "studio2_access_allowed('confirmation.read', p_edition_id, false)",
    );
    expect(inspection).toContain("solaris_confirmation_response_read_allowed");
    expect(inspection).toContain(
      "studio2_access_allowed('confirmation.read', submission.edition_id, false)",
    );
    expect(inspection).toContain(
      "never use this predicate for consequential mutations",
    );
  });

  it("cuts the HOD and cockpit inspection chain over to confirmation.read", () => {
    expect(inspection).toContain("public.studio2_country_cockpit(uuid)");
    expect(inspection).toContain("public.studio2_hod_editions(uuid)");
    expect(inspection).toContain("public.studio2_hod_context_legacy_roster(uuid,uuid)");
    expect(inspection).toContain("'''confirmation.manage'''");
    expect(inspection).toContain("'''confirmation.read'''");
    expect(inspection).toContain(
      "failed to remove confirmation.manage read predicate",
    );
  });

  it("moves legacy Organizer inspection RPCs to read predicates without rewriting mutation authority", () => {
    expect(inspection).toContain("public.admin_confirmation_editions()");
    expect(inspection).toContain("public.admin_confirmation_responses()");
    expect(inspection).toContain("public.admin_confirmation_response(uuid)");
    expect(inspection).toContain("public.admin_confirmation_requirements(uuid)");
    expect(inspection).toContain(
      "private.solaris_confirmation_admin_read_allowed(null, true)",
    );
    expect(inspection).toContain(
      "private.solaris_confirmation_response_read_allowed(_submission_id)",
    );
    expect(inspection).toContain(
      "private.solaris_confirmation_admin_read_allowed(p_edition_id, false)",
    );
    expect(inspection).not.toContain("create or replace function public.admin_update_confirmation_controls");
  });

  it("keeps round submission state and Confirmation obligation independent from response editability", () => {
    expect(migration).toContain("'confirmationrequirementchanged', false");
    expect(migration).toContain("'roundstatuschanged', false");
    expect(migration).not.toContain("update public.studio2_confirmation_requirements");
    expect(migration).not.toContain("insert into public.studio2_confirmation_requirements");
  });

  it("rejects misleading open-editing states when a parent editing gate is closed", () => {
    expect(migration).toContain("existing-response editing is disabled for this confirmation round");
    expect(migration).toContain("confirmation editing is disabled for this edition");
    expect(migration).toContain("a locked confirmation response cannot be opened for editing");
  });

  it("revokes active edit tokens whenever response, round, or edition editing closes", () => {
    expect(migration).toContain("revoke_confirmation_tokens_on_submission_close");
    expect(migration).toContain("revoke_confirmation_tokens_on_round_close");
    expect(migration).toContain("revoke_confirmation_tokens_on_edition_close");
    expect(migration.match(/set active = false/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });

  it("preserves the canonical no-implicit-requirement round invariant", () => {
    const round = compact(roundMigration);
    expect(round).toContain("'requirementscreated', 0");
    expect(round).not.toContain("insert into public.studio2_confirmation_requirements");
  });

  it("adds one authenticated participant-safe dashboard projection", () => {
    expect(dashboard).toContain("public_country_account_confirmation_dashboard()");
    expect(dashboard).toContain("where account.user_id = v_user and account.status = 'active'");
    expect(dashboard).toContain(
      "revoke all on function public.public_country_account_confirmation_dashboard() from public, anon",
    );
    expect(dashboard).toContain(
      "grant execute on function public.public_country_account_confirmation_dashboard() to authenticated, service_role",
    );
  });

  it("keeps participant review output intentionally safe and delegation-scoped", () => {
    expect(dashboard).toContain("'review_reason', entry.review_reason");
    expect(dashboard).toContain("'review_reason', candidate.review_reason");
    expect(dashboard).not.toContain("admin_notes");
    expect(dashboard).not.toMatch(/\bfrom public\.[a-z0-9_]*integrity[a-z0-9_]*/);
    expect(dashboard).not.toContain("'integrity'");
    expect(dashboard).not.toContain("submission_review_history");
    expect(dashboard).not.toContain("jury");
    expect(dashboard).not.toContain("televote");
  });

  it("derives participant status domains separately", () => {
    expect(dashboard).toContain("'participation_state', v_participation_state");
    expect(dashboard).toContain("'confirmation_state', v_confirmation_state");
    expect(dashboard).toContain("'entry_state', v_entry_state");
    expect(dashboard).toContain("'editing_open', v_editing_open");
    expect(dashboard).toContain("when v_requirement.status = 'required' then 'action_required'");
    expect(dashboard).toContain("when v_requirement.status = 'satisfied' then 'accepted'");
  });
});
