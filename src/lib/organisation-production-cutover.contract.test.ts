import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const checklist = source(
  "docs/organisation-os-v5/production-cutover-checklist.md",
);
const qualityWorkflow = source(".github/workflows/ci.yml");

describe("Organisation OS V5 production cutover contract", () => {
  it("documents database-before-frontend ordering for the known runtime contract", () => {
    expect(checklist).toContain(
      "20261002193000_organisation_os_v5_system_diagnostics.sql",
    );
    expect(checklist).toContain(
      "20261002211500_organisation_os_v5_task_engine.sql",
    );
    expect(checklist).toContain(
      "20261003014000_organisation_os_v5_jury_window_operations.sql",
    );
    expect(checklist).toContain(
      "20261004221500_runtime_release_contract.sql",
    );
    expect(checklist).toContain(
      "20261004222500_push_delivery_receipts.sql",
    );
    expect(checklist).toContain(
      "20261004230000_organizer_task_runtime_reconciliation.sql",
    );
    expect(checklist).toContain("organisation-os-v5-20261004-core");
    expect(checklist).toContain("organisation-os-v5-20261004-complete");
    expect(checklist).toContain("Do not reorder these migrations");
  });

  it("keeps automated validation isolated from hosted Supabase", () => {
    expect(checklist).toContain(
      "Automated tests, CI, Playwright, browser audits, migration rehearsals and preview builds MUST NOT use production Supabase",
    );
    expect(qualityWorkflow).toContain(
      'VITE_SUPABASE_URL=http://127.0.0.1:54321',
    );
    expect(qualityWorkflow).toContain(
      'SUPABASE_URL=http://127.0.0.1:54321',
    );
    expect(qualityWorkflow).toContain(
      'VITE_CONFIRMATIONS_SUPABASE_URL=http://127.0.0.1:54321',
    );
    expect(qualityWorkflow).toContain(
      'CONFIRMATIONS_SUPABASE_URL=http://127.0.0.1:54321',
    );
  });

  it("requires deliberate reconciliation instead of blind mass updates", () => {
    expect(checklist).toContain("Do not mass-update every mismatch");
    expect(checklist).toContain("Oland");
    expect(checklist).toContain("Onyra");
    expect(checklist).toContain("Aethelgardia");
    expect(checklist).toContain("lifecycle guard must block automatic reversal");
  });
});
