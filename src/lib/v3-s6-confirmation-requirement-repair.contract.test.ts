import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { V3_PROJECTION_RECONCILIATION_REGISTRY } from "./v3-projection-reconciliation-registry";

const migrationPath =
  "supabase/migrations/20261024200300_v3_s6_confirmation_requirement_bounded_repair.sql";
const migration = readFileSync(resolve(process.cwd(), migrationPath), "utf8");

function repairBody() {
  const marker = "create or replace function public.studio2_reconcile_confirmation_requirements(";
  const start = migration.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = migration.indexOf(
    "revoke all on function public.studio2_reconcile_confirmation_requirements",
    start,
  );
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end);
}

describe("System V3 S6 bounded Confirmation requirement repair", () => {
  it("declares a semantic S13 forward-fix contract", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("'v3.s6.confirmation-requirement-bounded-repair'");
    expect(migration).toContain("'forward_fix_only'");
  });

  it("is edition scoped, paged to 50 countries, and refuses more than 500 candidates before repair", () => {
    const repair = repairBody();
    expect(repair).toContain("p_offset integer default 0");
    expect(repair).toContain("p_limit integer default 50");
    expect(repair).toContain("p_limit > 50");
    expect(repair).toContain("if v_total > 500 then");
    expect(repair).toContain("'repair_candidate_limit_exceeded'");
    expect(repair).toContain("offset p_offset");
    expect(repair).toContain("limit p_limit");
    expect(repair.indexOf("if v_total > 500 then")).toBeLessThan(
      repair.indexOf("perform private.studio2_reconcile_confirmation_requirement("),
    );
  });

  it("rejects a skipped or exhausted page instead of reporting an empty repair as consistent", () => {
    const repair = repairBody();
    expect(repair).toContain("if p_offset > 0 and p_offset >= v_total then");
    expect(repair).toContain("Confirmation repair offset is outside the candidate range");
    expect(repair.indexOf("if p_offset > 0 and p_offset >= v_total then")).toBeLessThan(
      repair.indexOf("for v_country_id in"),
    );
  });

  it("keeps historical-only countries in the recovery candidate set", () => {
    const repair = repairBody();
    const candidateSections = repair.match(
      /from public\.studio2_confirmation_requirements requirement\n\s+where requirement\.edition_id = p_edition_id/g,
    );
    expect(candidateSections?.length).toBeGreaterThanOrEqual(2);
    expect(repair).not.toContain(
      "where requirement.edition_id = p_edition_id\n      and requirement.superseded_at is null\n\n    union",
    );
  });

  it("preserves canonical lifecycle-loss state across page boundaries", () => {
    const repair = repairBody();
    expect(repair).toContain("v_edition_canonical_recovery_required integer := 0");
    expect(repair).toContain("from public.studio2_confirmation_requirements historical_requirement");
    expect(repair).toContain("not exists (");
    expect(repair).toContain("current_requirement.superseded_at is null");
    expect(repair).toContain(
      "when v_edition_canonical_recovery_required > 0 then 'canonical_recovery_required'",
    );
    expect(repair).toContain(
      "'canonicalRecoveryRequired', v_edition_canonical_recovery_required",
    );
    expect(repair).toContain(
      "'pageCanonicalRecoveryRequired', v_page_canonical_recovery_required",
    );
    expect(repair).toContain("'complete', v_complete");
    expect(repair).toContain("and v_edition_canonical_recovery_required = 0");
    expect(repair.indexOf("into v_edition_canonical_recovery_required")).toBeLessThan(
      repair.indexOf("v_state := case"),
    );
  });

  it("delegates repair to the existing canonical per-country invariant instead of adding a second writer", () => {
    const repair = repairBody();
    expect(repair).toContain("perform private.studio2_reconcile_confirmation_requirement(");
    expect(repair).not.toContain("insert into public.studio2_confirmation_requirements");
    expect(repair).not.toContain("update public.studio2_confirmation_requirements");
    expect(repair).not.toContain("delete from public.studio2_confirmation_requirements");
  });

  it("fails explicitly instead of inventing a missing later canonical generation", () => {
    const repair = repairBody();
    expect(repair).toContain("v_historical_count > 0");
    expect(repair).toContain("'canonical_recovery_required'");
    expect(repair).toContain("'missing_current_generation'");
    expect(repair).not.toContain("select max(generation)");
    expect(repair).not.toContain("set generation =");
  });

  it("uses the independent read-only verifier after each bounded repair page", () => {
    const repair = repairBody();
    expect(repair).toContain("public.studio2_verify_confirmation_requirements(");
    expect(repair).toContain("'verification', v_verification");
    expect(repair).toContain("'continuation_required'");
    expect(repair).toContain("'reconciliation_required'");
  });

  it("preserves the historical service grant before the governed repair cutover", () => {
    expect(migration).toContain(
      "revoke all on function public.studio2_reconcile_confirmation_requirements(uuid, integer, integer)",
    );
    expect(migration).toContain("from public, anon, authenticated;");
    expect(migration).toContain(
      "grant execute on function public.studio2_reconcile_confirmation_requirements(uuid, integer, integer)\n  to service_role;",
    );
  });

  it("records bounded repair evidence honestly while Confirmation remains foundation state", () => {
    const contracts = V3_PROJECTION_RECONCILIATION_REGISTRY.filter((projection) =>
      projection.canonicalDomains.includes("confirmation"),
    );
    expect(contracts.length).toBeGreaterThan(0);
    for (const projection of contracts) {
      expect(projection.repair.state).toBe("foundation");
      expect(projection.repair.scope).toBe("edition");
      expect(projection.repair.rebuildPath).toContain(
        "studio2_reconcile_confirmation_requirements",
      );
      expect(projection.repair.verificationPath).toContain(
        "studio2_verify_confirmation_requirements",
      );
      expect(projection.repair.boundedBy).toContain("50");
      expect(projection.repair.boundedBy).toContain("500");
      expect(projection.repair.explicitFailureState).toBe(
        "canonical_confirmation_recovery_required",
      );
      expect(projection.repair.evidence).toContain(migrationPath);
    }
  });
});
