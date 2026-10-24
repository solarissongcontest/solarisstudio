import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  resolve(process.cwd(), ".github/workflows/v3-s11-cloudflare-rollback-rehearsal.yml"),
  "utf8",
);

describe("System V3 S11 Cloudflare rollback workflow contract", () => {
  it("is manual-only and never runs provider mutation on PR/push events", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("pull_request:");
    expect(workflow).not.toContain("push:");
    expect(workflow).toContain("cancel-in-progress: false");
  });

  it("binds evidence to the exact workflow-dispatch commit", () => {
    expect(workflow).toContain("candidate_sha:");
    expect(workflow).toContain("DISPATCH_SHA: ${{ github.sha }}");
    expect(workflow).toContain("candidate_sha must equal the exact workflow-dispatch ref SHA");
    expect(workflow).toContain("git rev-parse HEAD");
    expect(workflow).toContain("git status --porcelain --untracked-files=all");
  });

  it("requires a dedicated non-production rollback Worker and explicit provider credentials", () => {
    expect(workflow).toContain("solaris-s11-rollback-");
    expect(workflow).toContain("Refusing production Worker");
    expect(workflow).toContain("CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}");
    expect(workflow).toContain("CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}");
    expect(workflow).not.toContain("SUPABASE_ACCESS_TOKEN");
    expect(workflow).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("uses repository-pinned Bun and the parent component rehearsal", () => {
    expect(workflow).toContain("oven-sh/setup-bun@v2");
    expect(workflow).toContain("bun-version: 1.2.19");
    expect(workflow).toContain("bash .github/scripts/v3-s11-cloudflare-rollback-rehearsal.sh");
    expect(workflow).toContain("SOLARIS_S11_ROLLBACK_EVIDENCE_PATH");
  });

  it("requires exact provider rollback evidence without widening it into certification", () => {
    expect(workflow).toContain("cloudflare_deployment_rollback_rehearsal");
    expect(workflow).toContain("isolated_cloudflare_worker");
    expect(workflow).toContain('evidence["wranglerVersion"] == "4.141.0"');
    expect(workflow).toContain('evidence["versions"]["rolledBackToVersionId"]');
    expect(workflow).toContain("rollbackDeploymentSingleVersion");
    expect(workflow).toContain("runtimeVersionMatchesBaseline");
    expect(workflow).toContain("runtimeMarkerMatchesBaseline");
    expect(workflow).toContain('len(evidence["artifactDigests"]) == 10');
    expect(workflow).toContain('evidence["issuesFound"] == []');
    expect(workflow).toContain('achieved["productionRpoClaim"] is False');
    expect(workflow).toContain('achieved["productionRtoClaim"] is False');
    expect(workflow).toContain('evidence["certificationClaim"] is False');
    expect(workflow).toContain('evidence["fullServiceRecoveryClaim"] is False');
    expect(workflow).toContain('evidence["qaReviewRequired"] is True');
  });

  it("retains a bounded exact-head evidence artifact", () => {
    expect(workflow).toContain("v3-s11-cloudflare-rollback-evidence-");
    expect(workflow).toContain("/tmp/v3-s11-cloudflare-rollback.json");
    expect(workflow).toContain("if-no-files-found: error");
    expect(workflow).toContain("retention-days: 14");
  });
});
