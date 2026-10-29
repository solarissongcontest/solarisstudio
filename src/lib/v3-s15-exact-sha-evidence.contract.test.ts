import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const builder = readFileSync("scripts/build-v3-s15-zero-orphan-evidence.ts", "utf8");
const readiness = readFileSync("scripts/check-v3-s15-zero-orphan-readiness.ts", "utf8");
const releaseIntegrity = readFileSync("scripts/check-v3-release-integrity.ts", "utf8");
const preflight = readFileSync(".github/workflows/v3-release-candidate-preflight.yml", "utf8");

describe("S15 exact-SHA zero-orphan release evidence", () => {
  it("binds evidence to the literal checked-out candidate SHA", () => {
    expect(builder).toContain("V3_CANDIDATE_SHA");
    expect(builder).toContain('git", ["rev-parse", "HEAD"]');
    expect(builder).toContain("must be one exact 40-character Git commit SHA");
    expect(builder).toContain("does not match checked-out SHA");
    expect(builder).toContain("candidateSha: requestedCandidateSha");
  });

  it("derives evidence from canonical scanners rather than duplicating ownership logic", () => {
    expect(builder).toContain("check-v3-s15-zero-orphan-readiness.ts");
    expect(builder).toContain('"--json"');
    expect(builder).toContain('typeof readiness.zeroOrphans !== "boolean"');
    expect(readiness).toContain("PUBLIC_CUTOVER_UNRESOLVED");
    expect(readiness).toContain("ORGANIZER_CUTOVER_UNRESOLVED");
    expect(readiness).toContain("RUNTIME_API_ROUTE_ORPHAN");
    expect(readiness).toContain("check-v3-s15-physical-ownership.ts");
    expect(readiness).toContain("PHYSICAL_OWNERSHIP_CONFLICT");
    expect(readiness).toContain("zeroOwnershipConflicts");
    expect(readiness).toContain("uniquePhysicalTables");
    expect(readiness).toContain("explicitlySharedTables");
  });

  it("fails closed on malformed physical ownership evidence", () => {
    expect(readiness).toContain("S15 physical-ownership output was not valid JSON");
    expect(readiness).toContain("S15 physical-ownership output did not match the expected report contract");
    expect(readiness).toContain("S15 physical-ownership scan failed without diagnostics");
    expect(readiness).toContain('typeof physicalOwnership.schemaVersion !== "number"');
  });

  it("cannot report zero orphans when a canonical scanner summary contradicts its findings", () => {
    expect(readiness).toContain("CORE_READINESS_CONFLICT");
    expect(readiness).toContain("core.zeroOrphans !== (core.findings.length === 0)");
    expect(readiness).toContain(
      "physicalOwnership.zeroOwnershipConflicts !== (physicalOwnership.findings.length === 0)",
    );
    expect(readiness).toContain("core.zeroOrphans &&");
    expect(readiness).toContain("physicalOwnership.zeroOwnershipConflicts &&");
    expect(readiness).toContain("findings.length === 0");
    expect(readiness).toContain("if (requireZero && !report.zeroOrphans) process.exit(1)");
  });

  it("refuses to materialize a green exact-SHA artifact from incomplete or contradictory readiness output", () => {
    expect(builder).toContain('typeof readiness.schemaVersion !== "number"');
    expect(builder).toContain('typeof readiness.inventory !== "object"');
    expect(builder).toContain('typeof physicalOwnership.schemaVersion !== "number"');
    expect(builder).toContain('typeof physicalOwnership.zeroOwnershipConflicts !== "boolean"');
    expect(builder).toContain("S15 readiness claimed zeroOrphans=true while retaining findings");
    expect(builder).toContain(
      "S15 readiness claimed zeroOrphans=true while physical ownership is not conflict-free",
    );
  });

  it("writes the exact release artifact consumed by release integrity", () => {
    expect(builder).toContain('"s15-zero-orphan.json"');
    expect(builder).toContain("V3_RELEASE_EVIDENCE_DIR");
    expect(releaseIntegrity).toContain('"s15-zero-orphan.json"');
    expect(releaseIntegrity).toContain("evidence.zeroOrphans !== true");
  });

  it("supports fail-closed final enforcement without suppressing diagnostic evidence", () => {
    expect(builder).toContain('process.argv.includes("--require-zero")');
    expect(builder).toContain("if (requireZero && readiness.zeroOrphans !== true) process.exit(1)");
  });

  it("discovers readiness early and certifies S15 only after exact-head S14", () => {
    const cascade = readFileSync(".github/workflows/v3-s14-full-contest-rehearsal.yml", "utf8");
    expect(preflight).toContain("scripts/v3-release-preflight.ts --group=static");
    expect(preflight).not.toContain("build-v3-s15-zero-orphan-evidence.ts");
    expect(cascade).toContain("needs: [stateful-rehearsal]");
    expect(cascade).toContain("Download successful exact-SHA S14 evidence");
    expect(cascade).toContain("build-v3-s15-zero-orphan-evidence.ts --require-zero");
    expect(builder).toContain("assertS14Certification");
  });

  it("does not introduce hosted Supabase access", () => {
    expect(builder).not.toContain("supabase.co");
    expect(readiness).not.toContain("supabase.co");
  });
});
