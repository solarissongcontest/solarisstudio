import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  ".github/workflows/v3-s16-exact-candidate-certification.yml",
  "utf8",
);
const assembler = readFileSync("scripts/assemble-v3-s16-evidence.ts", "utf8");

describe("S16 immutable exact-candidate evidence assembly", () => {
  it("is manual and requires one frozen SHA plus four explicit source run IDs", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("candidate_sha:");
    expect(workflow).toContain("quality_attestation_run_id:");
    expect(workflow).toContain("migration_run_id:");
    expect(workflow).toContain("s14_run_id:");
    expect(workflow).toContain("supplemental_run_id:");
    expect(workflow).not.toContain("pull_request:");
    expect(workflow).not.toContain("push:");
  });

  it("certifies only the exact frozen current-main checkout", () => {
    expect(workflow).toContain("candidate_sha must be one exact 40-character Git commit SHA");
    expect(workflow).toContain("git rev-parse HEAD");
    expect(workflow).toContain("git rev-parse origin/main");
    expect(workflow).toContain("S16 may certify only frozen current main");
  });

  it("validates every named workflow run before artifact download", () => {
    expect(workflow).toContain("V3 S16 core evidence attestation");
    expect(workflow).toContain("Rules + Integrity migration rehearsal");
    expect(workflow).toContain("V3 S14 stateful contest rehearsal");
    expect(workflow).toContain("V3 S16 supplemental evidence");
    expect(workflow).toContain('if [ "$conclusion" != "success" ]');
    expect(workflow).toContain('if [ "$repo" != "$GITHUB_REPOSITORY" ]');
  });

  it("downloads only exact-SHA immutable artifacts from explicit run IDs into runner temp", () => {
    expect(workflow).toContain("actions/download-artifact@v5");
    expect(workflow).toContain("github-token: ${{ secrets.GITHUB_TOKEN }}");
    expect(workflow).toContain("${{ runner.temp }}/v3-s16-sources");
    expect(workflow).toContain("run-id: ${{ inputs.quality_attestation_run_id }}");
    expect(workflow).toContain("run-id: ${{ inputs.migration_run_id }}");
    expect(workflow).toContain("run-id: ${{ inputs.s14_run_id }}");
    expect(workflow).toContain("run-id: ${{ inputs.supplemental_run_id }}");
    expect(workflow).toContain("v3-s16-quality-${{ steps.identity.outputs.sha }}");
    expect(workflow).toContain("v3-s16-migration-rehearsal-${{ steps.identity.outputs.sha }}");
    expect(workflow).toContain("v3-s14-stateful-${{ steps.identity.outputs.sha }}-complete");
    expect(workflow).toContain("v3-s16-supplemental-${{ steps.identity.outputs.sha }}");
  });

  it("rebuilds repository-derived S15 and authorization evidence on the frozen checkout", () => {
    expect(workflow).toContain("build-v3-s15-zero-orphan-evidence.ts");
    expect(workflow).toContain("build-v3-s16-authorization-security-evidence.ts");
    expect(workflow).toContain("check-v3-s16-readiness.ts --json");
  });

  it("fails closed through readiness, certificate and independent release-integrity checks", () => {
    expect(workflow).toContain("check-v3-s16-readiness.ts --require-ready");
    expect(workflow).toContain("build-v3-s16-certification.ts --require-certified");
    expect(workflow).toContain("check-v3-release-integrity.ts --certified");
    expect(workflow).toContain("if: always()");
    expect(workflow).toContain("v3-s16-certification-${{ steps.identity.outputs.sha }}");
  });

  it("requires exactly one of every imported source file and rejects canonical-looking extras", () => {
    for (const filename of [
      "s16-canonical-ci.json",
      "s16-production-isolation.json",
      "s16-migration-rehearsal.json",
      "s14-full-contest.json",
      "security-advisor-classification.json",
      "s16-public-acceptance.json",
      "s16-organizer-acceptance.json",
      "s16-navigation-acceptance.json",
      "s16-accessibility.json",
      "s16-responsive-behavior.json",
    ]) {
      expect(assembler).toContain(`"${filename}"`);
    }
    expect(assembler).toContain("must appear exactly once");
    expect(assembler).toContain("unexpected canonical-looking files");
  });

  it("does not contact or mutate hosted Supabase", () => {
    expect(workflow).not.toContain("supabase.co");
    expect(workflow).not.toContain("supabase db push");
    expect(assembler).not.toContain("supabase.co");
  });
});
