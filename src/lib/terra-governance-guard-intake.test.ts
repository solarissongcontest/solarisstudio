import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  EMPTY_GUARD_APPLICATION,
  GUARD_APPLICATION_LIMITS,
  guardApplicationStatusLabel,
  guardIntakeErrorMessage,
  normalizeGuardApplication,
  parseGuardIntakeReceipt,
  parseGuardIntakeProjection,
  parseGuardWithdrawalReceipt,
  newGuardWithdrawalOperation,
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

  it("parses one bounded, country-scoped membership snapshot and fails closed", () => {
    const row = {
      id: "e23ee1bc-f7fb-4b56-bb0b-a763f5e453a0",
      status: "submitted",
      official_state_designation: "Republic of Testland",
      submitted_at: "2026-11-04T08:10:00+00:00",
      revision: 1,
    };
    const projection = {
      organizationId: "14e4ee7f-aeca-4461-b889-fdcd4dcdb11e",
      organizationName: "GUARD",
      activeMembership: null,
      applications: [row],
    };
    expect(parseGuardIntakeProjection(projection)).toEqual(projection);
    expect(() => parseGuardIntakeProjection(null)).toThrow();
    expect(() => parseGuardIntakeProjection({ ...projection, activeMembership: undefined })).toThrow();
    expect(() => parseGuardIntakeProjection({ ...projection, applications: Array(6).fill(row) })).toThrow();
    expect(() => parseGuardIntakeProjection({
      ...projection, applications: [{ ...row, status: "invalid-lifecycle" }],
    })).toThrow();
    expect(() => parseGuardIntakeProjection({
      ...projection, applications: [{ ...row, revision: 0 }],
    })).toThrow();
    expect(() => parseGuardIntakeProjection({
      ...projection, applications: [{ ...row, submitted_at: "not-a-time" }],
    })).toThrow();
  });

  it("accepts only a succeeded canonical receipt for the exact operation and scope", () => {
    const expected = {
      operationId: "13ce65ac-779c-4c92-8a2b-2f7d2caf1900",
      organizationId: "14e4ee7f-aeca-4461-b889-fdcd4dcdb11e",
      countryId: "15c02bfb-a63b-46f8-b524-fd913ba62f13",
    };
    const receipt = {
      status: "succeeded",
      operationId: expected.operationId,
      result: {
        ok: true,
        applicationId: "e23ee1bc-f7fb-4b56-bb0b-a763f5e453a0",
        organizationId: expected.organizationId,
        countryId: expected.countryId,
        status: "submitted",
      },
    };
    expect(parseGuardIntakeReceipt(receipt, expected)).toEqual({
      applicationId: receipt.result.applicationId,
      operationId: expected.operationId,
      status: "submitted",
    });
    expect(() => parseGuardIntakeReceipt({ ...receipt, status: "processing" }, expected)).toThrow();
    expect(() => parseGuardIntakeReceipt({ ...receipt, operationId: "other" }, expected)).toThrow();
    expect(() => parseGuardIntakeReceipt({
      ...receipt,
      result: { ...receipt.result, organizationId: "foreign-organization" },
    }, expected)).toThrow();
    expect(() => parseGuardIntakeReceipt({
      ...receipt,
      result: { ...receipt.result, countryId: "foreign-country" },
    }, expected)).toThrow();
    expect(() => parseGuardIntakeReceipt({
      ...receipt,
      result: { ...receipt.result, status: "approved" },
    }, expected)).toThrow();
    expect(() => parseGuardIntakeReceipt({ ...receipt, result: null }, expected)).toThrow();
  });

  it("keeps admission distinct from application status and redacts errors", () => {
    expect(guardApplicationStatusLabel("introduced")).toContain("General Assembly");
    expect(guardApplicationStatusLabel("approved")).toContain("activation not yet confirmed");
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
    expect(migration).toContain("create or replace function public.world_my_guard_membership_intake_v1");
    expect(migration).toContain("account_row.country_id = p_country_id");
    expect(migration).toContain("account_row.user_id = auth.uid()");
    expect(migration).toContain("application.submitted_at desc, application.id desc");
    expect(migration).toContain("limit 5");
    expect(migration).toContain("grant execute on function public.world_my_guard_membership_intake_v1(uuid)");
    const eventStart = migration.indexOf("perform private.v3_emit_domain_event(");
    const eventEnd = migration.indexOf("v_result := jsonb_build_object(", eventStart);
    expect(eventStart).toBeGreaterThanOrEqual(0);
    expect(eventEnd).toBeGreaterThan(eventStart);
    const eventBlock = migration.slice(eventStart, eventEnd);
    for (const privateField of ["v_motivation", "v_contributions", "v_commitment", "v_government"]) {
      expect(eventBlock).not.toContain(privateField);
    }
    expect(migration).toContain("private.studio2_claim_operation(");
    expect(migration).toContain("private.studio2_complete_operation(");
    expect(migration).toContain("public.studio2_reconcile_operation(");
    expect(migration).toContain("'world.membership.application.submitted'");
  });

  it("never grants browser write access or leaks applications across countries", () => {
    expect(migration).toContain("alter table public.world_membership_applications enable row level security");
    expect(migration).toContain("revoke all on public.world_membership_applications from public, anon, authenticated");
    expect(migration).toContain("revoke all on public.world_membership_applications from public, anon, authenticated, service_role");
    expect(migration).toContain("grant select on public.world_membership_applications to authenticated, service_role");
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
    expect(migration).toContain("submitted_by_person_id uuid references public.delegation_people(id) on delete restrict");
    expect(migration).toContain("submitted_by uuid references auth.users(id) on delete set null");
    expect(route).toContain("if (GLOBAL_MAINTENANCE_MODE) throw notFound()");
    expect(route).toContain("!confirmation && !submit.isPending");
    expect(route).toContain("const pendingApplication = intake.data?.applications.find");
    expect(route).toContain("role=\"alert\"");
    expect(route).toContain("aria-invalid");
    expect(route).not.toContain(".from(\"world_membership_applications\").insert");
  });
});


const withdrawalMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261104115100_v3_tg5_guard_application_withdrawal.sql"),
  "utf8",
);

describe("TG5A governed pre-GAG application withdrawal", () => {
  const expected = {
    operationId: "13ce65ac-779c-4c92-8a2b-2f7d2caf1900",
    organizationId: "14e4ee7f-aeca-4461-b889-fdcd4dcdb11e",
    countryId: "15c02bfb-a63b-46f8-b524-fd913ba62f13",
    applicationId: "e23ee1bc-f7fb-4b56-bb0b-a763f5e453a0",
    revision: 1,
  };
  const receipt = {
    status: "succeeded", operationId: expected.operationId,
    result: {
      ok: true, applicationId: expected.applicationId,
      organizationId: expected.organizationId,
      countryId: expected.countryId,
      status: "withdrawn", revision: 2,
    },
  };

  it("requires an exact, succeeded, versioned operation receipt", () => {
    expect(parseGuardWithdrawalReceipt(receipt, expected)).toEqual({
      applicationId: expected.applicationId,
      operationId: expected.operationId,
      revision: 2,
    });
    expect(() => parseGuardWithdrawalReceipt({ ...receipt, status: "processing" }, expected)).toThrow();
    expect(() => parseGuardWithdrawalReceipt({ ...receipt, operationId: "other" }, expected)).toThrow();
    expect(() => parseGuardWithdrawalReceipt({
      ...receipt, result: { ...receipt.result, countryId: "foreign" },
    }, expected)).toThrow();
    expect(() => parseGuardWithdrawalReceipt({
      ...receipt, result: { ...receipt.result, revision: 1 },
    }, expected)).toThrow();
    expect(() => parseGuardWithdrawalReceipt({
      ...receipt, result: { ...receipt.result, status: "approved" },
    }, expected)).toThrow();
  });

  it("uses a stable retry operation separate from a new user intent", () => {
    const a = newGuardWithdrawalOperation();
    const b = newGuardWithdrawalOperation();
    expect(a.operationId).not.toBe(b.operationId);
    expect(a.idempotencyKey).toContain(a.operationId);
  });

  it("enforces active country control, guarded lifecycle, concurrency, and scoped event", () => {
    expect(withdrawalMigration).toContain("account_row.user_id=v_actor");
    expect(withdrawalMigration).toContain("account_row.status='active'");
    expect(withdrawalMigration).toContain("'world.membership.apply',p_organization_id,p_country_id");
    expect(withdrawalMigration).toContain("for share");
    expect(withdrawalMigration).toContain("for update");
    expect(withdrawalMigration).toContain("v_application.revision <> p_expected_revision");
    expect(withdrawalMigration).toContain("v_application.status not in ('submitted','under_review')");
    expect(withdrawalMigration).toContain("message='APPLICATION_LOCKED'");
    expect(withdrawalMigration).toContain("message='VERSION_CONFLICT'");
    expect(withdrawalMigration).toContain("private.studio2_claim_operation(");
    expect(withdrawalMigration).toContain("private.studio2_complete_operation(");
    expect(withdrawalMigration).toContain("public.studio2_reconcile_operation(");
    expect(withdrawalMigration).toContain("'world.membership.application.withdrawn'");
  });

  it("never alters actual membership or grants a browser write", () => {
    expect(withdrawalMigration).toContain("set status='withdrawn', revision=revision+1");
    expect(withdrawalMigration).not.toMatch(/(?:insert into|update|delete from)\s+public\.world_organization_memberships/i);
    expect(withdrawalMigration).not.toMatch(/(?:insert into|update|delete from)\s+public\.world_organization_representations/i);
    expect(withdrawalMigration).toContain("from public, anon, authenticated, service_role");
    expect(withdrawalMigration).toContain("public.v3_register_migration_contract(");
  });

  it("gates confirmation and same-operation retry to an active pre-introduction application", () => {
    expect(route).toContain("Withdraw pending application");
    expect(route).toContain("Confirm withdrawal");
    expect(route).toContain("Retry same withdrawal");
    expect(route).toContain("withdrawRef.current");
    expect(route).toContain('["submitted", "under_review"].includes(pendingApplication.status)');
    expect(route).toContain("onWithdrawApplication(pendingApplication.id, pendingApplication.revision)");
    expect(route).not.toContain('.from("world_membership_applications").update');
  });
});
