import { assessS14Execution } from "./lib/v3-s14-execution-gate";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { combineReports, type GroupReport } from "./lib/v3-release-preflight";
const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const input = resolve(process.env.V3_PREFLIGHT_INPUT_DIR ?? "v3-release-preflight/discovery-inputs");
function files(path: string): string[] {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true }).flatMap((item) => item.isDirectory() ? files(join(path, item.name)) : item.name === "preflight-summary.json" ? [join(path, item.name)] : []);
}
const reports: GroupReport[] = [];
const invalid: string[] = [];
for (const path of files(input).sort()) {
  try { reports.push(JSON.parse(readFileSync(path, "utf8")) as GroupReport); }
  catch { invalid.push(`INVALID_REPORT_JSON ${path}`); }
}
const summary = combineReports(reports, sha);
summary.discoveryFindings.push(...invalid);
if (invalid.length) summary.passed = false;
mkdirSync("v3-release-preflight", { recursive: true });
const s14Execution = assessS14Execution(sha, summary.checks);
if (summary.discoveryFindings.length) { s14Execution.allowed = false; s14Execution.blockers.push(...summary.discoveryFindings); }
writeFileSync("v3-release-preflight/preflight-summary.json", `${JSON.stringify({ ...summary, s14Execution }, null, 2)}\n`);
for (const [id, check] of Object.entries(summary.checks)) console.log(`${id}: ${check.status.toUpperCase()} (${check.findings.length} findings)`);
for (const finding of summary.discoveryFindings) console.log(finding);
console.log(`Combined cascade preflight: ${summary.passed ? "PASS" : "FAIL"} (${sha})`);
console.log(`S14 execution: ${s14Execution.allowed ? "ALLOWED" : "BLOCKED"}; release certification remains independent`);
if (!s14Execution.allowed) process.exitCode = 1;
