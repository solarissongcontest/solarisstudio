import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  auditV3CapabilityEvidence,
  buildV3CapabilityEvidenceIntegrityReport,
  parseV3MigrationEvidence,
} from "../../scripts/check-v3-capability-evidence-integrity";

describe("V3 capability evidence integrity", () => {
  it("normalizes semicolon-delimited evidence references", () => {
    expect(parseV3MigrationEvidence(" src/a.ts ; ; scripts/b.ts; ")).toEqual([
      "src/a.ts",
      "scripts/b.ts",
    ]);
  });

  it("treats final migration state without evidence as a status-integrity violation", () => {
    const row = auditV3CapabilityEvidence({
      surface: "public",
      capabilityId: "example",
      declaredStatus: "cutover",
    });

    expect(row.evidenceRequired).toBe(true);
    expect(row.evidenceStatus).toBe("missing");
    expect(row.statusIntegrityViolation).toBe(true);
    expect(row.ownerLane).toBe("Session 2 — Public");
  });

  it("does not require parity evidence from capabilities that are still building", () => {
    const row = auditV3CapabilityEvidence({
      surface: "organizer",
      capabilityId: "example",
      declaredStatus: "building",
    });

    expect(row.evidenceRequired).toBe(false);
    expect(row.evidenceStatus).toBe("not-required");
    expect(row.statusIntegrityViolation).toBe(false);
    expect(row.ownerLane).toBe("Session 3 — Organizer");
  });

  it("requires every repository evidence path to exist", () => {
    const existing = new Set(["src/evidence.test.ts", "scripts/rehearsal.sh"]);
    const complete = auditV3CapabilityEvidence(
      {
        surface: "public",
        capabilityId: "complete",
        declaredStatus: "parity",
        migrationEvidence: "src/evidence.test.ts; scripts/rehearsal.sh",
      },
      (path) => existing.has(path),
    );
    const partial = auditV3CapabilityEvidence(
      {
        surface: "organizer",
        capabilityId: "partial",
        declaredStatus: "cutover",
        migrationEvidence: "src/evidence.test.ts; scripts/missing.sh",
      },
      (path) => existing.has(path),
    );

    expect(complete.evidenceStatus).toBe("complete");
    expect(complete.statusIntegrityViolation).toBe(false);
    expect(partial.evidenceStatus).toBe("partial");
    expect(partial.missingRepositoryEvidence).toEqual(["scripts/missing.sh"]);
    expect(partial.statusIntegrityViolation).toBe(true);
  });

  it("audits the live aggregate registries without inventing completion from route existence", () => {
    const report = buildV3CapabilityEvidenceIntegrityReport(() => true);

    expect(report.summary.publicCapabilities).toBeGreaterThan(0);
    expect(report.summary.organizerCapabilities).toBeGreaterThan(0);
    expect(report.summary.evidenceRequired).toBeGreaterThan(0);
    expect(report.invariant).toContain("parity/cutover/retired");
  });

  it("keeps Quality wired to coordinator integration PRs and exact-tree evidence enforcement", () => {
    const quality = readFileSync(resolve(process.cwd(), ".github/workflows/ci.yml"), "utf8");

    expect(quality).toContain("v3/1629-integration-chat8");
    expect(quality).toContain(
      "scripts/check-v3-capability-evidence-integrity.ts --json > v3-integration-evidence/v3-capability-evidence-integrity.json",
    );
    expect(quality).toContain(
      "scripts/check-v3-capability-evidence-integrity.ts --require-complete",
    );
    expect(quality).toContain("V3 capability parity/cutover evidence integrity");
  });
});
