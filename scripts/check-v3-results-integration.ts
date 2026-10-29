import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { V3_RELEASE_POLICY_VERSION, type V3ReleaseEvidence } from "../src/lib/v3-release-evidence";
import { V3_RESULTS_INTEGRATION_CONTRACT, validateV3ResultsIntegrationContract } from "../src/lib/v3-results-integration-contract";

function candidateSha() {
  const env = process.env.V3_CANDIDATE_SHA?.trim().toLowerCase() || process.env.GITHUB_SHA?.trim().toLowerCase();
  if (env && /^[0-9a-f]{40}$/.test(env)) return env;
  return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim().toLowerCase();
}

const resultSource = readFileSync("src/integrations/v3/results-source.server.ts", "utf8");
const snapshotSource = readFileSync("src/lib/v3-public-result-snapshots.ts", "utf8");
const issues = validateV3ResultsIntegrationContract(V3_RESULTS_INTEGRATION_CONTRACT);
for (const expected of [
  "loadPublicResultSnapshots",
  "snapshot.resultVersion !== snapshots.get(selectedShow.id)!.resultVersion",
  "snapshot.publicationVersion !== snapshots.get(selectedShow.id)!.publicationVersion",
  "Published results changed during this read",
]) if (!resultSource.includes(expected)) issues.push(`shared Results read contract missing: ${expected}`);
for (const expected of ["resultVersion", "publicationVersion"]) if (!snapshotSource.includes(expected)) issues.push(`immutable snapshot contract missing: ${expected}`);

const directMutation = /\.from\(\s*["'`]results["'`]\s*\)[\s\S]{0,500}\.(?:insert|update|upsert|delete)\s*\(/.test(resultSource);
if (directMutation) issues.push("shared V3 Results source directly mutates public.results");

const sha = candidateSha();
const passed = issues.length === 0;
const evidence: V3ReleaseEvidence & { candidateSha: string; passed: boolean; contractVersion: string; issues: string[] } = {
  schema_version: 1,
  candidate_sha: sha,
  candidateSha: sha,
  gate_id: "results-integration",
  result: passed ? "pass" : "fail",
  workflow_run_id: process.env.GITHUB_RUN_ID?.trim() || "local",
  job_name: process.env.GITHUB_JOB?.trim() || "results-integration",
  produced_at: new Date().toISOString(),
  policy_version: V3_RELEASE_POLICY_VERSION,
  check_version: V3_RESULTS_INTEGRATION_CONTRACT.contractVersion,
  passed,
  contractVersion: V3_RESULTS_INTEGRATION_CONTRACT.contractVersion,
  issues,
};
const directory = process.env.V3_RELEASE_EVIDENCE_DIR ?? "v3-release-evidence";
mkdirSync(directory, { recursive: true });
writeFileSync(join(directory, "results-integration.json"), JSON.stringify(evidence, null, 2) + "\n");
process.stdout.write(JSON.stringify(evidence, null, 2) + "\n");
if (!passed) process.exitCode = 1;
