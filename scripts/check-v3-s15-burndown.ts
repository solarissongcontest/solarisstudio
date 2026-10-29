import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { auditReleaseBurndown, type ReleaseBurndown } from "../src/lib/v3-release-burndown";

const matrix = JSON.parse(readFileSync("docs/v3-release-burndown.json", "utf8")) as ReleaseBurndown;
const scan = spawnSync(process.execPath, ["--env-file=/dev/null", "run", "scripts/check-v3-release-integrity.ts", "--discovery", "--json"], { encoding: "utf8", env: process.env });
if (scan.error) throw scan.error;
const readiness = JSON.parse(scan.stdout) as { findings: string[]; repositoryReady: boolean; releaseRisk?: unknown };
if (!Array.isArray(readiness.findings) || ![0, 1].includes(scan.status ?? -1)) throw new Error("Canonical readiness scanner failed");
if (scan.status !== (readiness.findings.length ? 1 : 0) || readiness.repositoryReady !== (readiness.findings.length === 0)) throw new Error("Canonical readiness exit status and findings disagree");
const audit = auditReleaseBurndown(matrix, readiness.findings, existsSync);
const directory = process.env.V3_PREFLIGHT_DIR ?? "v3-release-preflight/static";
mkdirSync(directory, { recursive: true });
const report = {
  ...audit,
  candidateSha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  readinessPassed: readiness.findings.length === 0,
  currentReadinessFindings: readiness.findings,
  classificationSnapshot: matrix,
};
writeFileSync(join(directory, "s15-burndown.json"), JSON.stringify(report, null, 2) + "\n");
process.stdout.write(JSON.stringify(report, null, 2) + "\n");
if (!audit.auditPassed) process.exitCode = 1;
