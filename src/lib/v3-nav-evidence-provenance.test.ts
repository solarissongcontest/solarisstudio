import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveNavbarEvidenceProvenance } from "../../e2e/v3-navigation/navbar-evidence-provenance";

const PR_HEAD = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TEST_MERGE = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const OTHER_HEAD = "cccccccccccccccccccccccccccccccccccccccc";

describe("installed V3 N14 evidence commit identity", () => {
  it("attributes PR captures to the checked-out PR head, never the synthetic GITHUB_SHA", () => {
    const resolved = resolveNavbarEvidenceProvenance({
      checkoutSha: PR_HEAD.toUpperCase(),
      workflowSha: TEST_MERGE,
      pullRequestHeadSha: PR_HEAD,
      eventName: "pull_request",
      ci: true,
    });

    expect(resolved).toEqual({
      candidateSha: PR_HEAD,
      workflowSha: TEST_MERGE,
      pullRequestHeadSha: PR_HEAD,
      exactHeadVerified: true,
    });
    expect(resolved.candidateSha).not.toBe(resolved.workflowSha);
  });

  it("rejects a stale or substituted checkout even when the workflow SHA looks valid", () => {
    expect(() =>
      resolveNavbarEvidenceProvenance({
        checkoutSha: OTHER_HEAD,
        workflowSha: TEST_MERGE,
        pullRequestHeadSha: PR_HEAD,
        eventName: "pull_request",
        ci: true,
      }),
    ).toThrow(/candidate does not match/);
  });

  it("rejects missing PR event identity and missing checked-out source in CI", () => {
    expect(() =>
      resolveNavbarEvidenceProvenance({
        checkoutSha: PR_HEAD,
        workflowSha: TEST_MERGE,
        pullRequestHeadSha: null,
        eventName: "pull_request",
        ci: true,
      }),
    ).toThrow(/requires the GitHub event/);

    expect(() =>
      resolveNavbarEvidenceProvenance({
        checkoutSha: null,
        workflowSha: TEST_MERGE,
        pullRequestHeadSha: PR_HEAD,
        eventName: "pull_request",
        ci: true,
      }),
    ).toThrow(/checked-out Git commit/);
  });

  it("binds both installed navigation reports to source identity and refuses headless N14 certification", () => {
    const geometry = readFileSync(resolve(process.cwd(), "e2e/v3-navigation/geometry-report-installed-app.e2e.ts"), "utf8");
    const frame = readFileSync(resolve(process.cwd(), "e2e/v3-navigation/frame-profile-installed-app.e2e.ts"), "utf8");
    for (const evidenceSource of [geometry, frame]) {
      expect(evidenceSource).toContain("...readNavbarEvidenceProvenance()");
      expect(evidenceSource).not.toContain("candidateSha: process.env.GITHUB_SHA");
    }
    // Geometry audits must reject BOTH hosted Supabase and a hosted app URL.
    expect(geometry).toContain("const appOrigin = new URL(baseURL)");
    expect(geometry).toContain('appOrigin.protocol !== "http:"');
    expect(geometry).toContain('!["127.0.0.1", "localhost"].includes(appOrigin.hostname)');
    expect(geometry).toContain("Refusing V3 geometry evidence against non-local app");
    expect(frame).toContain("automatedCadenceCheckEligible: cadenceSufficient");
    expect(frame).toContain("certificationEligible: false");
    expect(frame).toContain('physicalDeviceGate: "N14-required"');
    expect(frame).not.toContain("certificationEligible: cadenceSufficient");
  });

  it("reports a non-PR checkout truthfully without inventing a reviewed N0/N14 identity", () => {
    const manual = resolveNavbarEvidenceProvenance({
      checkoutSha: PR_HEAD,
      workflowSha: PR_HEAD,
      pullRequestHeadSha: null,
      eventName: "workflow_dispatch",
      ci: true,
    });
    expect(manual.candidateSha).toBe(PR_HEAD);
    expect(manual.exactHeadVerified).toBeNull();

    const local = resolveNavbarEvidenceProvenance({
      checkoutSha: undefined,
      workflowSha: undefined,
      pullRequestHeadSha: undefined,
      eventName: undefined,
      ci: false,
    });
    expect(local).toEqual({
      candidateSha: null,
      workflowSha: null,
      pullRequestHeadSha: null,
      exactHeadVerified: null,
    });
  });
});
