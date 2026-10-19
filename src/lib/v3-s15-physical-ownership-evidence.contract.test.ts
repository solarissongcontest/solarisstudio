import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readiness = readFileSync("scripts/check-v3-s15-zero-orphan-readiness.ts", "utf8");
const physicalScanner = readFileSync("scripts/check-v3-s15-physical-ownership.ts", "utf8");
const evidenceBuilder = readFileSync("scripts/build-v3-s15-zero-orphan-evidence.ts", "utf8");

describe("S15 physical ownership release-evidence integration", () => {
  it("executes the System-owned physical ownership scanner instead of duplicating authority", () => {
    expect(readiness).toContain("check-v3-s15-physical-ownership.ts");
    expect(readiness).toContain('spawnSync("bun", ["run", physicalOwnershipPath, "--json"]');
    expect(physicalScanner).toContain("validateV3PhysicalTableOwnership");
    expect(readiness).not.toContain("V3_SHARED_PHYSICAL_TABLE_CONTRACTS");
    expect(readiness).not.toContain("V3_VERIFIED_DOMAIN_TABLES");
  });

  it("fails closed when the physical ownership report is malformed", () => {
    expect(readiness).toContain("S15 physical-ownership output was not valid JSON");
    expect(readiness).toContain("S15 physical-ownership output did not match the expected report contract");
    expect(readiness).toContain('typeof physicalOwnership.zeroOwnershipConflicts !== "boolean"');
    expect(readiness).toContain("Array.isArray(physicalOwnership.findings)");
  });

  it("promotes every physical ownership finding into the canonical zero-orphan finding stream", () => {
    expect(readiness).toContain("PHYSICAL_OWNERSHIP_CONFLICT");
    expect(readiness).toContain("...physicalOwnershipFindings");
    expect(readiness).toContain("zeroOrphans: findings.length === 0");
    expect(readiness).toContain("explicitlySharedTables");
    expect(readiness).toContain("uniquePhysicalTables");
  });

  it("keeps exact-SHA evidence fail-closed through the existing S15 builder", () => {
    expect(evidenceBuilder).toContain("check-v3-s15-zero-orphan-readiness.ts");
    expect(evidenceBuilder).toContain("V3_CANDIDATE_SHA");
    expect(evidenceBuilder).toContain("requestedCandidateSha !== checkedOutSha");
    expect(evidenceBuilder).toContain("readiness.zeroOrphans !== true");
    expect(evidenceBuilder).toContain("s15-zero-orphan.json");
  });

  it("does not introduce hosted Supabase or mutation behavior into static S15 proof", () => {
    expect(readiness).not.toContain("SUPABASE_URL");
    expect(readiness).not.toContain("service_role");
    expect(readiness).not.toContain("fetch(");
    expect(physicalScanner).not.toContain("SUPABASE_URL");
  });
});
