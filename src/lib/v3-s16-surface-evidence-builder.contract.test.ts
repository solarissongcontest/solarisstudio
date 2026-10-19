import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { V3_S16_NAVIGATION_REQUIRED_CASES } from "./v3-s16-surface-evidence-contract";

const script = readFileSync("scripts/build-v3-s16-surface-evidence.ts", "utf8");
const candidateSha = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim().toLowerCase();

function fixture(ids: readonly string[]) {
  return {
    schemaVersion: 1,
    candidateSha,
    category: "navigation-acceptance",
    cases: ids.map((id) => ({
      id,
      passed: true,
      evidence: [`browser-audit:${candidateSha}:${id}`],
    })),
    provenance: {
      kind: "github-actions",
      source: `contract fixture for ${candidateSha}`,
    },
  };
}

function runFixture(ids: readonly string[], requirePassed = false) {
  const root = mkdtempSync(join(tmpdir(), "v3-s16-surface-"));
  const input = join(root, "input.json");
  const evidenceDir = join(root, "evidence");
  writeFileSync(input, `${JSON.stringify(fixture(ids), null, 2)}\n`, "utf8");

  try {
    const args = [
      "run",
      "scripts/build-v3-s16-surface-evidence.ts",
      "--category",
      "navigation-acceptance",
      "--input",
      input,
    ];
    if (requirePassed) args.push("--require-passed");
    const output = execFileSync("bun", args, {
      encoding: "utf8",
      env: {
        ...process.env,
        V3_CANDIDATE_SHA: candidateSha,
        V3_RELEASE_EVIDENCE_DIR: evidenceDir,
      },
    });
    const evidence = JSON.parse(
      readFileSync(join(evidenceDir, "s16-navigation-acceptance.json"), "utf8"),
    ) as Record<string, unknown>;
    return { output, evidence };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("S16 surface evidence packer", () => {
  it("binds explicit required-case proof to the exact checked-out candidate", () => {
    const { output, evidence } = runFixture(
      V3_S16_NAVIGATION_REQUIRED_CASES,
      true,
    );
    expect(output).toContain("S16 navigation-acceptance evidence: PASS");
    expect(evidence).toMatchObject({
      schemaVersion: 1,
      candidateSha,
      category: "navigation-acceptance",
      passed: true,
    });
    expect(evidence).not.toHaveProperty("validationIssues");
  });

  it("writes explicit blocked evidence when a required acceptance case is absent", () => {
    const { output, evidence } = runFixture(
      V3_S16_NAVIGATION_REQUIRED_CASES.slice(1),
    );
    expect(output).toContain("S16 navigation-acceptance evidence: BLOCKED");
    expect(evidence.passed).toBe(false);
    expect(evidence.validationIssues).toEqual(
      expect.arrayContaining([
        expect.stringContaining("required acceptance case standard-phone appears 0 times"),
      ]),
    );
  });

  it("makes --require-passed fail closed on incomplete proof", () => {
    const root = mkdtempSync(join(tmpdir(), "v3-s16-surface-required-"));
    const input = join(root, "input.json");
    const evidenceDir = join(root, "evidence");
    writeFileSync(
      input,
      `${JSON.stringify(fixture(V3_S16_NAVIGATION_REQUIRED_CASES.slice(1)), null, 2)}\n`,
      "utf8",
    );
    try {
      expect(() =>
        execFileSync(
          "bun",
          [
            "run",
            "scripts/build-v3-s16-surface-evidence.ts",
            "--category",
            "navigation-acceptance",
            "--input",
            input,
            "--require-passed",
          ],
          {
            stdio: "pipe",
            env: {
              ...process.env,
              V3_CANDIDATE_SHA: candidateSha,
              V3_RELEASE_EVIDENCE_DIR: evidenceDir,
            },
          },
        ),
      ).toThrow();
      const evidence = JSON.parse(
        readFileSync(join(evidenceDir, "s16-navigation-acceptance.json"), "utf8"),
      ) as Record<string, unknown>;
      expect(evidence.passed).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses stale input candidate identity before packing evidence", () => {
    expect(script).toContain("surface evidence input certifies");
    expect(script).toContain("does not match checked-out SHA");
    expect(script).toContain("The packer deliberately ignores any caller-supplied top-level pass claim");
  });
});
