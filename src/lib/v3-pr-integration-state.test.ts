import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildV3PrIntegrationReport,
  formatV3PrIntegrationReportMarkdown,
  type V3PrIntegrationCandidate,
} from "./v3-pr-integration-state";

const MAIN_SHA = "1111111111111111111111111111111111111111";
const HEAD_SHA = "2222222222222222222222222222222222222222";
const OLD_SHA = "3333333333333333333333333333333333333333";

function candidate(
  overrides: Partial<V3PrIntegrationCandidate> = {},
): V3PrIntegrationCandidate {
  return {
    number: 100,
    title: "[V3-QA] Candidate",
    headRef: "v3/qa-candidate",
    baseRef: "main",
    headSha: HEAD_SHA,
    mergeable: true,
    behindMainBy: 0,
    requiredChecks: ["Quality", "Browser Audit", "V3 S13 Migration Adoption"],
    checks: [
      {
        name: "Quality",
        headSha: HEAD_SHA,
        status: "completed",
        conclusion: "success",
      },
      {
        name: "Browser Audit",
        headSha: HEAD_SHA,
        status: "completed",
        conclusion: "success",
      },
      {
        name: "V3 S13 Migration Adoption",
        headSha: HEAD_SHA,
        status: "completed",
        conclusion: "success",
      },
    ],
    ...overrides,
  };
}

function reportFor(...candidates: V3PrIntegrationCandidate[]) {
  return buildV3PrIntegrationReport({
    repository: "solarissongcontest/solarisstudio",
    mainSha: MAIN_SHA,
    candidates,
  });
}

describe("V3 current-PR integration state", () => {
  it("recognizes exact-head evidence only when current-main drift is zero", () => {
    const report = reportFor(candidate());

    expect(report.candidates[0]?.state).toBe("exact_head_verified");
    expect(report.candidates[0]?.exactHeadChecksPassed).toEqual([
      "Quality",
      "Browser Audit",
      "V3 S13 Migration Adoption",
    ]);
    expect(report.certificationClaim).toBe(false);
    expect(report.mergeAuthorizationClaim).toBe(false);
    expect(report.productionTrafficGenerated).toBe(false);
  });

  it("requires reconciliation before trusting old green checks on a behind-main branch", () => {
    const report = reportFor(candidate({ behindMainBy: 9 }));

    expect(report.candidates[0]?.state).toBe("needs_reconcile");
    expect(report.candidates[0]?.blockers[0]).toMatch(/9 commits behind current main/);
  });

  it("fails closed when current-main ancestry has not been measured", () => {
    const report = reportFor(candidate({ behindMainBy: null }));

    expect(report.candidates[0]?.state).toBe("main_sync_unknown");
    expect(report.candidates[0]?.blockers[0]).toMatch(/has not been measured/);
  });

  it("fails closed while GitHub mergeability is still unknown", () => {
    const report = reportFor(candidate({ mergeable: null }));

    expect(report.candidates[0]?.state).toBe("mergeability_unknown");
    expect(report.candidates[0]?.blockers[0]).toMatch(/mergeability.*still unknown/i);
  });

  it("rejects successful checks from a stale head SHA", () => {
    const checks = candidate().checks.map((check) =>
      check.name === "Quality" ? { ...check, headSha: OLD_SHA } : check,
    );
    const report = reportFor(candidate({ checks }));

    expect(report.candidates[0]?.state).toBe("stale_evidence");
    expect(report.candidates[0]?.staleChecks).toEqual(["Quality"]);
    expect(report.candidates[0]?.exactHeadChecksPassed).not.toContain("Quality");
  });

  it("distinguishes missing, failed and pending exact-head evidence", () => {
    const missing = candidate({
      number: 201,
      checks: candidate().checks.filter((check) => check.name !== "Browser Audit"),
    });
    const failed = candidate({
      number: 202,
      checks: candidate().checks.map((check) =>
        check.name === "Quality" ? { ...check, conclusion: "failure" as const } : check,
      ),
    });
    const pending = candidate({
      number: 203,
      checks: candidate().checks.map((check) =>
        check.name === "Quality"
          ? { ...check, status: "in_progress" as const, conclusion: null }
          : check,
      ),
    });
    const report = reportFor(missing, failed, pending);

    expect(report.candidates.find((row) => row.number === 201)?.state).toBe(
      "missing_evidence",
    );
    expect(report.candidates.find((row) => row.number === 202)?.state).toBe(
      "ci_failed",
    );
    expect(report.candidates.find((row) => row.number === 203)?.state).toBe(
      "ci_pending",
    );
  });

  it("classifies valid GitHub stale/startup conclusions as failed evidence", () => {
    for (const conclusion of ["stale", "startup_failure"] as const) {
      const checks = candidate().checks.map((check) =>
        check.name === "Quality" ? { ...check, conclusion } : check,
      );
      const report = reportFor(candidate({ checks }));
      expect(report.candidates[0]?.state).toBe("ci_failed");
      expect(report.candidates[0]?.failedChecks).toContain("Quality");
    }
  });

  it("keeps open stack dependencies ahead of child exact-head checks", () => {
    const report = reportFor(
      candidate({
        number: 300,
        baseRef: "v3/sys-parent",
        dependencies: [{ number: 299, state: "open", headSha: OLD_SHA }],
      }),
    );

    expect(report.candidates[0]?.state).toBe("waiting_dependency");
    expect(report.candidates[0]?.openDependencies).toEqual([299]);
  });

  it("requires a stacked child to reconcile onto main after its dependencies are no longer open", () => {
    const report = reportFor(
      candidate({
        number: 310,
        baseRef: "v3/sys-parent",
        dependencies: [{ number: 309, state: "merged", headSha: OLD_SHA }],
      }),
    );

    expect(report.candidates[0]?.state).toBe("stacked_reconcile_required");
    expect(report.candidates[0]?.blockers[0]).toMatch(/reconcile this exact delta onto current main/);
  });

  it("blocks a child whose declared dependency closed without merge", () => {
    const report = reportFor(
      candidate({
        number: 320,
        dependencies: [{ number: 319, state: "closed", headSha: OLD_SHA }],
      }),
    );

    expect(report.candidates[0]?.state).toBe("blocked_dependency");
    expect(report.candidates[0]?.closedUnmergedDependencies).toEqual([319]);
  });

  it("reports an actual merge conflict before CI status", () => {
    const report = reportFor(candidate({ mergeable: false }));

    expect(report.candidates[0]?.state).toBe("merge_conflict");
  });

  it("does not convert exact-head verification into merge or release certification", () => {
    const report = reportFor(candidate());
    const markdown = formatV3PrIntegrationReportMarkdown(report);

    expect(markdown).toContain("exact_head_verified");
    expect(markdown).toContain("not permission to merge");
    expect(markdown).toContain("not S16 release certification");
    expect(report.mergeAuthorizationClaim).toBe(false);
    expect(report.certificationClaim).toBe(false);
  });

  it("rejects empty or malformed integration requirements instead of guessing", () => {
    expect(() => reportFor(candidate({ requiredChecks: [] }))).toThrow(/no required checks/);

    expect(() =>
      reportFor(
        candidate({
          dependencies: [
            {
              number: 99,
              state: "mystery" as unknown as "open",
              headSha: OLD_SHA,
            },
          ],
        }),
      ),
    ).toThrow(/dependency #99 has invalid state/);

    expect(() =>
      reportFor(
        candidate({
          checks: [
            {
              name: "Quality",
              headSha: HEAD_SHA,
              status: "mystery" as unknown as "completed",
              conclusion: "success",
            },
            ...candidate().checks.filter((check) => check.name !== "Quality"),
          ],
        }),
      ),
    ).toThrow(/check Quality has invalid status/);
  });

  it("rejects malformed or ambiguous evidence rather than guessing", () => {
    expect(() =>
      buildV3PrIntegrationReport({
        repository: "solarissongcontest/solarisstudio",
        mainSha: "wrong",
        candidates: [],
      }),
    ).toThrow(/exact 40-character SHA/);

    expect(() =>
      reportFor(
        candidate({
          requiredChecks: ["Quality", "Quality"],
        }),
      ),
    ).toThrow(/duplicate required check names/);

    expect(() =>
      reportFor(
        candidate({
          checks: [candidate().checks[0]!, candidate().checks[0]!],
        }),
      ),
    ).toThrow(/duplicate check evidence names/);
  });

  it("keeps the evaluator and CLI local/read-only with no Supabase or arbitrary HTTP client", () => {
    const implementation = readFileSync("src/lib/v3-pr-integration-state.ts", "utf8");
    const cli = readFileSync("scripts/check-v3-pr-integration-state.ts", "utf8");
    const source = `${implementation}\n${cli}`;

    expect(source).not.toMatch(/@supabase|createClient|supabase\.co/i);
    expect(source).not.toMatch(/\bfetch\s*\(|node:https|node:http/);
  });
});
