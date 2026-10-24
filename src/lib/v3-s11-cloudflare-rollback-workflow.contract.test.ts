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
  it("is manual-only and binds the provider drill to the exact dispatch SHA", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("pull_request:");
    expect(workflow).toContain("ref: ${{ github.sha }}");
    expect(workflow).toContain("EVENT_SOURCE_SHA: ${{ github.sha }}");
    expect(workflow).toContain("git rev-parse HEAD");
    expect(workflow).toContain("Refusing retained provider evidence from a dirty checkout");
    expect(workflow).toContain("permissions:\n  contents: read");
  });

  it("serializes mutation of one dedicated non-production Worker namespace", () => {
    expect(workflow).toContain("group: v3-s11-cloudflare-rollback-provider");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("solaris-s11-rollback-*");
    expect(workflow).toContain("^solaris-s11-rollback-[a-z0-9]");
    expect(workflow).toContain("Refusing production Cloudflare Worker 'studio'");
    expect(workflow).toContain("Worker name exceeds the 63-character safety bound");
  });

  it("executes the canonical component rehearsal without a Supabase credential path", () => {
    expect(workflow).toContain("CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}");
    expect(workflow).toContain("CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}");
    expect(workflow).toContain("SOLARIS_S11_ROLLBACK_WORKER: ${{ inputs.worker_name }}");
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
    expect(workflow).toContain("v3-s11-cloudflare-rollback-evidence-${{ github.sha }}");
    expect(workflow).toContain("if-no-files-found: error");
    expect(workflow).toContain("retention-days: 14");
  });
});
