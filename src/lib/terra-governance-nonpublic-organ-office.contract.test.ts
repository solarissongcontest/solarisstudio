import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = source("supabase/migrations/20261104120800_v3_tg2_nonpublic_organ_office_privacy.sql");
const core = source("supabase/migrations/20261102171500_v3_tg2_world_institution_core.sql");
const rehearsal = source(".github/scripts/v3-tg2-identity-linkage-privacy-rehearsal.sql");

describe("TG2 private organ / public office boundary", () => {
  it("keeps private organ visibility explicit instead of equating it with public institution visibility", () => {
    expect(core).toContain("visibility text not null default 'public'");
    expect(core).toContain("constraint world_organization_organs_visibility_check");
    expect(migration).toContain("drop policy if exists world_offices_public_read");
    const publicPolicy = migration.slice(
      migration.indexOf("create policy world_offices_public_read"),
      migration.indexOf("drop policy if exists world_offices_private_scoped_read"),
    );
    expect(publicPolicy).toContain("for select to anon, authenticated");
    expect(publicPolicy).toContain("organization_row.public_visibility = 'public'");
    expect(publicPolicy).toContain("visible_organ.visibility = 'public'");
    expect(publicPolicy).toContain("visible_organ.organization_id = world_organization_offices.organization_id");
  });

  it("preserves exact private-office manager authority without exposing it to anonymous readers", () => {
    const privatePolicy = migration.slice(
      migration.indexOf("create policy world_offices_private_scoped_read"),
      migration.indexOf("create or replace function public.world_organization_projection_v1"),
    );
    expect(privatePolicy).toContain("for select to authenticated");
    expect(privatePolicy).toContain("'world.organization.view_private'");
    expect(privatePolicy).toContain("office_term.represented_country_id");
    expect(privatePolicy).toContain("office_term.office_id = world_organization_offices.id");
    expect(privatePolicy).toContain("world_organization_offices.id");
    expect(privatePolicy).toContain("'office'");
    expect(privatePolicy).toContain("id");
    expect(migration).not.toMatch(/grant\s+(insert|update|delete|all)[\s\S]{0,160}\sto\s+(anon|authenticated)/i);
  });

  it("applies public organ visibility inside the definer projection as well as in RLS", () => {
    const publicProjection = migration.slice(
      migration.indexOf("create or replace function public.world_organization_projection_v1"),
      migration.indexOf("revoke all on function public.world_organization_projection_v1"),
    );
    expect(publicProjection).toContain("security definer");
    expect(publicProjection).toContain("visible_organ.visibility = 'public'");
    expect(publicProjection).toContain("visible_organ.organization_id = office_row.organization_id");
    expect(publicProjection).not.toMatch(/\bholder_user_id\b/);
    expect(publicProjection).not.toMatch(/\bproxy_user_id\b/);
    expect(migration).toContain("'forward_fix_only'");
  });

  it("has rollback-only true-role tests for anonymous, outsider, manager and public RPC", () => {
    expect(rehearsal).toContain("set local role anon");
    expect(rehearsal).toContain("set local role authenticated");
    for (const failure of [
      "TG2_NONPUBLIC_ORGAN_OFFICE_ANON_LEAK",
      "TG2_NONPUBLIC_ORGAN_OFFICE_UNSCOPED_AUTH_LEAK",
      "TG2_NONPUBLIC_ORGAN_OFFICE_SCOPED_MANAGER_READ_LOST",
      "TG2_NONPUBLIC_ORGAN_OFFICE_SCOPED_MANAGER_PUBLIC_RPC_BYPASS",
    ]) {
      expect(rehearsal).toContain(failure);
    }
    expect(rehearsal).toContain("rollback;");
  });
});
