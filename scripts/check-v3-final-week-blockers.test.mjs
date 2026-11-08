import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { evaluateFinalWeekBlockers } from "./check-v3-final-week-blockers.mjs";

const sha = "a".repeat(40);
const row = () => ({
  id: "SYS-01", capability: "Official voting integrity", classification: "hard", status: "blocked",
  sourceOfAuthority: "System V3", technicalRootCause: "Missing isolated proof", owner: "System",
  dependencies: [], relatedPRs: [2404], requiredEvidence: ["Local negative-role test"],
  nextAction: "Run isolated local regression", targetDate: "2026-11-11", verificationSha: sha,
  evidence: ["Reviewed PR #2404 at main SHA"],
});
const fixture = () => ({
  schemaVersion: 1, scope: "full_solaris_studio_v3", releaseAt: "2026-11-15T20:00:00+02:00",
  snapshotDate: "2026-11-08", baselineMainSha: sha, coverage: "initial_verified_high_priority_only",
  releaseCertified: false, items: [row()],
});

test("initial evidence-backed matrix passes structure but has unresolved blockers", () => {
  const result = evaluateFinalWeekBlockers(fixture());
  assert.deepEqual(result.errors, []);
  assert.equal(result.counts.unresolvedHard, 1);
});
test("incomplete coverage and outstanding hard blocker fail release even at matching SHA", () => {
  const errors = evaluateFinalWeekBlockers(fixture(), { release: true, candidateSha: sha }).errors.join("\n");
  assert.match(errors, /coverage is incomplete/);
  assert.match(errors, /hard blockers remain/);
  assert.match(errors, /certification is absent/);
});
test("duplicate, orphan dependency and missing observed evidence fail structure", () => {
  const m = fixture();
  m.items.push({ ...row(), dependencies: ["ghost"], evidence: [] });
  const errors = evaluateFinalWeekBlockers(m).errors.join("\n");
  assert.match(errors, /duplicate id/);
  assert.match(errors, /unknown dependency/);
  assert.match(errors, /initial observed evidence/);
});
test("closing without acceptance proof or with invalid exact SHA fails", () => {
  const m = fixture(); m.items[0].status = "closed";
  assert.match(evaluateFinalWeekBlockers(m).errors.join("\n"), /closure requires explicit/);
  m.items[0].closureEvidence = [{ candidateSha: "not-a-sha", test: "passed" }];
  assert.match(evaluateFinalWeekBlockers(m).errors.join("\n"), /exact candidate SHA/);
});
test("stale matrix and closure evidence fail for different candidate SHA", () => {
  const m = fixture(); m.coverage = "complete"; m.releaseCertified = true;
  m.releaseCandidateSha = "b".repeat(40); m.items[0].status = "closed";
  m.items[0].closureEvidence = [{ candidateSha: sha, test: "local test passed" }];
  const errors = evaluateFinalWeekBlockers(m, { release: true, candidateSha: "b".repeat(40) }).errors.join("\n");
  assert.match(errors, /verified at another SHA/);
  assert.match(errors, /no closure proof for exact candidate/);
});
test("fully closed synthetic exact-SHA matrix passes only this narrow gate", () => {
  const m = fixture(); m.coverage = "complete"; m.releaseCertified = true;
  m.releaseCandidateSha = sha; m.items[0].status = "closed";
  m.items[0].closureEvidence = [{ candidateSha: sha, test: "isolated proof" }];
  assert.deepEqual(evaluateFinalWeekBlockers(m, { release: true, candidateSha: sha }).errors, []);
});
test("superseded finding must have explicit replacement", () => {
  const m = fixture(); m.items[0].classification = "superseded"; m.items[0].status = "superseded";
  assert.match(evaluateFinalWeekBlockers(m).errors.join("\n"), /replacement evidence/);
});
test("real command-line execution fails closed in release mode (relative entrypoint)", () => {
  const temp = mkdtempSync(join(tmpdir(), "v3-blockers-"));
  try {
    const path = join(temp, "matrix.json");
    writeFileSync(path, JSON.stringify(fixture()));
    const script = fileURLToPath(new URL("./check-v3-final-week-blockers.mjs", import.meta.url));
    const regular = spawnSync(process.execPath, [script, "--file", path], { encoding: "utf8" });
    assert.equal(regular.status, 0, regular.stderr);
    const strict = spawnSync(process.execPath, [script, "--file", path, "--release", "--candidate-sha", sha], { encoding: "utf8" });
    assert.equal(strict.status, 1, strict.stdout);
    assert.match(strict.stderr, /hard blockers remain/);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
