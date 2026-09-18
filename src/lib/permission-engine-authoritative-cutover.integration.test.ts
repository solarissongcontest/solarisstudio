import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = readdirSync(resolve(process.cwd(), "supabase/migrations")).find((name) =>
  name.endsWith("_permission_engine_v2_authoritative_cutover.sql"),
);
if (!migrationName) throw new Error("Permission Engine authoritative cutover migration missing");

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations", migrationName), "utf8");

describe("Permission Engine v2 authoritative cutover", () => {
  it("preserves every live legacy Organizer as a v2 Organizer before cutover", () => {
    expect(migration).toContain("join auth.users au on au.id = ur.user_id");
    expect(migration).toContain("'organizer', null, null, null");
    expect(migration).toContain("Live legacy Organizers missing v2 assignment");
  });

  it("makes legacy user_roles read-only rollback data", () => {
    expect(migration).toContain('drop policy if exists "bootstrap first organizer"');
    expect(migration).toContain('drop policy if exists "capability managers grant legacy roles"');
    expect(migration).toContain("delete from public.user_roles ur");
  });

  it("removes legacy-role fallbacks from capability resolution", () => {
    expect(migration).toContain("create or replace function private.studio2_user_has_capability");
    expect(migration).not.toContain("not private.studio2_permission_engine_authoritative()");
    expect(migration).toContain("create or replace function public.studio2_access_allowed");
    expect(migration).toContain("return private.studio2_user_has_capability");
  });

  it("keeps route telemetry while making it authoritative", () => {
    expect(migration).toContain("create or replace function public.studio2_check_capability_shadow");
    expect(migration).toContain("'mode', 'authoritative'");
    expect(migration).toContain("v_capability_allowed, v_capability_allowed");
  });

  it("migrates clean-replay-only result and publication RPCs to narrow capabilities", () => {
    expect(migration).toContain("public.publish_show_results(uuid,jsonb)");
    expect(migration).toContain("results.publish");
    expect(migration).toContain("public.refresh_show_results(uuid)");
    expect(migration).toContain("results.verify");
    expect(migration).toContain("public.sync_one_edition_publication(uuid)");
    expect(migration).toContain("publishing.manage");
    expect(migration).toContain("Could not migrate publish_show_results legacy Organizer guard");
    expect(migration).toContain("Could not migrate refresh_show_results legacy Organizer guard");
    expect(migration).toContain("Could not migrate sync_one_edition_publication legacy Organizer guard");
  });

  it("keeps Integrity compatibility capability-only and removes obsolete role helpers", () => {
    expect(migration).toContain("create or replace function public.integrity_is_organizer()");
    expect(migration).toContain("studio2_access_allowed('integrity.manage', null, false)");
    expect(migration).toContain("drop function if exists public.organizer_exists()");
    expect(migration).toContain("drop function if exists public.has_role(uuid, public.app_role)");
  });

  it("makes Integrity reviewer eligibility and access simulation v2-only", () => {
    expect(migration).toContain("Reviewer must have integrity management capability");
    expect(migration).toContain("Appeal reviewer must have integrity sanction capability");
    expect(migration).toContain("where private.studio2_user_has_capability(u.id, 'integrity.manage', null)");
    expect(migration).toContain("create or replace function public.studio2_view_access_as");
    expect(migration).toContain("from public.studio2_role_assignments a");
    expect(migration).toContain("Legacy user_roles function dependency remains");
  });

  it("enables Permission Engine v2 globally", () => {
    expect(migration).toContain("where key = 'permission_engine_v2'");
    expect(migration).toContain("set enabled = true");
    expect(migration).toContain("admins_only = false");
    expect(migration).toContain("Permission Engine v2 is not globally authoritative");
  });
});
