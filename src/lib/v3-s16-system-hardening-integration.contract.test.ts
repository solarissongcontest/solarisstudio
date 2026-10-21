import { describe, expect, it } from "vitest";
import { V3_S16_SYSTEM_HARDENING_PHASES } from "./v3-s16-system-hardening-evidence";
import { validateV3S16CategorySourceEvidence } from "./v3-s16-evidence-validation";

const SHA = "a".repeat(40);

function evidence() {
  return {
    schemaVersion: 1,
    candidateSha: SHA,
    passed: true,
    certificationClaim: false,
    unresolvedBlockers: [],
    phases: V3_S16_SYSTEM_HARDENING_PHASES.map((id, index) => ({
      id,
      candidateSha: SHA,
      passed: true,
      blockers: [],
      sources: [
        {
          artifact: `${id.toLowerCase()}-release-evidence.json`,
          sha256: "b".repeat(64),
          workflow: `V3 ${id} exact-SHA evidence`,
          runId: 200 + index,
          runAttempt: 1,
          headSha: SHA,
          conclusion: "success",
        },
      ],
    })),
  };
}

describe("S16 System hardening category integration", () => {
  it("routes system-hardening through the semantic S10-S13 validator", () => {
    expect(validateV3S16CategorySourceEvidence("system-hardening", evidence(), SHA)).toEqual([]);
  });

  it("does not accept a hand-authored passed=true shell without phase proof", () => {
    const issues = validateV3S16CategorySourceEvidence(
      "system-hardening",
      { schemaVersion: 1, candidateSha: SHA, passed: true },
      SHA,
    );
    expect(issues).toContain(
      "system-hardening: component evidence must explicitly set certificationClaim=false",
    );
    expect(issues).toContain("system-hardening: unresolvedBlockers must be a string array");
    expect(issues).toContain("system-hardening: phases must be an array");
  });
});
