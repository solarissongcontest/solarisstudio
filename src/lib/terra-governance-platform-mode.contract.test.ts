import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readMigration = (path: string) => readFileSync(
  resolve(process.cwd(), "supabase/migrations", path), "utf8",
);

const migration = readMigration("20261107003000_v3_tg2_platform_mode_authorization.sql");
const platformPolicy = readMigration("20261003212000_organisation_os_v5_platform_permission_enforcement.sql");
const access = migration.split(
  "create or replace function public.world_access_allowed(",
)[1]?.split("$allowed$;")[0];

describe("WORLD-01 TG2 operational mode authority for all institution grants", () => {
  it("enforces the existing canonical mode policy BEFORE any world grant branch", () => {
    expect(access).toBeDefined();
    expect(access).toContain("from public.studio2_capabilities capability");
    expect(access).toContain("join public.studio2_platform_operational_state platform_state");
    expect(access).toContain("platform_state.singleton = true");
    expect(access).toContain("platform_state.mode is not null");
    expect(access).toContain("private.studio2_capability_allowed_in_platform_mode(");
    expect(access!.indexOf("private.studio2_capability_allowed_in_platform_mode("))
      .toBeLessThan(access!.indexOf("from public.studio2_capability_grants grant_row"));
  });

  it("retains exact world scopes, office effective starts and current country authority", () => {
    expect(access).toContain("public.studio2_access_allowed('system.manage', null, false)");
    expect(access).toContain("from public.studio2_capability_grants grant_row");
    expect(access).toContain("join public.world_capability_grant_scopes scope_row");
    expect(access).toContain("scope_row.organization_id = p_organization_id");
    expect(access).toContain("scope_row.country_id is not distinct from p_country_id");
    expect(access).toContain("scope_row.organ_id is not distinct from p_organ_id");
    expect(access).toContain("scope_row.object_id is not distinct from p_object_id");
    expect(access).toContain("term_row.started_at <= now()");
    expect(access).toContain("term_row.actual_end_at is null");
    expect(access).toContain("account_row.status = 'active'");
    expect(access).not.toMatch(/(?:insert into|update|delete from)\s+public\.country_accounts/i);
  });

  it("reuses V3's established allowed-mode matrix, not a World-invented policy", () => {
    expect(platformPolicy).toContain("when 'normal' then true");
    expect(platformPolicy).toContain("when 'degraded' then true");
    expect(platformPolicy).toContain("when 'read_only' then");
    expect(platformPolicy).toContain("when 'maintenance' then");
    expect(platformPolicy).toContain("p_access_level = 'read'");
    expect(migration).toContain("'v3.tg2.world-platform-mode-authorization'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).not.toContain("create table public.studio2_platform_operational_state");
  });

  it("preserves security definer and grants no new public or anonymous authority", () => {
    expect(access).toContain("security definer");
    expect(access).toContain("set search_path = pg_catalog");
    expect(migration).toContain("revoke all on function public.world_access_allowed(");
    expect(migration).toContain("from public, anon, authenticated;");
    expect(migration).toContain("to authenticated, service_role;");
    expect(migration).not.toMatch(/grant\s+execute[^;]*to\s+anon/i);
  });
});
