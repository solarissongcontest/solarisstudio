import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
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

test("the actual tracked critical-path matrix is structurally valid and explicitly incomplete", () => {
  const path = fileURLToPath(new URL("../docs/v3/final-week-release-blocker-matrix.json", import.meta.url));
  const real = JSON.parse(readFileSync(path, "utf8"));
  assert.deepEqual(evaluateFinalWeekBlockers(real).errors, []);
  assert.equal(real.coverage, "initial_verified_high_priority_only");
  assert.equal(real.releaseCertified, false);
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
});
test("complete exact-SHA preflight may pass before separate owner certification", () => {
  const m = fixture(); m.coverage = "complete"; m.releaseCandidateSha = sha;
  m.items[0].status = "closed"; m.items[0].closureEvidence = [{ verifiedSha: sha, test: "isolated pass" }];
  assert.deepEqual(evaluateFinalWeekBlockers(m, { release: true, candidateSha: sha }).errors, []);
  assert.match(evaluateFinalWeekBlockers(m, { release: true, certified: true, candidateSha: sha }).errors.join("\n"), /owner approval evidence is absent/);
});

test("duplicate, orphan dependency and missing observed evidence fail structure", () => {
  const m = fixture();
  m.items.push({ ...row(), dependencies: ["ghost"], evidence: [] });
  const errors = evaluateFinalWeekBlockers(m).errors.join("\n");
  assert.match(errors, /duplicate id/);
  assert.match(errors, /unknown dependency/);
  assert.match(errors, /initial observed evidence/);
});
test("closing without acceptance proof or with invalid source SHA fails", () => {
  const m = fixture(); m.items[0].status = "closed";
  assert.match(evaluateFinalWeekBlockers(m).errors.join("\n"), /closure requires explicit/);
  m.items[0].closureEvidence = [{ verifiedSha: "not-a-sha", test: "passed" }];
  assert.match(evaluateFinalWeekBlockers(m).errors.join("\n"), /verified historical source SHA/);
});
test("source evidence is historical, while the release candidate is verified at runtime", () => {
  const m = fixture(); m.coverage = "complete"; m.releaseCertified = true;
  m.items[0].status = "closed";
  m.items[0].closureEvidence = [{ verifiedSha: sha, test: "local test passed" }];
  assert.deepEqual(evaluateFinalWeekBlockers(m, { release: true, candidateSha: "b".repeat(40) }).errors, []);
});
test("fully closed synthetic exact-SHA matrix passes only this narrow gate", () => {
  const m = fixture(); m.coverage = "complete"; m.releaseCertified = true;
  m.items[0].status = "closed";
  m.items[0].closureEvidence = [{ verifiedSha: sha, test: "isolated proof" }];
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
    const regular = spawnSync(process.execPath, [relative(process.cwd(), script), "--file", path], { encoding: "utf8" });
    assert.equal(regular.status, 0, regular.stderr);
    const actual = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
    assert.match(actual, /^[a-f0-9]{40}$/);
    const strict = spawnSync(process.execPath, [relative(process.cwd(), script), "--file", path, "--release", "--candidate-sha", actual], { encoding: "utf8" });
    assert.equal(strict.status, 1, strict.stdout);
    assert.match(strict.stderr, /hard blockers remain/);
    const mismatchSha = actual === sha ? "b".repeat(40) : sha;
    const mismatch = spawnSync(process.execPath, [relative(process.cwd(), script), "--file", path, "--release", "--candidate-sha", mismatchSha], { encoding: "utf8" });
    assert.equal(mismatch.status, 1);
    assert.match(mismatch.stderr, /does not match the current checkout/);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test("browser CI installs the exact npm Supabase CLI without upstream setup action downloads", () => {
  const path = fileURLToPath(new URL("../.github/workflows/browser-audit.yml", import.meta.url));
  const yaml = readFileSync(path, "utf8");
  assert.match(yaml, /npm install --prefix[^\n]*supabase@2\.113\.0/);
  assert.match(yaml, /CLI_ROOT="\$RUNNER_TEMP\/solaris-browser-supabase-cli"/);
  assert.match(yaml, /Supabase CLI version mismatch/);
  assert.doesNotMatch(yaml, /uses: supabase\/setup-cli@v[13]/);
  assert.match(yaml, /Start isolated local Supabase for browser audit/);
  assert.match(yaml, /Refusing browser audit against non-local Supabase URL/);
});
