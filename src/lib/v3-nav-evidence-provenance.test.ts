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
