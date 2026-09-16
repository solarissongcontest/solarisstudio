import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const route = source("src/components/mysolaris/modules/MySolarisEntryModule.tsx");
const operationsPanel = source("src/components/MySolarisOperationsPanel.tsx");
const model = source("src/lib/entry-readiness-model.ts");

describe("Studio 2 Entry Readiness integration", () => {
  it("is discoverable from My Solaris delegation operations", () => {
    expect(operationsPanel).toContain("NAV_TARGETS.mySolarisEntry");
    expect(operationsPanel).toContain("Entry readiness");
  });

  it("uses existing delegation context and workflow engines", () => {
    expect(route).toContain("loadStudio2HodWorkspace");
    expect(route).toMatch(/isStudio2FeatureEnabled\(["']hod_workspace_v2["']\)/);
    expect(route).toMatch(/isStudio2FeatureEnabled\(["']workflow_engine["']\)/);
    expect(route).toContain("buildEntryReadinessModel");
  });

  it("shows detailed eligibility and workflow state instead of a score alone", () => {
    expect(route).toContain("Eligibility checks");
    expect(route).toContain("Submission progress");
    expect(route).toContain("What needs attention");
    expect(route).toContain("task.blockers");
  });

  it("combines eligibility and workflow without introducing a second persistence system", () => {
    expect(model).toContain("EligibilityResult");
    expect(model).toContain("WorkflowSummary");
    expect(route).not.toContain("studio2_workflow_instances");
    expect(route).not.toContain("insert(");
  });

  it("does not touch the separate Rules / Trust & Integrity workstream", () => {
    expect(route).not.toContain("/rules");
    expect(route).not.toContain("/integrity");
    expect(model).not.toContain("rules_engine");
  });
});
