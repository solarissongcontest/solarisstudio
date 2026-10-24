import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  resolve(
    process.cwd(),
    ".github/workflows/v3-s11-failure-injection-rehearsal.yml",
  ),
  "utf8",
);

describe("System V3 S11 deterministic failure-injection workflow contract", () => {
  it("has one guarded pre-merge activation and future main-only manual dispatch", () => {
    expect(workflow).toContain("pull_request:\n    types: [ready_for_review]");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("github.event_name == 'workflow_dispatch' && github.ref_name == 'main'");
    expect(workflow).toContain("github.event.pull_request.head.repo.full_name == github.repository");
    expect(workflow).toContain("github.event.pull_request.head.ref == 'v3/qa-s11-failure-injection-runtime-gate'");
    expect(workflow).toContain("github.event.pull_request.base.ref == 'v3/sys-s11-failure-injection-current-main'");
    expect(workflow).toContain("github.event.pull_request.base.sha == '594301d4ead167660951beffceea0a540b16e0f5'");
    expect(workflow).toContain("permissions:\n  contents: read");
  });

  it("checks out the exact candidate and requires exactly the two QA-owned files", () => {
    expect(workflow).toContain("ref: ${{ github.event.pull_request.head.sha || github.sha }}");
    expect(workflow).toContain("EVENT_SOURCE_SHA: ${{ github.event.pull_request.head.sha || github.sha }}");
    expect(workflow).toContain("git rev-parse HEAD");
    expect(workflow).toContain("git diff --name-only \"$PR_BASE_SHA...$PR_HEAD_SHA\"");
    expect(workflow).toContain(".github/workflows/v3-s11-failure-injection-rehearsal.yml");
    expect(workflow).toContain("src/lib/v3-s11-failure-injection-workflow.contract.test.ts");
    expect(workflow).toContain("QA delta must contain exactly two QA-owned files");
    expect(workflow).toContain("Refusing retained failure-injection evidence from a dirty checkout");
  });

  it("uses pinned isolated local Supabase and exposes no hosted credential path", () => {
    expect(workflow).toContain("version: 2.113.0");
    expect(workflow).toContain("supabase start");
    expect(workflow).toContain("supabase db reset --local --no-seed");
    expect(workflow).toContain("http://127.0.0.1:*");
    expect(workflow).toContain("http://localhost:*");
    expect(workflow).toContain("Refusing non-loopback API_URL");
    expect(workflow).toContain("Refusing non-loopback DB_URL");
    expect(workflow).not.toContain("SUPABASE_ACCESS_TOKEN");
    expect(workflow).not.toContain("SUPABASE_DB_PASSWORD");
    expect(workflow).not.toContain("SUPABASE_PROJECT_REF");
    expect(workflow).not.toContain("supabase link");
  });

  it("executes only deterministic no-load-shape failure scenarios", () => {
    expect(workflow).toContain("bash .github/scripts/v3-s11-stale-projection-rehearsal.sh");
    expect(workflow).toContain("bash .github/scripts/v3-s11-lost-response-rehearsal.sh");
    expect(workflow).not.toContain("bash .github/scripts/v3-s11-backlog-drain-rehearsal.sh");
    expect(workflow).not.toContain("V3_S11_BACKLOG_EVENTS");
    expect(workflow).not.toContain("V3_S11_DRAIN_BATCH");
    expect(workflow).not.toContain("V3_S11_READ_REQUESTS");
    expect(workflow).toContain('"queue_backlog", "unavailable_dependency"');
  });

  it("retains exact-head proof for the four exercised failure modes without overclaiming", () => {
    for (const scenario of [
      "stale_projection",
      "reconciliation_retry",
      "lost_response_after_commit",
      "transient_rpc_failure",
    ]) {
      expect(workflow).toContain(`\"${scenario}\"`);
    }
    expect(workflow).toContain('"commitSha": expected_sha');
    expect(workflow).toContain('"scope": "isolated_local_supabase"');
    expect(workflow).toContain('"productionTouched": False');
    expect(workflow).toContain('"productionSupabaseTraffic": False');
    expect(workflow).toContain('"certificationClaim": False');
    expect(workflow).toContain('"qaReviewRequired": True');
    expect(workflow).toContain('"issuesFound": []');
    expect(workflow).toContain("scriptSha256");
    expect(workflow).toContain("logSha256");
  });

  it("uploads bounded evidence and always tears down the isolated environment", () => {
    expect(workflow).toContain("v3-s11-deterministic-failure-injection-${{ steps.source.outputs.sha }}");
    expect(workflow).toContain("retention-days: 14");
    expect(workflow).toContain("if-no-files-found: error");
    expect(workflow).toContain("Reset isolated ledger after retaining evidence");
    expect(workflow).toContain("supabase stop --no-backup || true");
  });
});
