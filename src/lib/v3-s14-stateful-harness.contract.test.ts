import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  V3_S14_FAILURE_INJECTIONS,
  V3_S14_INVARIANTS,
  V3_S14_SEED_CONTRACT,
  V3_S14_STAGES,
} from "../../scripts/v3-s14-full-contest-spec";

const source = (path: string) => readFileSync(path, "utf8");
const driver = source(".github/scripts/v3-full-contest-rehearsal.sh");
const runtime = source(".github/scripts/v3-s14-lib.sh");
const stage1 = source(".github/scripts/v3-s14-stage-1-setup.sh");
const stage2 = source(".github/scripts/v3-s14-stage-2-onboarding.sh");
const stage3 = source(".github/scripts/v3-s14-stage-3-confirmations.sh");
const readiness = source("scripts/check-v3-s14-rehearsal-readiness.ts");

describe("S14 stateful full-contest harness", () => {
  it("keeps one bounded 66-delegation contest instead of copying production", () => {
    expect(V3_S14_SEED_CONTRACT.editionCount).toBe(1);
    expect(V3_S14_SEED_CONTRACT.delegationCount).toBe(66);
    expect(V3_S14_SEED_CONTRACT.deterministic).toBe(true);
    expect(V3_S14_SEED_CONTRACT.bounded).toBe(true);
    expect(stage1).toContain("generate_series(1, 66)");
    expect(stage1).toContain("S14 Full Contest Rehearsal");
    expect(stage1).not.toContain("prod");
  });

  it("runs implemented stages in one process and never substitutes isolated rehearsals", () => {
    for (const path of [
      "v3-s14-stage-1-setup.sh",
      "v3-s14-stage-2-onboarding.sh",
      "v3-s14-stage-3-confirmations.sh",
    ]) expect(driver).toContain(`source \"$SCRIPT_DIR/${path}\"`);
    expect(driver).not.toContain("v3-confirmation-security-rehearsal.sh");
    expect(driver).not.toContain("v3-entry-receipt-security-rehearsal.sh");
    expect(driver).not.toContain("supabase db reset");
  });

  it("fails closed on production identity and exact candidate mismatch", () => {
    expect(runtime).toContain("check-v3-production-isolation.ts");
    expect(runtime).toContain("refusing S14 against non-local API_URL");
    expect(runtime).toContain("V3_CANDIDATE_SHA");
    expect(runtime).toContain('[[ "$CANDIDATE_SHA" == "$HEAD_SHA" ]]');
    expect(runtime).not.toContain("supabase.co");
  });

  it("implements confirmation lifecycle evidence without claiming unfinished stages", () => {
    expect(V3_S14_STAGES.slice(0, 3).every((item) => item.implementationState === "implemented")).toBe(true);
    expect(V3_S14_STAGES.slice(3).every((item) => item.implementationState === "planned")).toBe(true);
    expect(stage3).toContain("seq 1 66");
    expect(stage3).toContain("v3_submit_confirmation");
    expect(stage3).toContain("v3_reconcile_confirmation");
    expect(stage3).toContain("studio2_apply_confirmation_round_change");
    expect(stage3).toContain("submission_versions");
    expect(stage3).toContain("S14_STAGE_3_CONFIRMATIONS_COMPLETE");
  });

  it("uses the real notification category vocabulary during onboarding", () => {
    expect(stage2).toContain("'televoting'");
    expect(stage2).not.toContain("'televote'");
  });

  it("only marks failure injections and invariants that the executable stage proves", () => {
    const implementedFailures = V3_S14_FAILURE_INJECTIONS.filter((item) => item.implementationState === "implemented").map((item) => item.id);
    expect(implementedFailures).toEqual(["network-after-commit", "duplicate-request", "stale-client"]);
    const implementedInvariants = V3_S14_INVARIANTS.filter((item) => item.implementationState === "implemented").map((item) => item.id);
    expect(implementedInvariants).toEqual(["confirmation-no-effective-duplicates"]);
    for (const marker of [
      "S14_FAILURE_NETWORK_AFTER_COMMIT_COMPLETE",
      "S14_FAILURE_DUPLICATE_REQUEST_COMPLETE",
      "S14_FAILURE_STALE_CLIENT_COMPLETE",
      "S14_INVARIANT_CONFIRMATION_COMPLETE",
    ]) expect(stage3).toContain(marker);
  });

  it("cannot emit release-grade evidence while Stages 4-10 remain pending", () => {
    expect(driver).toContain('"passed": False');
    expect(driver).toContain("s14-full-contest.partial.json");
    expect(driver).toContain("No release-grade s14-full-contest.json was written");
    expect(driver).not.toContain('"passed": True');
    expect(readiness).toContain("S14 lifecycle stages not implemented in the unified stateful driver");
  });

  it("keeps every shell module syntactically valid", () => {
    for (const path of [
      ".github/scripts/v3-full-contest-rehearsal.sh",
      ".github/scripts/v3-s14-lib.sh",
      ".github/scripts/v3-s14-stage-1-setup.sh",
      ".github/scripts/v3-s14-stage-2-onboarding.sh",
      ".github/scripts/v3-s14-stage-3-confirmations.sh",
    ]) {
      expect(() => execFileSync("bash", ["-n", path], { stdio: "pipe" })).not.toThrow();
    }
  });
});
