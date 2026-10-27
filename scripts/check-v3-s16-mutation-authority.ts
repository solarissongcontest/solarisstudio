import { resolveS16CandidateSha } from "../src/lib/v3-s16-candidate-sha";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { buildV3S16MutationAuthorityReport, scanV3S16StaticAuthority, V3_S16_CRITICAL_DOMAINS, V3_S16_POLICY_VERSION, type V3S16CatalogEvidence, type V3S16SourceFile } from "../src/lib/v3-s16-mutation-authority";
import { classifyV3S16ReleaseAuthority } from "../src/lib/v3-s16-release-risk";
import { V3_RELEASE_POLICY_VERSION } from "../src/lib/v3-release-evidence";

const SOURCE_ROOTS = ["src", "supabase/migrations", "supabase/functions", "workers", "functions"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".sql"]);

function candidateSha() {
  return resolveS16CandidateSha(
    execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }),
    process.env.V3_CANDIDATE_SHA,
    process.env.GITHUB_SHA,
  );
}

function collectFiles(root: string, output: V3S16SourceFile[]) {
  if (!existsSync(root)) return;
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    const stat = statSync(path);
    if (stat.isDirectory()) collectFiles(path, output);
    else if (SOURCE_EXTENSIONS.has(extname(path))) output.push({ path: relative(process.cwd(), path).replaceAll("\\", "/"), source: readFileSync(path, "utf8") });
  }
}

function catalogPath() {
  const argument = process.argv.find((value) => value.startsWith("--catalog="));
  return argument?.slice("--catalog=".length) || process.env.V3_S16_CATALOG_EVIDENCE?.trim() || null;
}

const files: V3S16SourceFile[] = [];
for (const root of SOURCE_ROOTS) collectFiles(resolve(root), files);
const sha = candidateSha();
const staticOnly = process.argv.includes("--static");
const catalogFile = catalogPath();
const catalog = catalogFile && existsSync(catalogFile)
  ? JSON.parse(readFileSync(catalogFile, "utf8")) as V3S16CatalogEvidence
  : null;

const baseReport = buildV3S16MutationAuthorityReport({ candidateSha: sha, files, catalog });
const baseFindings = staticOnly
  ? scanV3S16StaticAuthority(files, V3_S16_CRITICAL_DOMAINS)
  : baseReport.findings;
const assessment = classifyV3S16ReleaseAuthority({
  baseFindings,
  domains: baseReport.domains,
  files,
  catalog,
  staticOnly,
});
const report = {
  ...baseReport,
  catalogAuditPassed: staticOnly ? false : baseReport.catalogAuditPassed,
  s16Passed: assessment.s16Passed,
  findings: assessment.findings,
  riskTotals: assessment.riskTotals,
  ...(staticOnly ? { catalogStatus: "not_evaluated_in_static_mode" as const } : {}),
};

const directory = process.env.V3_PREFLIGHT_DIR ?? "v3-release-preflight/static";
mkdirSync(directory, { recursive: true });
writeFileSync(join(directory, "s16-mutation-authority.json"), JSON.stringify(report, null, 2) + "\n");
process.stdout.write(JSON.stringify(report, null, 2) + "\n");

if (!staticOnly && catalog) {
  const evidenceDirectory = process.env.V3_RELEASE_EVIDENCE_DIR ?? "v3-release-evidence";
  mkdirSync(evidenceDirectory, { recursive: true });
  const evidence = {
    schema_version: 1,
    candidate_sha: sha,
    candidateSha: sha,
    gate_id: "s16-mutation-authority",
    result: report.s16Passed ? "pass" : "fail",
    workflow_run_id: process.env.GITHUB_RUN_ID?.trim() || "local",
    job_name: process.env.GITHUB_JOB?.trim() || "s16-mutation-authority",
    produced_at: new Date().toISOString(),
    policy_version: V3_RELEASE_POLICY_VERSION,
    check_version: V3_S16_POLICY_VERSION,
    s16Passed: report.s16Passed,
    findingCount: report.findings.length,
    riskTotals: report.riskTotals,
  };
  writeFileSync(join(evidenceDirectory, "s16-mutation-authority.json"), JSON.stringify(evidence, null, 2) + "\n");
}

if (process.argv.includes("--enforce") && !report.s16Passed) process.exitCode = 1;
