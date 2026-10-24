import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  resolve(
    process.cwd(),
    ".github/workflows/v3-s11-cloudflare-rollback-rehearsal.yml",
  ),
  "utf8",
);

describe("System V3 S11 Cloudflare rollback workflow contract", () => {
  it("supports one guarded pre-merge activation plus main-only manual dispatch", () => {
    expect(workflow).toContain("pull_request:\n    types: [ready_for_review]");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("github.event_name == 'workflow_dispatch' && github.ref_name == 'main'");
    expect(workflow).toContain("github.event.pull_request.head.repo.full_name == github.repository");
    expect(workflow).toContain("github.event.pull_request.head.ref == 'v3/qa-s11-cloudflare-rollback-runtime-gate'");
    expect(workflow).toContain("github.event.pull_request.base.ref == 'v3/sys-s11-cloudflare-rollback-current-main'");
    expect(workflow).toContain("github.event.pull_request.base.sha == '4b4629abfea10471a4ddf906d39fb951d2e5c5ce'");
    expect(workflow).toContain("permissions:\n  contents: read");
  });

  it("checks out the exact candidate and proves the stacked PR has only the two QA-owned files", () => {
    expect(workflow).toContain("ref: ${{ github.event.pull_request.head.sha || github.sha }}");
    expect(workflow).toContain("EVENT_SOURCE_SHA: ${{ github.event.pull_request.head.sha || github.sha }}");
    expect(workflow).toContain("git rev-parse HEAD");
    expect(workflow).toContain("git diff --name-only \"$PR_BASE_SHA...$PR_HEAD_SHA\"");
    expect(workflow).toContain(".github/workflows/v3-s11-cloudflare-rollback-rehearsal.yml");
    expect(workflow).toContain("src/lib/v3-s11-cloudflare-rollback-workflow.contract.test.ts");
    expect(workflow).toContain("Provider drill PR delta must contain exactly the two QA-owned files");
    expect(workflow).toContain("Refusing retained provider evidence from a dirty checkout");
  });

  it("serializes mutation of one dedicated non-production Worker namespace", () => {
    expect(workflow).toContain("group: v3-s11-cloudflare-rollback-provider");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("solaris-s11-rollback-*");
    expect(workflow).toContain("^solaris-s11-rollback-[a-z0-9]");
    expect(workflow).toContain("Refusing production Cloudflare Worker 'studio'");
    expect(workflow).toContain("Worker name exceeds the 63-character safety bound");
    expect(workflow).toContain("github.event_name == 'pull_request' && 'solaris-s11-rollback-github'");
  });

  it("executes the unchanged canonical component rehearsal without a Supabase credential path", () => {
    expect(workflow).toContain("CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}");
    expect(workflow).toContain("CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}");
    expect(workflow).toContain("SOLARIS_S11_ROLLBACK_WORKER: ${{ steps.target.outputs.worker }}");
    expect(workflow).toContain("SOLARIS_S11_ROLLBACK_EVIDENCE_PATH: /tmp/v3-s11-cloudflare-rollback.json");
    expect(workflow).toContain("bash .github/scripts/v3-s11-cloudflare-rollback-rehearsal.sh");
    expect(workflow).not.toContain("SUPABASE_ACCESS_TOKEN");
    expect(workflow).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(workflow).not.toContain("SUPABASE_DB_PASSWORD");
    expect(workflow).not.toContain("supabase link");
    expect(workflow).not.toContain("wrangler deploy");
    expect(workflow).not.toContain("wrangler rollback");
  });

  it("uses the canonical deployment assessor and refuses release/full-service overclaims", () => {
    expect(workflow).toContain("v3-deployment-rollback-evidence.ts");
    expect(workflow).toContain("assessV3DeploymentRollbackEvidence");
    expect(workflow).toContain('assessment.status !== "ready_for_qa_review"');
    expect(workflow).toContain("assessment.expectedCommitSha !== expectedSha");
    expect(workflow).toContain("assessment.evidenceCommitSha !== expectedSha");
    expect(workflow).toContain("assessment.certificationClaim !== false");
    expect(workflow).toContain("assessment.fullServiceRecoveryClaim !== false");
    expect(workflow).toContain("assessment.qaReviewRequired !== true");
  });

  it("retains both raw provider evidence and the exact-head assessment", () => {
    expect(workflow).toContain("/tmp/v3-s11-cloudflare-rollback.json");
    expect(workflow).toContain("/tmp/v3-s11-cloudflare-rollback-assessment.json");
    expect(workflow).toContain("v3-s11-cloudflare-rollback-evidence-${{ steps.source.outputs.sha }}");
    expect(workflow).toContain("if-no-files-found: error");
    expect(workflow).toContain("retention-days: 14");
  });
});
