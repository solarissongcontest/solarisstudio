import assert from "node:assert/strict";
import { test } from "node:test";
import { collectCompleteWorkflowRuns, evaluateMainCiEvidence, fetchGithubJson } from "./verify-v3-main-ci-evidence.mjs";

const sha = "a".repeat(40);
const other = "b".repeat(40);
const names = ["Quality", "Browser audit", "V3 S13 Migration Adoption", "V3 Public Organizer integration contracts"];
const good = (name, overrides = {}) => ({
  id: names.indexOf(name) + 1,
  name,
  head_sha: sha,
  head_branch: "main",
  event: "push",
  status: "completed",
  conclusion: "success",
  run_attempt: 1,
  html_url: `https://github.com/example/repo/actions/runs/${names.indexOf(name) + 1}`,
  created_at: "2026-11-04T20:00:00Z",
  ...overrides,
});
const verify = (overrides = {}) =>
  evaluateMainCiEvidence({
    expectedSha: sha,
    ref: "refs/heads/main",
    firstMainSha: sha,
    lastMainSha: sha,
    workflowRuns: names.map((name) => good(name)),
    ...overrides,
  });

test("passes only fully successful push workflows on the same exact current main SHA", () => {
  const report = verify();
  assert.equal(report.passed, true);
  assert.equal(report.releaseCertified, false);
  assert.equal(report.workflows.length, 4);
  assert.ok(report.workflows.every((run) => run.passed && run.url));
});

test("requires Public/Organizer contracts on the exact merged main SHA", () => {
  const missing = names.filter((name) => name !== "V3 Public Organizer integration contracts").map((name) => good(name));
  const report = verify({ workflowRuns: missing });
  assert.equal(report.passed, false);
  assert.equal(report.workflows[3].status, "missing");

  const stale = [...missing, good("V3 Public Organizer integration contracts", { head_sha: other })];
  assert.equal(verify({ workflowRuns: stale }).passed, false);

  const prOnly = [...missing, good("V3 Public Organizer integration contracts", { event: "pull_request" })];
  assert.equal(verify({ workflowRuns: prOnly }).passed, false);

  const failed = [...missing, good("V3 Public Organizer integration contracts", { conclusion: "failure" })];
  assert.equal(verify({ workflowRuns: failed }).passed, false);
});

test("rejects missing or cancelled Browser Audit, even if an older main/browser commit passed", () => {
  const runs = [good("Quality"), good("V3 S13 Migration Adoption"), good("Browser audit", { head_sha: other })];
  assert.equal(verify({ workflowRuns: runs }).passed, false);
  assert.equal(verify({ workflowRuns: runs }).workflows[1].status, "missing");
  runs.push(good("Browser audit", { conclusion: "cancelled" }));
  assert.equal(verify({ workflowRuns: runs }).workflows[1].conclusion, "cancelled");
  assert.equal(verify({ workflowRuns: runs }).passed, false);
});

test("rejects failure, skipped and in-progress outcomes", () => {
  for (const status of [
    { status: "completed", conclusion: "failure" },
    { status: "completed", conclusion: "skipped" },
    { status: "in_progress", conclusion: null },
  ]) {
    const report = verify({ workflowRuns: names.map((name) => good(name, name === "Quality" ? status : {})) });
    assert.equal(report.passed, false);
  }
});

test("rejects PR-level success, even on a commit with the same SHA", () => {
  assert.equal(verify({ workflowRuns: names.map((name) => good(name, { event: "pull_request" })) }).passed, false);
  assert.equal(verify({ workflowRuns: names.map((name) => good(name, { head_branch: "feature" })) }).passed, false);
});

test("rejects stale dispatch SHA, any main movement during checks, and non-main workflow triggers", () => {
  assert.equal(verify({ firstMainSha: other }).passed, false);
  assert.equal(verify({ lastMainSha: other }).passed, false);
  assert.equal(verify({ ref: "refs/heads/feature" }).passed, false);
});

test("uses the most recent exact-SHA run, refusing to inherit an earlier green result", () => {
  const report = verify({ workflowRuns: [
    ...names.map((name) => good(name)),
    good("Browser audit", {
      id: 100,
      conclusion: "failure",
      created_at: "2026-11-04T21:00:00Z",
    }),
  ] });
  assert.equal(report.passed, false);
  assert.equal(report.workflows[1].runId, 100);
});

test("fails closed on malformed SHA or workflow data", () => {
  assert.throws(() => verify({ expectedSha: "main" }), /exact 40-character/);
  assert.throws(() => verify({ workflowRuns: null }), /array/);
});

test("GitHub evidence fetch refuses unauthenticated requests and HTTP failures", async () => {
  await assert.rejects(() => fetchGithubJson("https://api.github.com/x", ""), /GITHUB_TOKEN/);
  await assert.rejects(
    () => fetchGithubJson("https://api.github.com/x", "local-fake-token", async () => ({ ok: false, status: 403 })),
    /HTTP 403/,
  );
});

test("collects every exact-SHA run from a stable bounded GitHub page sequence", async () => {
  let calls = 0;
  const runs = await collectCompleteWorkflowRuns(async (page) => {
    calls += 1;
    return {
      total_count: 3,
      workflow_runs: page === 1 ? [good(names[0])] : [good(names[1]), good(names[2])],
    };
  });
  assert.equal(calls, 2);
  assert.deepEqual(runs.map((run) => run.id), [1, 2, 3]);
  assert.equal(verify({ workflowRuns: runs }).passed, true);
  assert.deepEqual(await collectCompleteWorkflowRuns(async () => ({
    total_count: 0,
    workflow_runs: [],
  })), []);
});

test("rejects repeated run IDs across GitHub pages rather than masking omitted CI failures", async () => {
  await assert.rejects(
    () => collectCompleteWorkflowRuns(async (page) => ({
      total_count: 3,
      workflow_runs: page === 1
        ? [good(names[0]), good(names[1])]
        : [good(names[1]), good(names[2])],
    })),
    /repeated run ID/,
  );
});

test("rejects GitHub pagination whose total changes, overflows, or stops early", async () => {
  await assert.rejects(
    () => collectCompleteWorkflowRuns(async (page) => ({
      total_count: page === 1 ? 3 : 4,
      workflow_runs: [good(names[page - 1])],
    })),
    /count changed/,
  );
  await assert.rejects(
    () => collectCompleteWorkflowRuns(async () => ({
      total_count: 1,
      workflow_runs: [good(names[0]), good(names[1])],
    })),
    /exceeds its authoritative run count/,
  );
  await assert.rejects(
    () => collectCompleteWorkflowRuns(async (page) => ({
      total_count: 3,
      workflow_runs: page === 1 ? [good(names[0])] : [],
    })),
    /ended before all/,
  );
  await assert.rejects(
    () => collectCompleteWorkflowRuns(async () => ({
      total_count: 3,
      workflow_runs: [good(names[0])],
    }), 1),
    /incomplete after the bounded page limit/,
  );
});

test("refuses malformed, duplicated, or over-budget GitHub workflow run metadata", async () => {
  await assert.rejects(
    () => collectCompleteWorkflowRuns(async () => ({ total_count: -1, workflow_runs: [] })),
    /authoritative run count/,
  );
  await assert.rejects(
    () => collectCompleteWorkflowRuns(async () => ({ total_count: 1, workflow_runs: [{ name: "Quality" }] })),
    /invalid or repeated run ID/,
  );
  await assert.rejects(
    () => collectCompleteWorkflowRuns(async () => ({ total_count: 501, workflow_runs: [] })),
    /bounded pagination limit/,
  );
  await assert.rejects(
    () => collectCompleteWorkflowRuns(null),
    /page reader/,
  );
});
