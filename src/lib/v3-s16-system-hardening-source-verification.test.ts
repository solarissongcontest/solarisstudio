import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateV3S16SystemHardeningSourceArtifacts } from "./v3-s16-system-hardening-source-verification";

const SHA = "a".repeat(40);

function writeComponent(
  root: string,
  overrides: Record<string, unknown> = {},
) {
  const component = `${JSON.stringify({
    schemaVersion: 1,
    candidateSha: SHA,
    passed: true,
    issues: [],
    certificationClaim: false,
    ...overrides,
  }, null, 2)}\n`;
  const artifact = "s10-release-evidence.json";
  writeFileSync(join(root, artifact), component, "utf8");
  return {
    artifact,
    sha256: createHash("sha256").update(component).digest("hex"),
  };
}

function fixture(root: string, componentOverrides: Record<string, unknown> = {}) {
  const sourceFile = writeComponent(root, componentOverrides);
  return {
    schemaVersion: 1,
    candidateSha: SHA,
    passed: true,
    certificationClaim: false,
    unresolvedBlockers: [],
    phases: [
      {
        id: "S10",
        candidateSha: SHA,
        passed: true,
        blockers: [],
        sources: [
          {
            ...sourceFile,
            workflow: "S10 evidence",
            runId: 1,
            runAttempt: 1,
            headSha: SHA,
            conclusion: "success",
          },
        ],
      },
    ],
  };
}

describe("S16 System hardening source verification", () => {
  it("binds declared provenance to a real same-directory exact-SHA artifact and digest", () => {
    const root = mkdtempSync(join(tmpdir(), "v3-s16-hardening-source-"));
    try {
      expect(validateV3S16SystemHardeningSourceArtifacts(fixture(root), root, SHA)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects a digest-shaped lie", () => {
    const root = mkdtempSync(join(tmpdir(), "v3-s16-hardening-source-"));
    try {
      const evidence = fixture(root);
      evidence.phases[0]!.sources[0]!.sha256 = "f".repeat(64);
      expect(validateV3S16SystemHardeningSourceArtifacts(evidence, root, SHA)).toContain(
        "system-hardening: S10 source 1 artifact digest does not match s10-release-evidence.json",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects a source artifact whose own QA verdict fails or claims final certification", () => {
    const root = mkdtempSync(join(tmpdir(), "v3-s16-hardening-source-"));
    try {
      const evidence = fixture(root, {
        passed: false,
        issues: ["capacity budget missing"],
        certificationClaim: true,
      });
      const issues = validateV3S16SystemHardeningSourceArtifacts(evidence, root, SHA);
      expect(issues).toContain(
        "system-hardening: S10 source 1 artifact s10-release-evidence.json does not prove passed=true",
      );
      expect(issues).toContain(
        "system-hardening: S10 source 1 artifact s10-release-evidence.json must explicitly set certificationClaim=false",
      );
      expect(issues).toContain(
        "system-hardening: S10 source 1 artifact s10-release-evidence.json still contains QA issues",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects missing and path-traversing source references", () => {
    const root = mkdtempSync(join(tmpdir(), "v3-s16-hardening-source-"));
    try {
      const evidence = fixture(root);
      evidence.phases[0]!.sources[0]!.artifact = "../outside.json";
      expect(validateV3S16SystemHardeningSourceArtifacts(evidence, root, SHA)).toContain(
        "system-hardening: S10 source 1 artifact must be a non-self-referential filename in the evidence source directory",
      );

      evidence.phases[0]!.sources[0]!.artifact = "missing.json";
      expect(validateV3S16SystemHardeningSourceArtifacts(evidence, root, SHA)).toContain(
        "system-hardening: S10 source 1 artifact is missing from its evidence source: missing.json",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects source evidence for a different candidate SHA", () => {
    const root = mkdtempSync(join(tmpdir(), "v3-s16-hardening-source-"));
    try {
      const evidence = fixture(root, { candidateSha: "c".repeat(40) });
      expect(validateV3S16SystemHardeningSourceArtifacts(evidence, root, SHA)).toContain(
        `system-hardening: S10 source 1 artifact s10-release-evidence.json certifies ${"c".repeat(40)}, not exact candidate ${SHA}`,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
