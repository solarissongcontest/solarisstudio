import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { assessV3QaReleaseTruth } from "./v3-qa-release-truth";

const roots: string[] = [];
const SHA = "a".repeat(40);
const OTHER_SHA = "b".repeat(40);

function root() {
  const path = mkdtempSync(join(tmpdir(), "v3-qa-release-truth-"));
  roots.push(path);
  return path;
}

function writeJson(dir: string, filename: string, value: unknown) {
  writeFileSync(join(dir, filename), `${JSON.stringify(value, null, 2)}\n`);
}

function source() {
  return {
    artifact: "phase-evidence.json",
    sha256: "c".repeat(64),
    workflow: "V3 exact-SHA phase evidence",
    runId: 123,
    runAttempt: 1,
    conclusion: "success",
    headSha: SHA,
  };
}

function hardening() {
  return {
    schemaVersion: 1,
    certificationClaim: false,
    unresolvedBlockers: [],
    phases: ["S10", "S11", "S12", "S13"].map((id) => ({
      id,
      candidateSha: SHA,
      passed: true,
      blockers: [],
      sources: [source()],
    })),
  };
}

function s14() {
  return {
    candidateSha: SHA,
    passed: true,
    partial: false,
    runtimeFailure: false,
    pendingStages: [],
    pendingContestExtensions: [],
    blockedContestExtensions: [],
    lifecycle: { finalState: "archived" },
  };
}

function s15() {
  return {
    schemaVersion: 4,
    candidateSha: SHA,
    zeroOrphans: true,
    findings: [],
    physicalOwnership: { zeroOwnershipConflicts: true },
  };
}

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("V3 QA exact-SHA release truth", () => {
  it("reports absent runtime evidence without inventing completion", () => {
    const truth = assessV3QaReleaseTruth(SHA, root());
    expect(truth.readyForS16).toBe(false);
    expect(truth.certified).toBe(false);
    expect(truth.invalidEvidence).toEqual([]);
    expect(truth.missingEvidence).toEqual(["S10", "S11", "S12", "S13", "S14", "S15", "S16"]);
  });

  it("binds System hardening phases to exact successful source-run evidence", () => {
    const dir = root();
    writeJson(dir, "s16-system-hardening.json", hardening());
    const truth = assessV3QaReleaseTruth(SHA, dir);
    expect(truth.phases.slice(0, 4).map((phase) => phase.state)).toEqual(["passed", "passed", "passed", "passed"]);

    const wrong = hardening();
    wrong.phases[2]!.sources[0]!.headSha = OTHER_SHA;
    writeJson(dir, "s16-system-hardening.json", wrong);
    const rejected = assessV3QaReleaseTruth(SHA, dir);
    expect(rejected.phases.find((phase) => phase.id === "S12")?.state).toBe("invalid");
    expect(rejected.invalidEvidence.join("\n")).toContain("not exact candidate");
  });

  it("requires release-grade S14 and zero-orphan S15 semantics", () => {
    const dir = root();
    writeJson(dir, "s14-full-contest.json", { ...s14(), partial: true });
    writeJson(dir, "s15-zero-orphan.json", { ...s15(), findings: [{ code: "ORPHAN" }] });
    const truth = assessV3QaReleaseTruth(SHA, dir);
    expect(truth.phases.find((phase) => phase.id === "S14")?.state).toBe("invalid");
    expect(truth.phases.find((phase) => phase.id === "S15")?.state).toBe("invalid");
    expect(truth.readyForS16).toBe(false);
  });

  it("rejects legacy S15 evidence that omits physical-ownership certification", () => {
    const dir = root();
    writeJson(dir, "s15-zero-orphan.json", {
      candidateSha: SHA,
      schemaVersion: 3,
      zeroOrphans: true,
      findings: [],
    });
    const truth = assessV3QaReleaseTruth(SHA, dir);
    const phase = truth.phases.find((item) => item.id === "S15");
    expect(phase?.state).toBe("invalid");
    expect(phase?.issues.join("\n")).toContain("schemaVersion must be >= 4");
    expect(phase?.issues.join("\n")).toContain("physical ownership is not conflict-free");
  });

  it("does not let a standalone S16 certificate impersonate completed prerequisites", () => {
    const dir = root();
    writeJson(dir, "s16-certification.json", { candidateSha: SHA, certified: true });
    const truth = assessV3QaReleaseTruth(SHA, dir);
    expect(truth.phases.find((phase) => phase.id === "S16")?.state).toBe("passed");
    expect(truth.readyForS16).toBe(false);
    expect(truth.certified).toBe(false);
  });

  it("marks the exact candidate certified only after S10 through S16 all pass", () => {
    const dir = root();
    writeJson(dir, "s16-system-hardening.json", hardening());
    writeJson(dir, "s14-full-contest.json", s14());
    writeJson(dir, "s15-zero-orphan.json", s15());
    writeJson(dir, "s16-certification.json", { candidateSha: SHA, certified: true });
    const truth = assessV3QaReleaseTruth(SHA, dir);
    expect(truth.readyForS16).toBe(true);
    expect(truth.certified).toBe(true);
    expect(truth.invalidEvidence).toEqual([]);
    expect(truth.missingEvidence).toEqual([]);
  });

  it("rejects evidence for a different candidate SHA", () => {
    const dir = root();
    writeJson(dir, "s14-full-contest.json", { ...s14(), candidateSha: OTHER_SHA });
    const truth = assessV3QaReleaseTruth(SHA, dir);
    expect(truth.phases.find((phase) => phase.id === "S14")?.state).toBe("invalid");
    expect(truth.invalidEvidence.join("\n")).toContain(OTHER_SHA);
    expect(truth.invalidEvidence.join("\n")).toContain(SHA);
  });
});
