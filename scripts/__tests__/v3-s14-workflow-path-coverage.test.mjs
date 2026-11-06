import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Keep the stateful S14 exact-head rehearsal attached to changes in the actual
// rehearsal drivers, not only changes in their companion test files.
const workflow = readFileSync(
  new URL("../../.github/workflows/v3-s14-full-contest-rehearsal.yml", import.meta.url),
  "utf8",
);

const pullRequestPaths = workflow.match(/^ {4}paths:\r?\n((?: {6}- "[^"\n]+"\r?\n)+)/m);
assert.ok(pullRequestPaths, "S14 must retain explicit pull_request path filters");

const globs = [...pullRequestPaths[1].matchAll(/^ {6}- "([^"\n]+)"$/gm)]
  .map((match) => match[1]);

function matchesGlob(path, glob) {
  const escaped = glob
    .replace(/\*\*/g, "\u0000")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, "[^/]*")
    .replace(/\u0000/g, ".*");
  return new RegExp(`^${escaped}$`).test(path);
}

test("S14 stateful rehearsal runs when independently edited lifecycle drivers change", () => {
  const requiredInputs = [
    ".github/scripts/v3-s14-stage-8-results.sh",
    ".github/scripts/v3-s14-active-publication-snapshot-regression.sql",
    ".github/scripts/v3-full-contest-rehearsal.sh",
    "scripts/v3-s14-full-contest-spec.ts",
    "scripts/check-v3-s14-rehearsal-readiness.ts",
    "scripts/v3-s14-sync-confirmation-entry.ts",
    "scripts/v3-s14-materialize-televote-results.ts",
    "scripts/v3-s14-runtime-defect-sweep.mjs",
    "src/lib/v3-s14-televote-materializer-preflight.contract.test.ts",
    "e2e/v3-s14-grand-final-results-runtime.e2e.ts",
    ".github/workflows/v3-s14-full-contest-rehearsal.yml",
    "scripts/__tests__/v3-s14-workflow-path-coverage.test.mjs",
  ];

  for (const path of requiredInputs) {
    assert.ok(globs.some((glob) => matchesGlob(path, glob)),
      `Editing ${path} must trigger the S14 stateful rehearsal`);
  }
});

test("S14 trigger scope stays focused on rehearsal-related changes", () => {
  for (const unrelated of [
    "src/routes/index.tsx",
    "src/components/PublicHome.tsx",
    "docs/README.md",
  ]) {
    assert.ok(!globs.some((glob) => matchesGlob(unrelated, glob)),
      `Unrelated file ${unrelated} should not trigger S14`);
  }
});
