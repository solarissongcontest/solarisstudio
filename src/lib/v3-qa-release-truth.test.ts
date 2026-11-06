import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { assertV3QaEvidenceCheckoutIdentity, assessV3QaReleaseTruth } from "./v3-qa-release-truth";
import { V3_S14_STAGES, V3_S14_INVARIANTS, V3_S14_FAILURE_INJECTIONS, V3_S14_SEED_CONTRACT } from "../../scripts/v3-s14-full-contest-spec";

const roots: string[] = [];
const SHA = "a".repeat(40);
const OTHER_SHA = "b".repeat(40);

const S16_EXPECTED = [
  ["canonical-ci", "s16-canonical-ci.json"],
  ["migration-rehearsal", "s16-migration-rehearsal.json"],
  ["authorization-security", "s16-authorization-security.json"],
  ["production-isolation", "s16-production-isolation.json"],
  ["system-hardening", "s16-system-hardening.json"],
  ["public-acceptance", "s16-public-acceptance.json"],
  ["organizer-acceptance", "s16-organizer-acceptance.json"],
  ["navigation-acceptance", "s16-navigation-acceptance.json"],
  ["accessibility", "s16-accessibility.json"],
  ["responsive-behavior", "s16-responsive-behavior.json"],
  ["full-contest-rehearsal", "s14-full-contest.json"],
  ["registry-zero-gap", "s15-zero-orphan.json"],
] as const;

function s16() {
  return { schemaVersion: 1, candidateSha: SHA, certified: true,
    categories: S16_EXPECTED.map(([id, evidenceFilename]) => ({ id, evidenceFilename, evidenceCandidateSha: SHA, passed: true })) };
}

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
    completedStages: V3_S14_STAGES.map((entry) => entry.id),
    pendingStages: [],
    completedContestExtensions: [
      "grand-final-qualifier-bridge",
      "grand-final-voting",
      "grand-final-results",
      "grand-final-publication",
    ],
    pendingContestExtensions: [],
    blockedContestExtensions: [],
    implementedInvariants: V3_S14_INVARIANTS.map((entry) => entry.id),
    implementedFailureInjections: V3_S14_FAILURE_INJECTIONS.map((entry) => entry.id),
    seed: { editionCount: V3_S14_SEED_CONTRACT.editionCount, delegationCount: V3_S14_SEED_CONTRACT.delegationCount, showCount: V3_S14_SEED_CONTRACT.minimumShowCount },
    runIdentity: { candidateSha: SHA, editionId: "local-test-edition", databaseFingerprint: "isolated-test-db" },
    lifecycle: { finalState: "archived" },
  };
}

function s15() {
  return {
    schemaVersion: 4,
    candidateSha: SHA,
    zeroOrphans: true,
    inventory: { domains: 1 },
    findings: [],
    physicalOwnership: { zeroOwnershipConflicts: true, findings: [] },
  };
}

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("V3 QA checkout identity", () => {
  it("rejects stale or malformed environment SHAs instead of certifying unrelated Git source", () => {
    expect(assertV3QaEvidenceCheckoutIdentity(SHA, {})).toBe(SHA);
    expect(assertV3QaEvidenceCheckoutIdentity(SHA.toUpperCase(), {
      candidateSha: SHA.toUpperCase(), githubSha: SHA,
    })).toBe(SHA);
    expect(() => assertV3QaEvidenceCheckoutIdentity(SHA, { candidateSha: OTHER_SHA }))
      .toThrow("does not match checked-out Git HEAD");
    expect(() => assertV3QaEvidenceCheckoutIdentity(SHA, { githubSha: OTHER_SHA }))
      .toThrow("does not match checked-out Git HEAD");
    expect(() => assertV3QaEvidenceCheckoutIdentity(SHA, { candidateSha: "refs/heads/main" }))
      .toThrow("must contain one exact 40-character commit SHA");
    expect(() => assertV3QaEvidenceCheckoutIdentity("invalid", {}))
      .toThrow("Checked-out Git HEAD must be one exact 40-character commit SHA");
  });
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
    expect(truth.phases.find((phase) => phase.id === "S16")?.state).toBe("invalid");
    expect(truth.invalidEvidence.join("\\n")).toContain("complete S16 category contract");
    expect(truth.readyForS16).toBe(false);
    expect(truth.certified).toBe(false);
  });

  it("marks the exact candidate certified only after S10 through S16 all pass", () => {
    const dir = root();
    writeJson(dir, "s16-system-hardening.json", hardening());
    writeJson(dir, "s14-full-contest.json", s14());
    writeJson(dir, "s15-zero-orphan.json", s15());
    writeJson(dir, "s16-certification.json", s16());
    const truth = assessV3QaReleaseTruth(SHA, dir);
    expect(truth.readyForS16).toBe(true);
    expect(truth.certified).toBe(true);
    expect(truth.invalidEvidence).toEqual([]);
    expect(truth.missingEvidence).toEqual([]);
  });

  it("rejects missing, duplicate, renamed, and stale S16 categories", () => {
    const dir = root();
    const valid = s16();
    expect(valid.categories).toHaveLength(12);
    writeJson(dir, "s16-certification.json", { ...valid, categories: valid.categories.slice(1) });
    let truth = assessV3QaReleaseTruth(SHA, dir);
    expect(truth.phases.find((phase) => phase.id === "S16")?.state).toBe("invalid");
    expect(truth.invalidEvidence.join("\\n")).toContain("complete S16 category contract");

    writeJson(dir, "s16-certification.json", { ...valid, categories: [...valid.categories.slice(1), valid.categories[1]] });
    truth = assessV3QaReleaseTruth(SHA, dir);
    expect(truth.invalidEvidence.join("\\n")).toContain("exactly one canonical-ci release gate");

    writeJson(dir, "s16-certification.json", { ...valid, categories: valid.categories.map((entry, i) => i === 0 ? { ...entry, evidenceFilename: "wrong.json", evidenceCandidateSha: OTHER_SHA } : entry) });
    truth = assessV3QaReleaseTruth(SHA, dir);
    expect(truth.invalidEvidence.join("\\n")).toContain("incomplete or stale canonical-ci gate evidence");
  });

  it("rejects apparently successful S14 evidence missing real lifecycle or failure-injection coverage", () => {
    const dir = root();
    writeJson(dir, "s14-full-contest.json", { ...s14(), completedStages: ["stage-10-archive"] });
    let truth = assessV3QaReleaseTruth(SHA, dir);
    expect(truth.phases.find((phase) => phase.id === "S14")?.state).toBe("invalid");
    expect(truth.invalidEvidence.join("\\n")).toContain("every ordered lifecycle stage");

    writeJson(dir, "s14-full-contest.json", { ...s14(), implementedFailureInjections: [] });
    truth = assessV3QaReleaseTruth(SHA, dir);
    expect(truth.invalidEvidence.join("\\n")).toContain("required integrity or recovery rehearsal coverage");
  });

  it("rejects zero-orphan claims without the canonical S15 inventory", () => {
    const dir = root();
    const { inventory, ...shallow } = s15();
    writeJson(dir, "s15-zero-orphan.json", shallow);
    const truth = assessV3QaReleaseTruth(SHA, dir);
    expect(truth.phases.find((phase) => phase.id === "S15")?.state).toBe("invalid");
    expect(truth.invalidEvidence.join("\\n")).toContain("S15 inventory contract");
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
