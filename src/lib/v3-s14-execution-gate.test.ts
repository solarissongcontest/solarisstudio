import { describe, expect, it } from "vitest";
import { assessS14Execution } from "../../scripts/lib/v3-s14-execution-gate";
import { buildV3ReleaseRiskReport } from "./v3-release-risk";
import type { Outcome } from "../../scripts/lib/v3-release-preflight";
const sha = "a".repeat(40);
const pass = (): Outcome => ({ status: "pass", exitCode: 0, findings: [] });
function checks(
  findings: string[] = [],
  inventory: Parameters<typeof buildV3ReleaseRiskReport>[1] = [],
): Record<string, Outcome> {
  const releaseRisk = buildV3ReleaseRiskReport(findings, inventory);
  return {
    productionIsolation: pass(),
    migrationAdoption: pass(),
    repositoryReleaseReadiness: {
      status: findings.length ? "fail" : "pass",
      exitCode: findings.length ? 1 : 0,
      findings,
      report: { candidateSha: sha, findings, releaseRisk },
    },
    s15ZeroOrphan: pass(),
    s16Authority: { ...pass(), report: { candidateSha: sha, s16Passed: true, findings: [] } },
  } satisfies Record<string, Outcome>;
}
describe("S14 execution risk gate", () => {
  it("blocks security hard blockers", () => {
    expect(
      assessS14Execution(sha, checks(["DOMAIN_CONSEQUENCE_DECLARED session.revoked owner=session"]))
        .allowed,
    ).toBe(false);
  });
  it("blocks unauthorized canonical writers even when the inventory is green", () => {
    const input = checks();
    input.s16Authority = {
      ...pass(),
      report: { candidateSha: sha, s16Passed: false, findings: ["unauthorized writer"] },
    };
    expect(assessS14Execution(sha, input).allowed).toBe(false);
  });
  it("blocks failed migration adoption and production isolation", () => {
    for (const id of ["migrationAdoption", "productionIsolation"] as const) {
      const input = checks();
      input[id] = { status: "fail", exitCode: 1, findings: [id] };
      expect(assessS14Execution(sha, input).allowed).toBe(false);
    }
  });
  it("fails closed on unknown high-risk findings", () => {
    expect(assessS14Execution(sha, checks(["UNKNOWN_AUTHORITY unknown-writer"])).allowed).toBe(
      false,
    );
  });
  it.each(["edition.transitioned", "public_ux.observed", "activity.projected"])(
    "allows classified derived/observational debt for %s while retaining the inventory",
    (event) => {
      const input = checks([`DOMAIN_CONSEQUENCE_DECLARED ${event} owner=derived`]);
      const result = assessS14Execution(sha, input);
      expect(result.allowed).toBe(true);
      expect(result.releaseReady).toBe(false);
      expect(input.repositoryReleaseReadiness.findings).toHaveLength(1);
    },
  );
  it("allows an explicitly obsolete/replaced finding", () => {
    const finding = "PUBLIC_CUTOVER_UNRESOLVED old:building";
    expect(
      assessS14Execution(
        sha,
        checks([finding], [{ exactFinding: finding, classification: "obsolete_replaced" }]),
      ).allowed,
    ).toBe(true);
  });
  it("rejects missing/stale authority and malformed/unclassified inventory evidence", () => {
    const input = checks();
    input.s16Authority = {
      ...pass(),
      report: { candidateSha: "b".repeat(40), s16Passed: true, findings: [] },
    };
    expect(assessS14Execution(sha, input).allowed).toBe(false);
    const missing = checks();
    delete (missing as Record<string, Outcome>).s16Authority;
    expect(assessS14Execution(sha, missing).allowed).toBe(false);
    const unknown = checks();
    unknown.s15ZeroOrphan = { status: "fail", exitCode: 1, findings: ["unclassified"] };
    expect(assessS14Execution(sha, unknown).allowed).toBe(false);
  });
});
