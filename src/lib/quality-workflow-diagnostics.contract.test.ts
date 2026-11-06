import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const workflow = root(".github/workflows/ci.yml");

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

  it("runs the repository-declared Vitest suite instead of a second test collector", () => {
    const unit = step("Unit tests");
    const packageJson = JSON.parse(root("package.json")) as { scripts?: Record<string, string> };
    const vitestConfig = root("vitest.config.ts");

    expect(packageJson.scripts?.test).toBe("vitest run");
    expect(vitestConfig).toContain('environment: "node"');
    expect(vitestConfig).toContain('include: ["src/**/*.test.ts", "src/**/*.test.tsx"]');
    expect(unit).toContain("bun run test 2>&1");
    expect(unit).not.toMatch(/(^|\s)bun test(\s|$)/m);
  });

  it("binds retained diagnostics and artifact identity to the exact candidate", () => {
    const unit = step("Unit tests");
    const lint = step("Lint");
    const manifest = step("Write Quality diagnostic manifest");
    const diagnosticUpload = step("Upload Quality diagnostic manifest");
    const exactShaExpression = "${{ github.event.pull_request.head.sha || github.sha }}";

    for (const diagnosticStep of [unit, lint]) {
      expect(diagnosticStep).toContain(`QUALITY_SOURCE_SHA: ${exactShaExpression}`);
      expect(diagnosticStep).toContain('echo "candidate_sha=$QUALITY_SOURCE_SHA"');
      expect(diagnosticStep).toContain('echo "run_id=$GITHUB_RUN_ID"');
      expect(diagnosticStep).toContain('echo "run_attempt=$GITHUB_RUN_ATTEMPT"');
    }

    expect(manifest).toContain('checkout_sha="$(git rev-parse HEAD');
    expect(manifest).toContain('if [ "$checkout_sha" != "$expected" ]');
    expect(step("Upload unit test report")).toContain(`name: unit-test-report-${exactShaExpression}`);
    expect(step("Upload lint report")).toContain(`name: lint-report-${exactShaExpression}`);
    expect(diagnosticUpload).toContain(`name: quality-diagnostics-${exactShaExpression}`);
    expect(diagnosticUpload).toContain("if-no-files-found: error");
    expect(diagnosticUpload).toContain("retention-days: 7");
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
