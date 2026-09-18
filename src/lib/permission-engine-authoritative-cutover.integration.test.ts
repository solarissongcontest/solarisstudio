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

  it("removes exposed legacy helper RPCs", () => {
    expect(migration).toContain("drop function if exists public.integrity_is_organizer()");
    expect(migration).toContain("drop function if exists public.organizer_exists()");
    expect(migration).toContain("drop function if exists public.has_role(uuid, public.app_role)");
  });

  it("enables Permission Engine v2 globally", () => {
    expect(migration).toContain("where key = 'permission_engine_v2'");
    expect(migration).toContain("set enabled = true");
    expect(migration).toContain("admins_only = false");
    expect(migration).toContain("Permission Engine v2 is not globally authoritative");
  });
});
