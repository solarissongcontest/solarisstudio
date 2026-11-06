import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  collectDefectSweep, hasRuntimeCleanProof, STAGES, EXTENSIONS, S14_INVARIANTS, S14_FAILURES,
} from "./v3-s14-runtime-defect-sweep.mjs";

const SHA = "a".repeat(40);
function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), "v3-sweep-contract-"));
  const evidenceDir = join(root, "sweep");
  mkdirSync(evidenceDir);
  const put = (name, data) => writeFileSync(join(evidenceDir, name), JSON.stringify(data));
  try {
    run({ root, evidenceDir, put });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
function completeS14Proof(candidateSha = SHA) {
  return {
    candidateSha, passed: true, partial: false, runtimeFailure: false,
    completedStages: [...STAGES],
    completedContestExtensions: [...EXTENSIONS],
    pendingStages: [], pendingContestExtensions: [], blockedContestExtensions: [],
    implementedInvariants: [...S14_INVARIANTS],
    implementedFailureInjections: [...S14_FAILURES],
    seed: { editionCount: 1, delegationCount: 66, showCount: 3 },
    runIdentity: { candidateSha, editionId: "local-edition", databaseFingerprint: "isolated-db" },
    lifecycle: { finalState: "archived" },
  };
}

test("groups S15 cutover inventory without turning every item into a hard blocker", () => {
  fixture(({ root, evidenceDir, put }) => {
    put("s15-readiness.json", {
      zeroOrphans: false,
      findings: [
        "PUBLIC_CUTOVER_UNRESOLVED results:building",
        "PUBLIC_CUTOVER_UNRESOLVED archive-root:building",
        "ORGANIZER_CUTOVER_UNRESOLVED voting-jury:building",
        "PHYSICAL_OWNERSHIP_CONFLICT critical-writer",
      ],
      physicalOwnership: { zeroOwnershipConflicts: false },
    });
    const result = collectDefectSweep({ root, evidenceDir, candidateSha: SHA });
    assert.equal(result.findingCounts.PUBLIC_CUTOVER_UNRESOLVED, 2);
    assert.equal(result.findingCounts.ORGANIZER_CUTOVER_UNRESOLVED, 1);
    assert.equal(result.findingCounts.PHYSICAL_OWNERSHIP_CONFLICT, 1);
    assert.equal(result.findings.filter((f) => f.group === "s15-inventory").length, 3);
    assert.equal(result.confirmedBlockerCount, 0);
    assert.equal(result.certification, "NOT_CERTIFICATION");
  });
});
test("does not accept success without complete same-SHA Archive evidence", () => {
  fixture(({ root, evidenceDir, put }) => {
    put("runtime-full-contest.json", { candidateSha: SHA, status: "passed", exitCode: 0 });
    const result = collectDefectSweep({ root, evidenceDir, candidateSha: SHA });
    assert.equal(result.exactShaFullContestProof, "not-observed");
    assert.ok(result.findings.some((f) => f.id === "S14_RUNTIME_EVIDENCE_GAP"));
  });
});
test("accepts valid S14 proof only for its exact commit", () => {
  fixture(({ root, evidenceDir, put }) => {
    put("runtime-full-contest.json", { candidateSha: SHA, status: "passed", exitCode: 0 });
    put("s14-full-contest.json", completeS14Proof());
    const result = collectDefectSweep({ root, evidenceDir, candidateSha: SHA });
    assert.equal(result.exactShaFullContestProof, "complete-on-exact-sha");
    assert.ok(!result.findings.some((f) => f.id === "S14_RUNTIME_EVIDENCE_GAP"));

    put("s14-full-contest.json", completeS14Proof("b".repeat(40)));
    const stale = collectDefectSweep({ root, evidenceDir, candidateSha: SHA });
    assert.ok(stale.findings.some((f) => f.id === "EVIDENCE_SHA_MISMATCH_s14-final"));
    assert.notEqual(stale.exactShaFullContestProof, "complete-on-exact-sha");
  });
});
test("rejects reordered lifecycle and incomplete success coverage on the exact SHA", () => {
  fixture(({ root, evidenceDir, put }) => {
    const invalidCases = [
      ["reordered stages", (p) => { p.completedStages.reverse(); }],
      ["reordered grand final", (p) => { p.completedContestExtensions.reverse(); }],
      ["missing invariant", (p) => { p.implementedInvariants.pop(); }],
      ["missing recovery scenario", (p) => { p.implementedFailureInjections.pop(); }],
      ["under-seeded contest", (p) => { p.seed.delegationCount = 65; }],
      ["missing persistent identity", (p) => { p.runIdentity.databaseFingerprint = ""; }],
      ["mismatched persistent SHA", (p) => { p.runIdentity.candidateSha = "b".repeat(40); }],
    ];
    for (const [label, mutate] of invalidCases) {
      const proof = completeS14Proof();
      mutate(proof);
      put("s14-full-contest.json", proof);
      const report = collectDefectSweep({ root, evidenceDir, candidateSha: SHA });
      assert.equal(report.exactShaFullContestProof, "invalid", label);
      assert.ok(report.confirmedBlockerCount > 0, label);
      assert.ok(report.findings.some((f) => f.id === "S14_INVALID_FINAL_EVIDENCE"), label);
      assert.equal(hasRuntimeCleanProof(report), false, label);
    }
  });
});

test("failed stage does not imply that unexecuted later stages passed", () => {
  fixture(({ root, evidenceDir, put }) => {
    put("runtime-full-contest.json", { candidateSha: SHA, status: "failed", exitCode: 1 });
    put("s14-full-contest.partial.json", {
      candidateSha: SHA, passed: false, partial: true,
      failurePhase: "stage-8-results", failureStage: "stage-8-results",
      pendingStages: ["stage-8-results", "stage-9-publication", "stage-10-archive"],
    });
    const report = collectDefectSweep({ root, evidenceDir, candidateSha: SHA });
    assert.equal(report.checks.localRuntimeLanes["full-contest"], "failed");
    assert.equal(report.exactShaFullContestProof, "failed-stage-8-results");
    assert.ok(report.findings.some((f) => f.id === "S14_FIRST_SEMANTIC_FAILURE"));
    assert.ok(report.unexecutedLanes.includes("archive"));
  });
});
test("flags stale boolean-text deadline poll and rejected robust engine", () => {
  fixture(({ root, evidenceDir }) => {
    mkdirSync(join(root, ".github/scripts"), { recursive: true });
    mkdirSync(join(root, "scripts"), { recursive: true });
    mkdirSync(join(root, "src/integrations/televoting"), { recursive: true });
    writeFileSync(join(root, ".github/scripts/v3-s14-stage-7-genuine-deadline.sh"),
      '[[ "$(db_scalar "select (clock_timestamp() >= closes_at)::text")" == "t" ]]');
    writeFileSync(join(root, "scripts/v3-s14-materialize-televote-results.ts"),
      'if (wrong) fail("Stage 8 adapter supports only the canonical " + CALC_ENGINE_VERSION);');
    writeFileSync(join(root, "src/integrations/televoting/robust-televote-math.ts"),
      'export const ENGINE = "robust-televote-v2";');
    const report = collectDefectSweep({ root, evidenceDir, candidateSha: SHA });
    assert.ok(report.findings.some((f) => f.id === "S14_STAGE7_BOOLEAN_TEXT_POLL"));
    assert.ok(report.findings.some((f) => f.id === "S14_STAGE8_ENGINE_COMPATIBILITY"));
  });
});

test("the local-only runner exports Supabase CLI variables before Node validates their hostnames", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/v3-s14-runtime-defect-sweep.yml", import.meta.url), "utf8",
  );
  const health = workflow.indexOf('&& status_env="$(supabase status -o env)"; then');
  const evaluation = workflow.indexOf('eval "$status_env"', health);
  const exported = workflow.indexOf("export API_URL DB_URL ANON_KEY SERVICE_ROLE_KEY", evaluation);
  const isolation = workflow.indexOf('for(const k of ["API_URL","DB_URL"])', exported);
  assert.ok(health >= 0 && evaluation > health, "a failed local status command must prevent rehearsal");
  assert.ok(exported > evaluation, "shell variables must be exported to child processes");
  assert.ok(isolation > exported, "Node local-only guard must execute after exports");
  assert.ok(workflow.includes("bun run scripts/check-v3-production-isolation.ts"));
  assert.ok(workflow.includes('"blocked-preflight" if rc in (90,91,92) else "failed"'));
  assert.ok(workflow.includes("Missing disposable local Supabase credential"));
  assert.ok(workflow.includes("Production-isolation verification failed, no hosted fallback"));
  assert.ok(workflow.includes("Refusing audit server with hosted Supabase URL"));
  assert.ok(workflow.includes("Refusing nonlocal audit server: E2E_BASE_URL"));
  for (const name of [
    "VITE_SUPABASE_URL", "SUPABASE_URL", "E2E_SUPABASE_URL",
    "VITE_CONFIRMATIONS_SUPABASE_URL", "CONFIRMATIONS_SUPABASE_URL",
  ]) assert.ok(workflow.includes(name), `Must validate ${name} before browser rehearsal`);
  assert.ok(workflow.includes("Disposable local Supabase failed, no hosted fallback"));
  assert.ok(!workflow.includes("continue-on-error: true"));
});

test("a preflight refusal blocks the lane without inventing a contest runtime failure", () => {
  for (const code of [90, 91, 92, 93]) {
    fixture(({ root, evidenceDir, put }) => {
      put("runtime-full-contest.json", {
        candidateSha: SHA, lane: "full-contest", status: "failed", exitCode: code,
      });
      const report = collectDefectSweep({ root, evidenceDir, candidateSha: SHA });
      assert.equal(report.checks.localRuntimeLanes["full-contest"], "blocked-preflight");
      assert.ok(report.unexecutedLanes.includes("full-contest"));
      assert.ok(report.findings.some((f) =>
        f.id === "PREFLIGHT_FULL_CONTEST" &&
        f.group === "execution-prerequisite" &&
        f.status === "confirmed-blocker" &&
        f.detail.includes("never reached its rehearsal"),
      ));
      assert.ok(!report.findings.some((f) => f.id === "RUNTIME_FULL_CONTEST"));
      assert.ok(report.confirmedBlockerCount >= 1);
      assert.notEqual(report.exactShaFullContestProof, "complete-on-exact-sha");
    });
  }
});

test("the runner captures real child exits under GitHub bash -e instead of inventing preflight loss", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/v3-s14-runtime-defect-sweep.yml", import.meta.url), "utf8",
  );
  const execution = workflow.split("- name: Execute isolated local scenario and preserve failure evidence")[1]
    ?.split("- name: Preserve missing runtime evidence")[0] ?? "";
  const cases = [
    ["full-contest", "v3-full-contest-rehearsal.sh"],
    ["archive", "v3-s14-archive-system-rehearsal.sh"],
    ["deadline", "v3-s14-televote-deadline-extension-rehearsal.sh"],
    ["televote-truth", "v3-s14-televote-result-truth-rehearsal.sh"],
  ];
  for (const [lane, executable] of cases) {
    const start = execution.indexOf("                " + lane + ")");
    assert.ok(start >= 0, lane + " case is present");
    const segment = execution.slice(start, execution.indexOf(";;", start));
    assert.ok(segment.includes("if bash .github/scripts/" + executable), lane + " uses an exit-capturing conditional");
    assert.match(segment, /then\s+rc=0\s+else\s+rc=\$\?\s+fi/, lane + " captures the actual non-zero exit");
  }
  assert.ok(execution.includes('SWEEP_RC="$rc" python3'), "the recorded exit reaches the exact-SHA runtime report");
  assert.ok(execution.includes('"status":"passed" if rc==0 else'), "nonzero semantic failures remain failures");
  fixture(({ root, evidenceDir, put }) => {
    put("runtime-full-contest.json", {
      candidateSha: SHA, lane: "full-contest", status: "failed", exitCode: 1,
    });
    const result = collectDefectSweep({ root, evidenceDir, candidateSha: SHA });
    assert.equal(result.checks.localRuntimeLanes["full-contest"], "failed");
    assert.ok(result.findings.some((entry) => entry.id === "RUNTIME_FULL_CONTEST"));
    assert.ok(!result.findings.some((entry) => entry.id === "PREFLIGHT_FULL_CONTEST"));
  });
});

test("a real executed rehearsal error remains a critical runtime failure", () => {
  fixture(({ root, evidenceDir, put }) => {
    put("runtime-archive.json", {
      candidateSha: SHA, lane: "archive", status: "failed", exitCode: 1,
    });
    const report = collectDefectSweep({ root, evidenceDir, candidateSha: SHA });
    assert.equal(report.checks.localRuntimeLanes.archive, "failed");
    assert.ok(report.findings.some((f) =>
      f.id === "RUNTIME_ARCHIVE" && f.status === "confirmed-blocker",
    ));
    assert.ok(!report.findings.some((f) => f.id === "PREFLIGHT_ARCHIVE"));
  });
});

test("full contest provisions Chromium before executing Playwright, without burdening other lanes", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/v3-s14-runtime-defect-sweep.yml", import.meta.url), "utf8",
  );
  const setup = workflow.indexOf("- name: Install Chromium for full contest");
  const execution = workflow.indexOf("- name: Execute isolated local scenario", setup);
  assert.ok(setup > 0 && execution > setup);
  const install = workflow.slice(setup, execution);
  assert.ok(install.includes("if: matrix.lane == 'full-contest'"));
  assert.ok(install.includes("bunx playwright install --with-deps chromium"));
  assert.ok(workflow.includes("lane: [full-contest, archive, deadline, televote-truth]"));
});

test("dispatch input cannot choose code outside the selected PR or workflow commit", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/v3-s14-runtime-defect-sweep.yml", import.meta.url), "utf8",
  );
  const checkout = "ref: ${{ github.event.pull_request.head.sha || github.sha }}";
  const required = '[[ "$requested" == "$dispatched" ]]';
  assert.equal(workflow.split(checkout).length - 1, 5);
  assert.equal(workflow.split(required).length - 1, 3);
  assert.equal(workflow.split("DISPATCH_SHA: ${{ github.event.pull_request.head.sha || github.sha }}").length - 1, 3);
  assert.ok(workflow.includes("Requested SHA must match the selected workflow-dispatch or pull-request commit"));
  assert.ok(!workflow.includes("ref: ${{ inputs.candidate_sha || github.event.pull_request.head.sha || github.sha }}"));
});

test("the S14 runtime matrix uses a Playwright-supported runner instead of moving ubuntu-latest", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/v3-s14-runtime-defect-sweep.yml", import.meta.url), "utf8",
  );
  const runtime = workflow.split("  runtime:\n")[1]?.split("\n  report:")[0] ?? "";
  assert.ok(runtime.includes("runs-on: ubuntu-24.04"));
  assert.ok(!runtime.includes("runs-on: ubuntu-latest"));
  assert.ok(runtime.includes("if: matrix.lane == 'full-contest'"));
  assert.ok(runtime.includes("bunx playwright install --with-deps chromium"));
});

test("disposable local start, reset and health status are retried as one bounded bootstrap", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/v3-s14-runtime-defect-sweep.yml", import.meta.url), "utf8",
  );
  const run = workflow.split("- name: Execute isolated local scenario and preserve failure evidence")[1]
    ?.split("- name: Preserve missing runtime evidence")[0] ?? "";
  const retry = run.indexOf("for attempt in 1 2; do");
  const attempt = run.indexOf('if supabase start && supabase db reset --local --no-seed && status_env="$(supabase status -o env)"; then', retry);
  const success = run.indexOf("local_ready=true", attempt);
  const cleanup = run.indexOf("supabase stop --no-backup || true", success);
  const gate = run.indexOf('if [[ "$local_ready" == true ]]; then', cleanup);
  const evalEnv = run.indexOf('eval "$status_env"', gate);
  assert.ok(retry >= 0 && attempt > retry && success > attempt && cleanup > success);
  assert.ok(gate > cleanup && evalEnv > gate, "only a fully healthy local stack may expose its CLI environment");
  assert.ok(run.includes("local_ready=false"));
  assert.ok(run.includes('[[ "$attempt" == "1" ]]'));
  assert.ok(run.includes("Disposable local Supabase failed, no hosted fallback"));
  assert.ok(!run.includes("for attempt in 1 2 3"));
  assert.ok(!run.includes("https://"));
});


test("local stack collapse or unexpected shell abort remains an explicit preflight blocker with preserved exact-SHA evidence", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/v3-s14-runtime-defect-sweep.yml", import.meta.url), "utf8",
  );
  const start = workflow.indexOf("- name: Preserve missing runtime evidence after unexpected step abort");
  const upload = workflow.indexOf("- uses: actions/upload-artifact@v4", start);
  assert.ok(start >= 0 && upload > start, "capture must precede artifact upload");
  const capture = workflow.slice(start, upload);
  assert.ok(capture.includes("if: always()"));
  assert.ok(capture.includes('[[ ! -s "sweep/runtime-${LANE}.json" ]]'));
  assert.ok(capture.includes('"candidateSha": sha'));
  assert.ok(capture.includes('"exitCode": 93'));
  assert.ok(capture.includes('"status": "blocked-preflight"'));
  assert.ok(capture.includes("git\", \"rev-parse\", \"HEAD"));
  assert.ok(workflow.includes('&& status_env="$(supabase status -o env)"; then'),
    "a reset must be followed by a successful local-stack health check");
  fixture(({ root, evidenceDir, put }) => {
    put("runtime-full-contest.json", {
      candidateSha: SHA, lane: "full-contest", status: "blocked-preflight",
      exitCode: 93, reason: "Unexpected shell abort; actual exit unknown",
    });
    const report = collectDefectSweep({ root, evidenceDir, candidateSha: SHA });
    assert.equal(report.checks.localRuntimeLanes["full-contest"], "blocked-preflight");
    assert.ok(report.unexecutedLanes.includes("full-contest"));
    assert.ok(report.findings.some((f) =>
      f.id === "PREFLIGHT_FULL_CONTEST" &&
      f.detail.includes("scenario step aborted before producing evidence")
    ));
    assert.notEqual(report.exactShaFullContestProof, "complete-on-exact-sha");
  });
});


test("updated PR heads cancel obsolete four-lane sweeps without canceling main exact-SHA evidence", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/v3-s14-runtime-defect-sweep.yml", import.meta.url), "utf8",
  );
  assert.ok(workflow.includes("github.event_name == 'pull_request' && github.event.pull_request.number"));
  assert.ok(workflow.includes("inputs.candidate_sha || github.sha"));
  assert.ok(workflow.includes("cancel-in-progress: ${{ github.event_name == 'pull_request' }}"));
  assert.ok(!workflow.includes("cancel-in-progress: false"));
  assert.ok(workflow.includes("ref: ${{ github.event.pull_request.head.sha || github.sha }}"));
});

test("a complete S14 runtime is not clean without exact-SHA static audit and observed readiness inventory", () => {
  fixture(({ root, evidenceDir, put }) => {
    for (const lane of ["full-contest", "archive", "deadline", "televote-truth"]) {
      put("runtime-" + lane + ".json", { candidateSha: SHA, lane, status: "passed", exitCode: 0 });
    }
    put("s14-full-contest.json", completeS14Proof());
    const evidence = {
      candidateSha: SHA,
      checks: ["s14-readiness", "s15-inventory", "sweep-contracts"]
        .map((id) => ({ id, exitCode: 0 })),
    };
    let report = collectDefectSweep({ root, evidenceDir, candidateSha: SHA });
    assert.equal(report.confirmedBlockerCount, 0);
    assert.equal(report.exactShaFullContestProof, "complete-on-exact-sha");
    assert.equal(report.checks.staticEvidence.complete, false);
    assert.equal(hasRuntimeCleanProof(report), false, "runtime-only proof must fail closed");

    put("checks-static.json", evidence);
    put("s14-readiness.json", { ready: true, blockers: [] });
    put("s15-readiness.json", {
      zeroOrphans: false,
      findings: ["PUBLIC_CUTOVER_UNRESOLVED results:building"],
      physicalOwnership: { zeroOwnershipConflicts: true },
    });
    report = collectDefectSweep({ root, evidenceDir, candidateSha: SHA });
    assert.equal(report.checks.staticEvidence.complete, true);
    assert.equal(hasRuntimeCleanProof(report), true, "unresolved S15 cutovers remain triage, not automatic runtime failures");

    put("checks-static.json", { ...evidence, candidateSha: "b".repeat(40) });
    report = collectDefectSweep({ root, evidenceDir, candidateSha: SHA });
    assert.equal(hasRuntimeCleanProof(report), false, "stale static SHA cannot be accepted");
    put("checks-static.json", evidence);
    put("s14-readiness.json", {
      ready: false,
      blockers: ["critical Public capability entry is building, not at parity/cutover"],
    });
    report = collectDefectSweep({ root, evidenceDir, candidateSha: SHA });
    assert.equal(hasRuntimeCleanProof(report), true,
      "a legacy migration inventory is not by itself an executed runtime failure");
    assert.ok(report.findings.some((f) =>
      f.group === "s14-readiness" && f.status === "requires-triage"),
    "the unresolved readiness item must remain visible for explicit release-risk classification");
    assert.equal(report.certification, "NOT_CERTIFICATION",
      "a clean diagnostic does not certify S14, S15 or S16 release readiness");
    put("s14-readiness.json", { ready: false });
    report = collectDefectSweep({ root, evidenceDir, candidateSha: SHA });
    assert.equal(hasRuntimeCleanProof(report), false,
      "a malformed readiness inventory with missing blockers must fail closed");

    put("s14-readiness.json", { ready: true, blockers: [] });
    put("checks-static.json", {
      candidateSha: SHA,
      checks: [{ id: "s14-readiness", exitCode: 0 },
        { id: "s15-inventory", exitCode: 0 }, { id: "s15-inventory", exitCode: 0 }],
    });
    report = collectDefectSweep({ root, evidenceDir, candidateSha: SHA });
    assert.equal(hasRuntimeCleanProof(report), false, "duplicate/missing static checks cannot pass");
  });
});

test("static S14 sweep preserves nonzero diagnostic exit codes under Bash errexit", () => {
  const workflow = readFileSync(
    join(process.cwd(), ".github/workflows/v3-s14-runtime-defect-sweep.yml"), "utf8",
  );
  const segment = workflow.split(
    "      - name: Collect source, S14 and S15 contracts separately\n",
  )[1]?.split("      - uses: actions/upload-artifact@v4")[0];
  assert.ok(segment, "static S14 diagnostics step must exist");
  assert.ok(segment.includes("set -euo pipefail"), "unexpected failures must fail closed");
  for (const [command, variable] of [
    ["bun run scripts/check-v3-s14-rehearsal-readiness.ts --json > sweep/s14-readiness.json", "s14_rc"],
    ["bun run scripts/check-v3-s15-zero-orphan-readiness.ts --json > sweep/s15-readiness.json", "s15_rc"],
    ["node --test _sweep_tooling/scripts/v3-s14-runtime-defect-sweep.contract.mjs", "test_rc"],
  ]) {
    const guard = [
      "          if " + command + "; then",
      "            " + variable + "=0",
      "          else",
      "            " + variable + "=$?",
      "          fi",
    ].join("\n");
    assert.ok(segment.includes(guard), command + " must record actual child exit code");
  }
  assert.ok(segment.includes("SWEEP_S14=\"$s14_rc\" SWEEP_S15=\"$s15_rc\" SWEEP_TEST=\"$test_rc\""));
});
