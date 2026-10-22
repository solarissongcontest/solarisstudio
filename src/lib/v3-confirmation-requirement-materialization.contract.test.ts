import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

const migration = source(
  "supabase/migrations/20261020000500_v3_o4_confirmation_requirement_materialization.sql",
);
const requirementFoundation = source(
  "supabase/migrations/20261002235000_organisation_os_v5_confirmation_requirements.sql",
);

describe("V3 O4 Confirmation requirement materialization authority", () => {
  it("registers the migration through the strict S13 contract", () => {
    expect(migration).toContain("v3_register_migration_contract");
    expect(migration).toContain(
      "'v3.o4.confirmation-requirement-materialization'",
    );
    expect(migration).toContain("'forward_fix_only'");
  });

  it("previews the exact affected delegation set with a deterministic state fingerprint", () => {
    expect(migration).toContain(
      "admin_confirmation_requirement_materialization_preview",
    );
    expect(migration).toContain("'targetMode'");
    expect(migration).toContain("'requestedCountryIds'");
    expect(migration).toContain("'targetCount'");
    expect(migration).toContain("'createCount'");
    expect(migration).toContain("'targets'");
    expect(migration).toContain("'createTargets'");
    expect(migration).toContain("'currentRequirementId'");
    expect(migration).toContain("'currentGeneration'");
    expect(migration).toContain("'currentStatus'");
    expect(migration).toContain("'willCreate'");
    expect(migration).toContain("extensions.digest");
    expect(migration).toContain("'impactFingerprint'");
  });

  it("keeps requirement creation edition-scoped, bounded and serialized", () => {
    expect(migration).toContain(
      "studio2_access_allowed('delegation.manage', p_edition_id, true)",
    );
    expect(migration).toContain(
      "Confirmation requirement batch exceeds the canonical country universe",
    );
    expect(migration).toContain(
      "studio2-confirmation-requirements:' || p_edition_id::text",
    );
    expect(requirementFoundation).toContain(
      "studio2_confirmation_requirements_current_idx",
    );
    expect(migration).toContain("requirement.superseded_at is null");
  });

  it("binds apply to the reviewed impact through the S2 operation contract", () => {
    expect(migration).toContain(
      "admin_confirmation_apply_requirement_materialization",
    );
    expect(migration).toContain("private.studio2_claim_operation(");
    expect(migration).toContain("'confirmation.requirement.materialize'");
    expect(migration).toContain("'R2'");
    expect(migration).toContain("'expectedFingerprint'");
    expect(migration).toContain("'VERSION_CONFLICT'");
    expect(migration).toContain("private.studio2_complete_operation");
    expect(migration).toContain("private.studio2_fail_operation");
  });

  it("locks reviewed current requirements before the final compare and applies only reviewed targets", () => {
    const applyStart = migration.indexOf(
      "create or replace function public.admin_confirmation_apply_requirement_materialization",
    );
    const advisoryLock = migration.indexOf(
      "perform pg_advisory_xact_lock(",
      applyStart,
    );
    const rowLock = migration.indexOf(
      "from public.studio2_confirmation_requirements requirement\n  where requirement.edition_id = p_edition_id",
      advisoryLock,
    );
    const finalCompare = migration.indexOf(
      "v_actual_fingerprint := v_preview ->> 'impactFingerprint'",
      rowLock,
    );
    const legacyApply = migration.indexOf(
      "public.admin_confirmation_ensure_requirements(\n      p_edition_id,\n      v_target_ids",
      finalCompare,
    );

    expect(applyStart).toBeGreaterThan(-1);
    expect(advisoryLock).toBeGreaterThan(applyStart);
    expect(rowLock).toBeGreaterThan(advisoryLock);
    expect(finalCompare).toBeGreaterThan(rowLock);
    expect(legacyApply).toBeGreaterThan(finalCompare);
    expect(migration).toContain("for update;");
  });

  it("keeps the established generator as the single compatibility writer", () => {
    expect(migration).toContain(
      "create or replace function public.admin_confirmation_ensure_requirements",
    );
    expect(migration).toContain(
      "v_legacy_result := public.admin_confirmation_ensure_requirements",
    );
    expect(migration).toContain(
      "perform private.studio2_reconcile_confirmation_requirement(",
    );
    expect(migration).toContain(
      "perform private.studio2_reconcile_confirmation_requirement_tasks(p_edition_id)",
    );
  });

  it("returns durable receipt evidence and audits the exact materialization", () => {
    expect(migration).toContain("'receiptId', v_operation_id");
    expect(migration).toContain("'createdRequirements'");
    expect(migration).toContain("'appliedFingerprint'");
    expect(migration).toContain("'resultingFingerprint'");
    expect(migration).toContain("'materialize_confirmation_requirements'");
    expect(migration).toContain("insert into public.admin_audit_log");
  });

  it("keeps the new actor-bound operation surfaces closed to anonymous and service-role callers", () => {
    expect(migration).toContain(
      "from public, anon, service_role;\ngrant execute on function public.admin_confirmation_requirement_materialization_preview",
    );
    expect(migration).toContain(
      "from public, anon, service_role;\ngrant execute on function public.admin_confirmation_apply_requirement_materialization",
    );
    expect(migration).toContain("to authenticated;");
  });

  it("cuts Organizer initialization over to review-first apply and receipt reconciliation", () => {
    const route = source("src/routes/confirmations/admin/requirements.tsx");
    const control = source(
      "src/components/admin/ConfirmationRequirementMaterializationControl.tsx",
    );
    const client = source(
      "src/integrations/confirmations/requirement-materialization.ts",
    );

    expect(route).toContain("ConfirmationRequirementMaterializationControl");
    expect(route).not.toContain("ensureConfirmationRequirements");
    expect(control).toContain("previewConfirmationRequirementMaterialization");
    expect(control).toContain('command: "confirmation.requirement.materialize"');
    expect(control).toContain("expectedVersion: impact.impactFingerprint");
    expect(control).toContain("createTargets.map");
    expect(control).toContain("operationId: command.operationId");
    expect(client).toContain(
      '"admin_confirmation_apply_requirement_materialization"',
    );
    expect(client).toContain('"studio2_reconcile_operation"');
    expect(client).not.toContain("admin_confirmation_ensure_requirements");
  });
});
