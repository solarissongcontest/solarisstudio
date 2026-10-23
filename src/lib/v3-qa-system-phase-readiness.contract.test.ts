import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  V3_QA_SYSTEM_PHASE_MANIFEST,
  assessV3QaSystemPhaseReadiness,
} from "./v3-qa-system-phase-readiness";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const generator = source("scripts/generate-v3-qa-system-phase-readiness.ts");

describe("Chat 5 V3 System phase readiness", () => {
  it("tracks S10-S16 exactly once with the canonical parallel-work ownership split", () => {
    expect(V3_QA_SYSTEM_PHASE_MANIFEST.map((phase) => phase.id)).toEqual([
      "S10",
      "S11",
      "S12",
      "S13",
      "S14",
      "S15",
      "S16",
    ]);

    for (const phase of V3_QA_SYSTEM_PHASE_MANIFEST.slice(0, 4)) {
      expect(phase.owner).toBe("system");
    }
    for (const phase of V3_QA_SYSTEM_PHASE_MANIFEST.slice(4)) {
      expect(phase.owner).toBe("qa-integrator");
    }
  });

  it("keeps implementation wiring separate from exact-SHA certification", () => {
    for (const phase of V3_QA_SYSTEM_PHASE_MANIFEST) {
      expect(phase.exactShaEvidenceRequired).toBe(true);
      expect(phase.implementationFiles.length).toBeGreaterThan(0);
      expect(phase.verificationFiles.length).toBeGreaterThan(0);
      expect(phase.certificationRequirement).toMatch(/exact|candidate|certif/i);
    }

    const everyPath = new Set(
      V3_QA_SYSTEM_PHASE_MANIFEST.flatMap((phase) => [
        ...phase.implementationFiles,
        ...phase.verificationFiles,
      ]),
    );
    const rows = assessV3QaSystemPhaseReadiness((path) => everyPath.has(path));
    expect(rows.every((row) => row.staticReadiness === "wired")).toBe(true);
    expect(rows.every((row) => row.certificationClaim === false)).toBe(true);
  });

  it("reports partial and missing wiring without converting either state into a release claim", () => {
    const first = V3_QA_SYSTEM_PHASE_MANIFEST[0];
    const onlyOne = new Set([first.implementationFiles[0]]);
    const partial = assessV3QaSystemPhaseReadiness((path) => onlyOne.has(path));
    expect(partial[0].staticReadiness).toBe("partial");
    expect(partial[0].certificationClaim).toBe(false);

    const missing = assessV3QaSystemPhaseReadiness(() => false);
    expect(missing.every((row) => row.staticReadiness === "missing")).toBe(true);
    expect(missing.every((row) => row.certificationClaim === false)).toBe(true);
  });

  it("finds repository-side wiring for every final phase without pretending the active CI failures passed", () => {
    const rows = assessV3QaSystemPhaseReadiness(existsSync);
    expect(rows.every((row) => row.staticReadiness !== "missing")).toBe(true);
    expect(rows.every((row) => row.certificationClaim === false)).toBe(true);
  });

  it("generates a static exact-source report without network or hosted-production access", () => {
    expect(generator).toContain("V3_CANDIDATE_SHA");
    expect(generator).toContain("GITHUB_SHA");
    expect(generator).toContain("^[0-9a-f]{40}$");
    expect(generator).toContain('evidenceKind: "static-repository-wiring"');
    expect(generator).toContain("certificationClaim: false");
    expect(generator).toContain("productionTrafficGenerated: false");
    expect(generator).not.toContain("supabase.co");
    expect(generator).not.toContain("fetch(");
    expect(generator).not.toContain("http://");
    expect(generator).not.toContain("https://");
  });

  it("does not create a second migration or product implementation lane", () => {
    const paths = V3_QA_SYSTEM_PHASE_MANIFEST.flatMap((phase) => [
      ...phase.implementationFiles,
      ...phase.verificationFiles,
    ]);
    expect(paths.some((path) => path.startsWith("supabase/migrations/"))).toBe(false);
    expect(paths.some((path) => path.startsWith("src/routes/"))).toBe(false);
    expect(paths.some((path) => path.startsWith("src/components/"))).toBe(false);
  });
});
