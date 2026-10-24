import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

const candidateSha = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim().toLowerCase();
const assemblerSource = readFileSync("scripts/assemble-v3-s16-evidence.ts", "utf8");

function canonicalCi(sha = candidateSha) {
  return {
    schemaVersion: 1,
    candidateSha: sha,
    passed: true,
    provenance: {
      workflow: "Quality",
      conclusion: "success",
      runId: 12345,
      runAttempt: 1,
    },
  };
}

function writeSource(root: string, name: string, evidence = canonicalCi()) {
  const source = join(root, name);
  mkdirSync(source, { recursive: true });
  writeFileSync(
    join(source, "s16-canonical-ci.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
    "utf8",
  );
  return source;
}

function assemble(sources: string[], output: string, requireComplete = false) {
  const args = ["run", "scripts/assemble-v3-s16-evidence.ts"];
  for (const source of sources) args.push("--source", source);
  if (requireComplete) args.push("--require-complete");
  return execFileSync("bun", args, {
    encoding: "utf8",
    env: {
      ...process.env,
      V3_CANDIDATE_SHA: candidateSha,
      V3_RELEASE_EVIDENCE_DIR: output,
    },
  });
}

describe("S16 evidence bundle assembler", () => {
  it("copies one unambiguous exact-SHA source and records missing categories explicitly", () => {
    const root = mkdtempSync(join(tmpdir(), "v3-s16-bundle-"));
    try {
      const source = writeSource(root, "quality");
      const output = join(root, "bundle");
      const stdout = assemble([source], output);
      const index = JSON.parse(
        readFileSync(join(output, "s16-evidence-bundle-index.json"), "utf8"),
      ) as {
        complete: boolean;
        validCount: number;
        categories: Array<{ id: string; present: boolean; valid: boolean }>;
      };

      expect(stdout).toContain("S16 evidence bundle: BLOCKED (1/12 valid)");
      expect(index.complete).toBe(false);
      expect(index.validCount).toBe(1);
      expect(index.categories.find((item) => item.id === "canonical-ci")).toMatchObject({
        present: true,
        valid: true,
      });
      expect(index.categories.find((item) => item.id === "system-hardening")).toMatchObject({
        present: false,
        valid: false,
      });
      expect(index.categories.find((item) => item.id === "migration-rehearsal")).toMatchObject({
        present: false,
        valid: false,
      });
      expect(
        JSON.parse(readFileSync(join(output, "s16-canonical-ci.json"), "utf8")),
      ).toMatchObject({ candidateSha, passed: true });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects duplicate canonical artifacts instead of choosing one arbitrarily", () => {
    const root = mkdtempSync(join(tmpdir(), "v3-s16-bundle-dupe-"));
    try {
      const sourceA = writeSource(root, "quality-a");
      const sourceB = writeSource(root, "quality-b");
      expect(() => assemble([sourceA, sourceB], join(root, "bundle"))).toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps stale exact-SHA evidence in the diagnostic bundle but marks it invalid", () => {
    const root = mkdtempSync(join(tmpdir(), "v3-s16-bundle-stale-"));
    try {
      const source = writeSource(root, "quality", canonicalCi("b".repeat(40)));
      const output = join(root, "bundle");
      assemble([source], output);
      const index = JSON.parse(
        readFileSync(join(output, "s16-evidence-bundle-index.json"), "utf8"),
      ) as {
        validCount: number;
        categories: Array<{ id: string; valid: boolean; issues: string[] }>;
      };
      const canonical = index.categories.find((item) => item.id === "canonical-ci");
      expect(canonical?.valid).toBe(false);
      expect(canonical?.issues.join(" ")).toContain("not exact candidate");
      expect(index.validCount).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("binds System-hardening digest declarations to downloaded source artifacts", () => {
    expect(assemblerSource).toContain("validateV3S16SystemHardeningSourceArtifacts");
    expect(assemblerSource).toContain('category.id === "system-hardening"');
    expect(assemblerSource).toContain("match.source");
  });

  it("writes the diagnostic index before --require-complete exits red", () => {
    const root = mkdtempSync(join(tmpdir(), "v3-s16-bundle-required-"));
    try {
      const source = writeSource(root, "quality");
      const output = join(root, "bundle");
      expect(() => assemble([source], output, true)).toThrow();
      const index = JSON.parse(
        readFileSync(join(output, "s16-evidence-bundle-index.json"), "utf8"),
      ) as { complete: boolean; validCount: number };
      expect(index.complete).toBe(false);
      expect(index.validCount).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
