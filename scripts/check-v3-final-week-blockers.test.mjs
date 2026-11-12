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
  const m = syntheticallyClosed(); m.releaseCertified = false;
  assert.deepEqual(evaluateFinalWeekBlockers(m, {
    release: true, candidateSha: sha, coverageDashboard: fullDashboard(),
  }).errors, []);
  assert.match(evaluateFinalWeekBlockers(m, { release: true, certified: true, candidateSha: sha }).errors.join("\n"), /owner approval evidence is absent/);
});

const fullApproval = candidateSha => ({
  schemaVersion: 1,
  scope: "full_solaris_studio_v3",
  decision: "GO_FULL_V3",
  candidateSha,
  releaseManager: { name: "Test release manager", decisionRef: "test://release-manager-go" },
  scopeReview: {
    decision: "full_scope_accepted", reviewedBy: "Test scope reviewer",
    evidenceRef: "test://world-and-product-scope", excludedCapabilities: [],
  },
  authorizations: {
    hostedMigration: { approved: true, approvedBy: "Test DB owner", evidenceRef: "test://migration-approval" },
    productionDeployment: { approved: true, approvedBy: "Test release owner", evidenceRef: "test://deploy-approval" },
    publicWriteReopening: { approved: true, approvedBy: "Test operations owner", evidenceRef: "test://write-reopen-approval" },
  },
  gates: ["S13", "S14", "S15", "S16", "security", "productionIsolation"]
    .map(id => ({ id, passed: true, candidateSha, evidenceRef: "test://gate/" + id })),
});

const REQUIRED_SCOPE_IDS = [
  "SYS-FRONTIER", "SYS-S13", "SYS-ARCHIVE", "VOTE-AUTHORITY",
  "RESULT-PUBLICATION", "QA-S14", "QA-S15", "QA-S16",
  "QA-RELEASE-SHA", "PUBLIC-PARITY", "ORG-PARITY",
  "DESIGN-3X", "WORLD-SCOPE", "PROD-AUTH",
];
const NAVIGATION_ACCEPTANCE = [
  "geometry", "material", "lens", "press", "long-press", "drag",
  "velocity-release", "edge-resistance", "scroll-compact", "page-swipe",
  "gesture-arbitration", "route-memory", "focused-task-shell", "keyboard",
  "accessibility", "responsive", "standalone-pwa", "safe-updates",
  "resume", "offline-shell", "performance", "visual-regression",
];
const PUBLIC_DIRECTORIES = [
  "countries", "editions", "tools", "site-directory",
  "shows", "archive", "stories", "reference", "rulebook", "music", "songs", "artists",
];
const fullDashboard = (candidateSha = sha) => {
  const rows = (prefix, count, state = "tested") => Array.from({ length: count }, (_, i) => ({
    id: prefix + i, state, evidence: "synthetic source evidence",
  }));
  return {
    schemaVersion: 1, candidateSha, registryGuardsPassed: true,
    system: rows("S", 17),
    public: rows("P", 51, "cutover"),
    organizer: rows("O", 19, "cutover"),
    navigation: rows("N", 15),
    navigationAcceptance: NAVIGATION_ACCEPTANCE
      .map(id => ({ id, state: "tested", evidence: "synthetic navigation acceptance" })),
    directories: PUBLIC_DIRECTORIES
      .map(id => ({ id: "DIR-" + id, state: "certified", evidence: "synthetic directory acceptance" })),
    registrySummary: {
      public: { cutover: 51 }, organizer: { cutover: 19 },
      systemDomains: 39, pendingPhysicalDomains: 0,
      consequences: 40, eventBackedConsequences: 40,
    },
    directoryRegistryIssues: [], blockers: [],
  };
};

const syntheticallyClosed = () => {
  const m = fixture();
  m.coverage = "complete";
  m.releaseCertified = true;
  m.items[0].status = "closed";
  m.items[0].closureEvidence = [{ verifiedSha: sha, test: "isolated synthetic pass" }];
  for (const id of REQUIRED_SCOPE_IDS) {
    m.items.push({
      ...row(), id, status: "closed",
      classification: ["PUBLIC-PARITY", "ORG-PARITY", "DESIGN-3X", "WORLD-SCOPE", "PROD-AUTH"]
        .includes(id) ? "conditional" : "hard",
      closureEvidence: [{ verifiedSha: sha, test: "synthetic covered gate" }],
    });
  }
  return m;
};

test("boolean certification flag alone cannot grant release or production authorization", () => {
  const errors = evaluateFinalWeekBlockers(syntheticallyClosed(), {
    certified: true, candidateSha: sha,
  }).errors.join("\\n");
  assert.match(errors, /external --approval-file/);
});

test("synthetic complete release gate requires exact-SHA and three distinct human approvals", () => {
  const matrix = syntheticallyClosed();
  assert.deepEqual(evaluateFinalWeekBlockers(matrix, {
    certified: true, candidateSha: sha, approvalPacket: fullApproval(sha),
    coverageDashboard: fullDashboard(),
  }).errors, []);
  const oldCandidate = fullApproval("b".repeat(40));
  assert.match(evaluateFinalWeekBlockers(matrix, {
    certified: true, candidateSha: sha, approvalPacket: oldCandidate,
    coverageDashboard: fullDashboard(),
  }).errors.join("\\n"), /exact candidate SHA/);
  const reusedRef = fullApproval(sha);
  reusedRef.authorizations.productionDeployment.evidenceRef = reusedRef.authorizations.hostedMigration.evidenceRef;
  assert.match(evaluateFinalWeekBlockers(matrix, {
    certified: true, candidateSha: sha, approvalPacket: reusedRef,
    coverageDashboard: fullDashboard(),
  }).errors.join("\\n"), /distinct authorization references/);
});

test("missing individual owner approval, incomplete S16 or excluded scope fail certification", () => {
  const matrix = syntheticallyClosed();
  const missing = fullApproval(sha);
  missing.authorizations.publicWriteReopening.approved = false;
  missing.gates = missing.gates.filter(x => x.id !== "S16");
  missing.scopeReview.excludedCapabilities = ["world-required-capability"];
  const errors = evaluateFinalWeekBlockers(matrix, {
    certified: true, candidateSha: sha, approvalPacket: missing,
    coverageDashboard: fullDashboard(),
  }).errors.join("\\n");
  assert.match(errors, /publicWriteReopening authorization missing/);
  assert.match(errors, /S16 evidence/);
  assert.match(errors, /zero silent exclusions/);
});

test("duplicate, orphan dependency and missing observed evidence fail structure", () => {
  const m = fixture();
  m.items.push({ ...row(), dependencies: ["ghost"], evidence: [] });
  const errors = evaluateFinalWeekBlockers(m).errors.join("\n");
  assert.match(errors, /duplicate id/);
  assert.match(errors, /unknown dependency/);
  assert.match(errors, /initial observed evidence/);
});
test("dependency cycles and self-dependencies fail closed in blocker matrix", () => {
  const matrix = fixture();
  const second = { ...row(), id: "QA-02", dependencies: ["SYS-01"] };
  matrix.items[0].dependencies = ["QA-02"];
  matrix.items.push(second);
  const errors = evaluateFinalWeekBlockers(matrix).errors.join("\n");
  assert.match(errors, /release dependency cycle/);
  assert.match(errors, /SYS-01 -> QA-02 -> SYS-01/);
  matrix.items[0].dependencies = ["SYS-01"];
  assert.match(evaluateFinalWeekBlockers(matrix).errors.join("\n"), /SYS-01 -> SYS-01/);
});

test("closing without acceptance proof or with invalid source SHA fails", () => {
  const m = fixture(); m.items[0].status = "closed";
  assert.match(evaluateFinalWeekBlockers(m).errors.join("\n"), /closure requires explicit/);
  m.items[0].closureEvidence = [{ verifiedSha: "not-a-sha", test: "passed" }];
  assert.match(evaluateFinalWeekBlockers(m).errors.join("\n"), /verified historical source SHA/);
});
test("source evidence is historical, while the release candidate is verified at runtime", () => {
  const m = syntheticallyClosed();
  assert.deepEqual(evaluateFinalWeekBlockers(m, {
    release: true, candidateSha: "b".repeat(40),
    coverageDashboard: fullDashboard("b".repeat(40)),
  }).errors, []);
});
test("fully closed synthetic exact-SHA matrix passes only this narrow gate", () => {
  const m = syntheticallyClosed();
  assert.deepEqual(evaluateFinalWeekBlockers(m, {
    release: true, candidateSha: sha, coverageDashboard: fullDashboard(),
  }).errors, []);
});
test("a manually flipped complete flag cannot skip the source-generated dashboard", () => {
  const matrix = syntheticallyClosed();
  const errors = evaluateFinalWeekBlockers(matrix, { release: true, candidateSha: sha }).errors.join("\n");
  assert.match(errors, /generated exact-SHA completion-dashboard/);
  const truncated = fixture(); truncated.coverage = "complete";
  truncated.items[0].status = "closed";
  truncated.items[0].closureEvidence = [{ verifiedSha: sha, test: "synthetic" }];
  const failures = evaluateFinalWeekBlockers(truncated, {
    release: true, candidateSha: sha, coverageDashboard: fullDashboard(),
  }).errors.join("\n");
  assert.match(failures, /full V3 blocker matrix lacks WORLD-SCOPE/);
});

test("full V3 scope rejects incomplete capability, navigation and System coverage", () => {
  const matrix = syntheticallyClosed();
  const dashboard = fullDashboard();
  dashboard.public.pop();
  dashboard.organizer[0].state = "implemented";
  dashboard.system[7].blocker = "missing object permission proof";
  dashboard.navigationAcceptance[0].state = "foundation";
  dashboard.registrySummary.organizer = { cutover: 18, building: 1 };
  dashboard.registrySummary.pendingPhysicalDomains = 1;
  dashboard.blockers.push("S14 final score reproducibility absent");
  const errors = evaluateFinalWeekBlockers(matrix, {
    release: true, candidateSha: sha, coverageDashboard: dashboard,
  }).errors.join("\n");
  for (const expected of [
    /full public milestone coverage/, /organizer milestones lack acceptance/,
    /system milestones lack acceptance/, /navigationAcceptance coverage/,
    /organizer capability registry has incomplete legacy cutover/,
    /System domain, physical ownership/, /unresolved findings/,
  ]) assert.match(errors, expected);
});

test("a truncated acceptance collection cannot masquerade as complete V3 coverage", () => {
  const matrix = syntheticallyClosed();
  const dashboard = fullDashboard();
  dashboard.navigationAcceptance = dashboard.navigationAcceptance.filter(row => row.id !== "visual-regression");
  dashboard.directories = dashboard.directories.filter(row => row.id !== "DIR-artists");
  const errors = evaluateFinalWeekBlockers(matrix, {
    release: true, candidateSha: sha, coverageDashboard: dashboard,
  }).errors.join("\n");
  assert.match(errors, /navigationAcceptance coverage/);
  assert.match(errors, /directories coverage/);
});

test("stale or falsified completion dashboards cannot certify the wrong SHA", () => {
  const matrix = syntheticallyClosed();
  const dashboard = fullDashboard("b".repeat(40));
  dashboard.directoryRegistryIssues = ["directory country: visual evidence absent"];
  dashboard.directories[0].state = "implemented";
  const errors = evaluateFinalWeekBlockers(matrix, {
    release: true, candidateSha: sha, coverageDashboard: dashboard,
  }).errors.join("\n");
  assert.match(errors, /completion dashboard is stale/);
  assert.match(errors, /directories coverage/);
  assert.match(errors, /unresolved findings/);
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

test("release CLI cannot accept complete coverage without a generated exact-checkout dashboard", () => {
  const temp = mkdtempSync(join(tmpdir(), "v3-coverage-"));
  try {
    const matrixFile = join(temp, "matrix.json");
    const dashboardFile = join(temp, "dashboard.json");
    const script = fileURLToPath(new URL("./check-v3-final-week-blockers.mjs", import.meta.url));
    const candidate = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
    assert.match(candidate, /^[a-f0-9]{40}$/);
    writeFileSync(matrixFile, JSON.stringify(syntheticallyClosed()));
    const args = ["--file", matrixFile, "--release", "--candidate-sha", candidate,
      "--dashboard-file", dashboardFile];
    const missing = spawnSync(process.execPath, [relative(process.cwd(), script), ...args], { encoding: "utf8" });
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /generated exact-SHA completion-dashboard/);

    writeFileSync(dashboardFile, JSON.stringify(fullDashboard("b".repeat(40))));
    const stale = spawnSync(process.execPath, [relative(process.cwd(), script), ...args], { encoding: "utf8" });
    assert.equal(stale.status, 1);
    assert.match(stale.stderr, /completion dashboard is stale/);

    writeFileSync(dashboardFile, JSON.stringify(fullDashboard(candidate)));
    const valid = spawnSync(process.execPath, [relative(process.cwd(), script), ...args], { encoding: "utf8" });
    assert.equal(valid.status, 0, valid.stderr);
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
