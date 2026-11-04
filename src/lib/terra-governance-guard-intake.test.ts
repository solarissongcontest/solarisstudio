import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  EMPTY_GUARD_APPLICATION,
  GUARD_APPLICATION_LIMITS,
  guardApplicationStatusLabel,
  guardIntakeErrorMessage,
  normalizeGuardApplication,
  validateGuardApplication,
  type GuardApplicationFields,
} from "./terra-governance-guard-intake";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261104115000_v3_tg5_guard_membership_intake.sql"),
  "utf8",
);
const route = readFileSync(
  resolve(process.cwd(), "src/routes/world/membership/apply.tsx"),
  "utf8",
);

const valid: GuardApplicationFields = {
  officialDesignation: "  Republic of Testland  ",
  governmentSystem: "Representative republic",
  motivation: "We want to participate in coordinated international security.",
  contributions: "We can offer logistics and technical expertise to the union.",
  commitment: "We undertake to respect the international obligations of GUARD.",
};

describe("TG5A GUARD voluntary membership intake", () => {
  it("requires all five canonical submission fields and trims meaningful content", () => {
    expect(Object.keys(validateGuardApplication(EMPTY_GUARD_APPLICATION)).sort()).toEqual(
      Object.keys(GUARD_APPLICATION_LIMITS).sort(),
    );
    expect(validateGuardApplication(valid)).toEqual({});
    expect(normalizeGuardApplication(valid).officialDesignation).toBe("Republic of Testland");
    expect(validateGuardApplication({ ...valid, motivation: " ".repeat(35) }).motivation)
      .toContain("At least 20");
    expect(validateGuardApplication({ ...valid, contributions: "x".repeat(3001) }).contributions)
      .toContain("no more than 3000");
  });

  it("keeps admission distinct from application status and redacts errors", () => {
    expect(guardApplicationStatusLabel("introduced")).toContain("General Assembly");
    expect(guardApplicationStatusLabel("approved")).toBe("Approved");
    const diagnostic = "sensitive-sql-details-table-user-email";
    expect(guardIntakeErrorMessage({ message: diagnostic })).not.toContain(diagnostic);
    expect(guardIntakeErrorMessage({ code: "42501", message: "AUTHORIZATION" }))
      .toContain("country authority");
  });

  it("uses one generic canonical membership store without inventing admission", () => {
    expect(migration).toContain("create table public.world_membership_applications");
    expect(migration).toContain("references public.world_organizations(id)");
    expect(migration).toContain("references public.countries(id)");
    expect(migration).toContain("world_membership_applications_one_active_idx");
    expect(migration).toContain("'submitted','under_review','introduced','approved'");
    expect(migration).not.toMatch(/insert into public\.world_organization_memberships/i);
    expect(migration).not.toMatch(/update public\.world_organization_memberships/i);
    expect(migration).not.toMatch(/insert into public\.world_organization_representations/i);
    expect(migration).not.toMatch(/create table public\.guard_/i);
  });

  it("requires real country authority plus world-scoped capability and current state", () => {
    expect(migration).toContain("account_row.user_id = v_actor");
    expect(migration).toContain("account_row.status = 'active'");
    expect(migration).toContain("'world.membership.apply', p_organization_id, p_country_id");
    expect(migration).toContain("org.slug = 'guard'");
    expect(migration).toContain("membership.ended_at is null");
    expect(migration).toContain("APPLICATION_ALREADY_PENDING");
    expect(migration).toContain("ALREADY_MEMBER");
    expect(migration).toContain("private.studio2_claim_operation(");
    expect(migration).toContain("private.studio2_complete_operation(");
    expect(migration).toContain("public.studio2_reconcile_operation(");
    expect(migration).toContain("'world.membership.application.submitted'");
  });

  it("never grants browser write access or leaks applications across countries", () => {
    expect(migration).toContain("alter table public.world_membership_applications enable row level security");
    expect(migration).toContain("revoke all on public.world_membership_applications from public, anon, authenticated");
    expect(migration).toContain("grant select on public.world_membership_applications to authenticated");
    expect(migration).toContain("account_row.country_id = world_membership_applications.country_id");
    expect(migration).not.toMatch(/grant (insert|update|delete|all) on public\.world_membership_applications to (anon|authenticated)/);
    expect(migration).toContain("revoke all on function public.world_submit_guard_membership_application_v1(");
    expect(migration).toContain("to authenticated, service_role");
    expect(migration).toContain("public.v3_register_migration_contract");
  });

  it("loads country-scoped bounded application history and relies on canonical RPC for writes", () => {
    expect(route).toContain('useMyCountryAccount()');
    expect(route).toContain('enabled: Boolean(countryId && isActiveController)');
    expect(route).toContain('submitGuardApplication(input)');
    expect(route).toContain("requestRef.current = { fields: normalized, operation }");
    expect(route).toContain("Retry same operation");
    expect(route).toContain("Check server status");
    expect(route).toContain("role=\"alert\"");
    expect(route).toContain("aria-invalid");
    expect(route).not.toContain(".from(\"world_membership_applications\").insert");
  });
});
