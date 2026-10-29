import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildV3ReleaseRiskReport } from "./v3-release-risk";

const merger = resolve("scripts/merge-v3-release-preflight.ts");
const pass = { status: "pass", exitCode: 0, findings: [] };

describe("actual S14 discovery merge command", () => {
  it.each([false, true])(
    "retains broad inventory while enforcing migration safety failure=%s",
    (migrationFailure) => {
      const directory = mkdtempSync(join(tmpdir(), "s14-execution-merge-"));
      const git = (...args: string[]) =>
        execFileSync("git", args, { cwd: directory, encoding: "utf8" }).trim();
      try {
        git("init", "-q");
        git(
          "-c",
          "user.name=Fixture",
          "-c",
          "user.email=fixture@local.invalid",
          "commit",
          "--allow-empty",
          "-qm",
          "Fixture",
        );
        const candidateSha = git("rev-parse", "HEAD");
        const findings = ["DOMAIN_CONSEQUENCE_DECLARED edition.transitioned owner=edition"];
        const releaseRisk = buildV3ReleaseRiskReport(findings, []);
        const reports = [
          {
            candidateSha,
            group: "static",
            sourceClean: true,
            passed: false,
            checks: {
              productionIsolation: pass,
              migrationAdoption: migrationFailure
                ? { status: "fail", exitCode: 1, findings: ["ADOPTION_FAILED migration"] }
                : pass,
              repositoryReleaseReadiness: {
                status: "fail",
                exitCode: 0,
                findings,
                report: { candidateSha, findings, releaseRisk },
              },
              s15ZeroOrphan: pass,
            },
          },
          {
            candidateSha,
            group: "database",
            sourceClean: true,
            passed: true,
            checks: {
              focusedLifecycle: pass,
              s16Authority: { ...pass, report: { candidateSha, s16Passed: true, findings: [] } },
            },
          },
        ];
        const inputs = join(directory, "input");
        for (const report of reports) {
          const path = join(inputs, report.group);
          mkdirSync(path, { recursive: true });
          writeFileSync(join(path, "preflight-summary.json"), JSON.stringify(report));
        }
        const result = spawnSync("bun", ["--env-file=/dev/null", "run", merger], {
          cwd: directory,
          encoding: "utf8",
          env: { ...process.env, V3_PREFLIGHT_INPUT_DIR: inputs },
        });
        expect(result.error).toBeUndefined();
        expect(result.status).toBe(migrationFailure ? 1 : 0);
        const summary = JSON.parse(
          readFileSync(join(directory, "v3-release-preflight/preflight-summary.json"), "utf8"),
        );
        expect(summary.passed).toBe(false);
        expect(summary.s14Execution.allowed).toBe(!migrationFailure);
        expect(summary.s14Execution.releaseReady).toBe(false);
        expect(summary.findings).toContain(findings[0]);
        expect(summary.candidateSha).toBe(candidateSha);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
  );
});
