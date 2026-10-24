import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { verifyV3FullServiceRecoveryArtifacts } from "../lib/v3-full-service-recovery-artifacts";

const roots: string[] = [];

function fixture(embeddedOverride: Record<string, unknown> = {}) {
  const root = mkdtempSync(join(tmpdir(), "solaris-s11-full-service-"));
  roots.push(root);
  const retainedAssessment = {
    schemaVersion: 1,
    status: "ready_for_qa_review",
    expectedCommitSha: "a".repeat(40),
    evidenceCommitSha: "a".repeat(40),
    rehearsalId: "database-run",
    errors: [],
    certificationClaim: false,
    qaReviewRequired: true,
  };
  const raw = Buffer.from(`${JSON.stringify(retainedAssessment, null, 2)}\n`, "utf8");
  writeFileSync(join(root, "database-assessment.json"), raw);
  const digest = createHash("sha256").update(raw).digest("hex");

  return {
    root,
    retainedAssessment,
    manifest: {
      components: [
        {
          component: "database",
          artifactPath: "database-assessment.json",
          artifactSha256: digest,
          assessment: { ...retainedAssessment, ...embeddedOverride },
        },
      ],
    },
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("S11 full-service retained component artifacts", () => {
  it("accepts an artifact whose bytes, digest and embedded assessment agree", () => {
    const { manifest, root } = fixture();
    expect(verifyV3FullServiceRecoveryArtifacts(manifest, root)).toEqual([]);
  });

  it("rejects retained-byte drift even when the manifest still looks structurally valid", () => {
    const { manifest, root } = fixture();
    writeFileSync(join(root, "database-assessment.json"), "{}\n", "utf8");

    expect(verifyV3FullServiceRecoveryArtifacts(manifest, root)).toEqual([
      "database assessment artifact digest does not match artifactSha256",
    ]);
  });

  it("rejects embedded assessment drift after digest verification", () => {
    const { manifest, root } = fixture({ rehearsalId: "invented-run" });

    expect(verifyV3FullServiceRecoveryArtifacts(manifest, root)).toEqual([
      "database embedded assessment does not match retained artifact",
    ]);
  });

  it("rejects a repository-root escape before reading any file", () => {
    const { manifest, root } = fixture();
    manifest.components[0].artifactPath = "../outside.json";

    expect(verifyV3FullServiceRecoveryArtifacts(manifest, root)).toEqual([
      "database assessment artifact escapes the repository root",
    ]);
  });

  it("rejects a missing retained artifact", () => {
    const { manifest, root } = fixture();
    manifest.components[0].artifactPath = "missing-assessment.json";

    const errors = verifyV3FullServiceRecoveryArtifacts(manifest, root);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("database assessment artifact could not be read:");
  });
});
