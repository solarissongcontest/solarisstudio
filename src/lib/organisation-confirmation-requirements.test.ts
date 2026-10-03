import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Organisation OS V5 confirmation requirements", () => {
  const migration = source(
    "supabase/migrations/20261002235000_organisation_os_v5_confirmation_requirements.sql",
  );

  it("models one current versioned requirement per edition and country", () => {
    expect(migration).toContain("studio2_confirmation_requirements_current_idx");
    expect(migration).toContain("unique (edition_id, country_id, generation)");
    expect(migration).toContain("where superseded_at is null");
    expect(migration).toContain("generation + 1");
  });

  it("keeps submission rounds separate from requirement creation", () => {
    expect(migration).toContain("A submission round is");
    expect(migration).toContain("only a window");
    expect(migration).not.toContain("create trigger studio2_confirmation_requirement_reconcile\nafter insert or update or delete on public.submission_rounds");
    expect(migration).not.toContain("create trigger studio2_confirmation_duplicate_submission_guard\nbefore insert on public.submission_rounds");
  });

  it("blocks a second cross-round submission after the current requirement is resolved", () => {
    expect(migration).toContain("studio2_guard_duplicate_confirmation_submission");
    expect(migration).toContain("v_requirement_status in ('satisfied', 'waived')");
    expect(migration).toContain("requires explicit reconfirmation");
  });

  it("makes reconfirmation explicit, audited, R2 and retry-safe", () => {
    expect(migration).toContain("admin_confirmation_reconfirm");
    expect(migration).toContain("'confirmation.requirement.reconfirm'");
    expect(migration).toContain("'R2'");
    expect(migration).toContain("require_confirmation_again");
    expect(migration).toContain("'replayed'");
    expect(migration.indexOf("studio2_claim_operation")).toBeLessThan(
      migration.indexOf("superseded_at = now()"),
    );
  });

  it("projects unresolved requirements into canonical Organizer Tasks", () => {
    expect(migration).toContain("'confirmation_requirement'");
    expect(migration).toContain("'confirmation-requirement:' || requirement.id::text");
    expect(migration).toContain("requirement.status = 'required'");
    expect(migration).toContain("Submission rounds only provide a window");
  });

  it("overrides downstream HOD confirmation completeness after explicit reconfirmation", () => {
    expect(migration).toContain("'confirmationComplete', v_requirement_status in ('satisfied', 'waived')");
    expect(migration).toContain("'confirmationRequirementGeneration'");
  });

  it("uses requirement truth in participant tasks and visible confirmation entry points", () => {
    const access = source("src/lib/confirmation-country-account.ts");
    const tasks = source("src/lib/participation-os.ts");
    const page = source("src/routes/confirmations/index.tsx");

    expect(access).toContain("public_country_account_confirmation_requirements");
    expect(tasks).toContain("requirements: readonly CountryConfirmationRequirement[]");
    expect(tasks).toContain("if (!requirement)");
    expect(tasks).toContain("if (!latestResponse) return null");
    expect(tasks).toContain("Confirm participation again");
    expect(page).toContain("Already confirmed");
    expect(page).toContain("A round is only a submission window");
  });

  it("exposes an R2 Organizer impact review for reconfirmation and waiver", () => {
    const route = source("src/routes/confirmations/admin/requirements.tsx");
    expect(route).toContain('const RISK = "R2"');
    expect(route).toContain("requiresImpactPreview(RISK)");
    expect(route).toContain("Generation {pending.requirement.generation + 1} becomes required immediately.");
    expect(route).toContain("Opening or closing a round remains separate from this decision.");
  });
});
