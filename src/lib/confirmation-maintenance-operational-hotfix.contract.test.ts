import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const hotfix = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261017120000_confirmation_maintenance_operational_hotfix.sql",
  ),
  "utf8",
);

const requirements = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261002235000_organisation_os_v5_confirmation_requirements.sql",
  ),
  "utf8",
);

describe("Confirmation maintenance operational hotfix", () => {
  it("uses read capabilities for the Organizer country cockpit in read-only platform mode", () => {
    const cockpit = hotfix.indexOf("create or replace function public.studio2_country_cockpit");
    const portal = hotfix.indexOf("create or replace function public.public_country_account_confirmation_portal");
    const slice = hotfix.slice(cockpit, portal);

    expect(slice).toContain("studio2_access_allowed('confirmation.read'");
    expect(slice).toContain("studio2_access_allowed('delegation.read'");
    expect(slice).not.toContain("studio2_access_allowed('confirmation.manage'");
  });

  it("keeps HOD self-access while Organizer inspection uses read authority", () => {
    const start = hotfix.indexOf("create or replace function public.studio2_hod_context_legacy_roster");
    const end = hotfix.indexOf("create or replace function public.studio2_country_cockpit");
    const slice = hotfix.slice(start, end);

    expect(slice).toContain("public.studio2_access_allowed('confirmation.read'");
    expect(slice).toContain("public.studio2_access_allowed('delegation.read'");
    expect(slice).toContain("public.owns_country(v_actor, p_country_id)");
    expect(slice).not.toContain("studio2_access_allowed('confirmation.manage'");
  });

  it("does not weaken the global platform-mode capability policy", () => {
    expect(hotfix).not.toContain("create or replace function private.studio2_capability_allowed_in_platform_mode");
    expect(hotfix).not.toContain("create or replace function public.studio2_access_allowed");
  });

  it("treats a closed round and an editable existing response as compatible states", () => {
    const accessStart = hotfix.indexOf("create or replace function public.public_country_account_confirmation_access");
    const accessEnd = hotfix.indexOf("create or replace function public.public_country_account_confirmation_portal");
    const access = hotfix.slice(accessStart, accessEnd);

    const tokenStart = hotfix.indexOf("create or replace function public.public_create_country_account_edit_token");
    const tokenEnd = hotfix.indexOf("create or replace function public.public_resolve_edit_token");
    const token = hotfix.slice(tokenStart, tokenEnd);

    expect(access).toContain("coalesce(s.editing_allowed, false)");
    expect(access).toContain("coalesce(e.editing_enabled, false)");
    expect(access).not.toContain("and coalesce(r.editing_enabled, false)");
    expect(token).toContain("coalesce(submission_row.editing_allowed, false)");
    expect(token).toContain("coalesce(edition_row.editing_enabled, false)");
    expect(token).not.toContain("round_row.editing_enabled");
    expect(token).not.toContain("round_row.status");
  });

  it("revokes existing edit links when editing is closed or the response is locked", () => {
    const start = hotfix.indexOf("create or replace function public.admin_update_confirmation_controls");
    const end = hotfix.indexOf("create or replace function public.v3_submit_confirmation");
    const controls = hotfix.slice(start, end);

    expect(controls).toContain("for update");
    expect(controls).toContain("if not coalesce(_editing_allowed, false) or coalesce(_locked, false)");
    expect(controls).toContain("update public.edit_tokens");
    expect(controls).toContain("set active = false");
  });

  it("revalidates current response editability under a row lock before an edit-token submit", () => {
    const start = hotfix.indexOf("create or replace function public.v3_submit_confirmation");
    const submit = hotfix.slice(start);
    const lock = submit.indexOf("where submission.id = v_edit_token.submission_id\n      for update");
    const editingCheck = submit.indexOf("not coalesce(v_edit_submission.editing_allowed, false)");
    const legacyWrite = submit.indexOf("public.submit_confirmation(payload)");

    expect(lock).toBeGreaterThan(-1);
    expect(editingCheck).toBeGreaterThan(lock);
    expect(legacyWrite).toBeGreaterThan(editingCheck);
    expect(submit).toContain("not coalesce(v_edit_edition.editing_enabled, false)");
  });

  it("exposes only a country-account scoped participant portal projection", () => {
    const start = hotfix.indexOf("create or replace function public.public_country_account_confirmation_portal");
    const end = hotfix.indexOf("create or replace function public.public_create_country_account_edit_token");
    const portal = hotfix.slice(start, end);

    expect(portal).toContain("public.public_country_account_confirmation_access()");
    expect(portal).toContain("requirement.country_id = v_country_id");
    expect(portal).toContain("response.value ->> 'edition_id' = v_edition.id::text");
    expect(portal).not.toContain("admin_notes");
    expect(portal).not.toContain("integrity");
    expect(portal).not.toContain("vote");
  });
});

describe("Confirmation requirement / round separation regression", () => {
  it("keeps requirements independent from round creation and opening", () => {
    expect(requirements).toContain(
      "Opening, closing or\n-- creating a round MUST NOT create a new requirement or a new generation.",
    );
    expect(requirements).toContain("studio2_confirmation_requirements_current_idx");
    expect(requirements).toContain("studio2_confirmation_duplicate_submission_guard");
    expect(requirements).toContain("already completed confirmation requirement generation");
  });
});
