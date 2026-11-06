import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateMainCiEvidence, fetchGithubJson } from "./verify-v3-main-ci-evidence.mjs";

const sha = "a".repeat(40);
const other = "b".repeat(40);
const names = ["Quality", "Browser audit", "V3 S13 Migration Adoption"];
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
  assert.equal(report.workflows.length, 3);
  assert.ok(report.workflows.every((run) => run.passed && run.url));
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
