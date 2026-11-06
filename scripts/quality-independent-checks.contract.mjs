import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(
  new URL("../.github/workflows/ci.yml", import.meta.url),
  "utf8",
);

function step(name) {
  const start = workflow.indexOf("      - name: " + name + "\n");
  assert.notEqual(start, -1, "Missing Quality step: " + name);
  const remaining = workflow.slice(start);
  const next = remaining.indexOf("\n      - name:", 1);
  return next < 0 ? remaining : remaining.slice(0, next);
}

test("an exceeded real client bundle budget remains a mandatory failed check", () => {
  const budget = step("Enforce client performance budget");
  assert.ok(budget.includes("id: client_budget"));
  assert.ok(budget.includes("run: bun run budget:client"));
  assert.ok(!budget.includes("continue-on-error: true"));
  assert.ok(!budget.includes("if: always()"));
  const summary = step("Quality summary");
  const manifest = step("Write Quality diagnostic manifest");
  assert.ok(summary.includes("if: always()"));
  assert.ok(summary.includes("steps.client_budget.outcome"));
  assert.ok(manifest.includes("steps.client_budget.outcome"));
});

test("independent diagnostics run after failed budget, but not after failed build or cancellation", () => {
  const gate = "if: ${{ !cancelled() && steps.production_build.outcome == 'success' }}";
  for (const name of [
    "Verify route tree was generated",
    "Verify generated route tree is untracked",
    "TypeScript",
    "Unit tests",
    "Lint",
  ]) {
    const check = step(name);
    assert.ok(check.includes(gate), name + " must not be masked by a failed budget");
    assert.ok(!check.includes("if: always()"), name + " must not bypass failed build/isolation");
  }
  const build = workflow.indexOf("      - name: Production build\n");
  const budget = workflow.indexOf("      - name: Enforce client performance budget\n");
  const diagnostics = workflow.indexOf("      - name: TypeScript\n");
  assert.ok(build > 0 && budget > build && diagnostics > budget);
  assert.ok(step("TypeScript").includes("continue-on-error: true"));
  assert.ok(step("Unit tests").includes("continue-on-error: true"));
  assert.ok(step("Lint").includes("continue-on-error: true"));
});

test("isolation and exact-source prerequisites stay before all build/test execution", () => {
  const isolation = workflow.indexOf("      - name: Verify V3 production isolation\n");
  const contract = workflow.indexOf("      - name: Regress independent Quality diagnostics (read-only)\n");
  const evidence = workflow.indexOf("      - name: Generate V3 integration evidence\n");
  const build = workflow.indexOf("      - name: Production build\n");
  assert.ok(isolation > 0 && contract > isolation && evidence > contract && build > evidence);
  assert.ok(step("Verify V3 production isolation").includes("scripts/check-v3-production-isolation.ts"));
  assert.ok(step("Regress independent Quality diagnostics (read-only)").includes(
    "node --test scripts/quality-independent-checks.contract.mjs",
  ));
  assert.ok(step("Generate V3 integration evidence").includes('git rev-parse HEAD'));
  assert.ok(step("Generate V3 integration evidence").includes("expected exact source SHA"));
});

test("all real outcomes, including failures, reach exact-SHA Quality artifacts and fail-closed fan-in", () => {
  const manifest = step("Write Quality diagnostic manifest");
  const final = step("Enforce collected Quality outcomes");
  for (const id of ["typecheck", "unit_tests", "lint", "tracked_source_check"]) {
    assert.ok(manifest.includes("steps." + id + ".outcome"));
  }
  assert.ok(manifest.includes("QUALITY_SOURCE_SHA"));
  assert.ok(manifest.includes("checkout_sha"));
  assert.ok(step("Upload Quality diagnostic manifest").includes("if: always()"));
  assert.ok(step("Upload unit test report").includes("if: always()"));
  assert.ok(step("Upload lint report").includes("if: always()"));
  assert.ok(final.includes("if: always()"));
  assert.ok(final.includes('if [ "$outcome" != "success" ]; then'));
  assert.ok(final.includes('exit "$failed"'));
  assert.ok(step("Verify CI did not mutate tracked source").includes("if: always()"));
});
