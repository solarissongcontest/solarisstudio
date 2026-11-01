import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(resolve(process.cwd(), ".github/workflows/ci.yml"), "utf8");

function step(name: string) {
  const marker = `      - name: ${name}\n`;
  const start = workflow.indexOf(marker);
  expect(start, `missing Quality step: ${name}`).toBeGreaterThanOrEqual(0);
  const next = workflow.indexOf("\n      - name: ", start + marker.length);
  return workflow.slice(start, next < 0 ? workflow.length : next);
}

describe("Quality workflow diagnostic integrity", () => {
  it("collects independent static diagnostics before re-asserting failure", () => {
    const typecheck = step("TypeScript");
    const unit = step("Unit tests");
    const lint = step("Lint");
    const sourceCheck = step("Verify CI did not mutate tracked source");
    const finalGate = step("Enforce collected Quality outcomes");

    expect(typecheck).toContain("id: typecheck");
    expect(typecheck).toContain("continue-on-error: true");
    expect(unit).toContain("id: unit_tests");
    expect(unit).toContain("continue-on-error: true");
    expect(lint).toContain("id: lint");
    expect(lint).toContain("continue-on-error: true");
    expect(sourceCheck).toContain("id: tracked_source_check");
    expect(sourceCheck).toContain("if: always()");
    expect(sourceCheck).toContain("continue-on-error: true");

    expect(finalGate).toContain("TYPECHECK_OUTCOME: ${{ steps.typecheck.outcome }}");
    expect(finalGate).toContain("UNIT_OUTCOME: ${{ steps.unit_tests.outcome }}");
    expect(finalGate).toContain("LINT_OUTCOME: ${{ steps.lint.outcome }}");
    expect(finalGate).toContain("SOURCE_CHECK_OUTCOME: ${{ steps.tracked_source_check.outcome }}");
    expect(finalGate).toContain('if [ "$outcome" != "success" ]');
    expect(finalGate).toContain('exit "$failed"');
  });

  it("binds retained diagnostics to the exact checked-out candidate", () => {
    const unit = step("Unit tests");
    const lint = step("Lint");
    const manifest = step("Write Quality diagnostic manifest");
    const upload = step("Upload Quality diagnostic manifest");

    for (const diagnosticStep of [unit, lint]) {
      expect(diagnosticStep).toContain("QUALITY_SOURCE_SHA: ${{ github.event.pull_request.head.sha || github.sha }}");
      expect(diagnosticStep).toContain('echo "candidate_sha=$QUALITY_SOURCE_SHA"');
      expect(diagnosticStep).toContain('echo "run_id=$GITHUB_RUN_ID"');
      expect(diagnosticStep).toContain('echo "run_attempt=$GITHUB_RUN_ATTEMPT"');
    }

    expect(manifest).toContain('checkout_sha="$(git rev-parse HEAD');
    expect(manifest).toContain('if [ "$checkout_sha" != "$expected" ]');
    expect(upload).toContain("if-no-files-found: error");
    expect(upload).toContain("retention-days: 7");
  });

  it("does not retry or quarantine deterministic unit failures into a green result", () => {
    const unit = step("Unit tests").toLowerCase();
    const finalGate = step("Enforce collected Quality outcomes").toLowerCase();

    expect(unit).not.toContain("retry");
    expect(unit).not.toContain("rerun");
    expect(unit).not.toContain("quarantine");
    expect(unit).not.toContain("|| true");
    expect(finalGate).toContain("unit tests:");
    expect(finalGate).toContain('if [ "$outcome" != "success" ]');
  });
});
