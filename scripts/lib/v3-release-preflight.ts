import { stripVTControlCharacters } from "node:util";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type Check = {
  id: string;
  group: "static" | "database" | "handoff";
  command: string[];
  dependencies?: string[];
  json?: boolean;
  resetBefore?: boolean;
};
export type Outcome = {
  status: "pass" | "fail" | "blocked";
  exitCode: number | null;
  findings: string[];
  log?: string;
  report?: unknown;
};
export type Execution = { status: number | null; stdout: string; stderr: string; error?: string };
export const execute = (command: string[], env = process.env): Execution => {
  const result = spawnSync(command[0], command.slice(1), {
    env, encoding: "utf8", maxBuffer: 32 * 1024 * 1024,
  });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "", error: result.error?.message };
};
export function assertLocalTargets(api: string | undefined, database: string | undefined) {
  for (const [name, value, protocols] of [
    ["API", api, ["http:"]], ["database", database, ["postgres:", "postgresql:"]],
  ] as const) {
    let valid = false;
    try {
      const url = new URL(value ?? "");
      valid = (protocols as readonly string[]).includes(url.protocol)
        && ["127.0.0.1", "localhost", "::1"].includes(url.hostname.replace(/^\[|\]$/g, ""));
    } catch { /* Fail closed. */ }
    if (!valid) throw new Error(`Refusing release preflight against missing/non-local ${name}`);
  }
}
export const apiKeys = ["VITE_SUPABASE_URL", "SUPABASE_URL", "E2E_SUPABASE_URL", "VITE_CONFIRMATIONS_SUPABASE_URL", "CONFIRMATIONS_SUPABASE_URL", "API_URL"];
export function staticEnvironment(source = process.env): NodeJS.ProcessEnv {
  for (const key of apiKeys) if (source[key]) assertLocalTargets(source[key], "postgresql://localhost/postgres");
  for (const key of ["DATABASE_URL", "POSTGRES_URL", "SUPABASE_DB_URL", "DB_URL"]) {
    if (source[key]) assertLocalTargets("http://localhost:54321", source[key]);
  }
  if (source.E2E_BASE_URL) assertLocalTargets(source.E2E_BASE_URL, "postgresql://localhost/postgres");
  const env = { ...source };
  for (const key of apiKeys) env[key] = source[key] || "http://127.0.0.1:54321";
  for (const key of ["SUPABASE_PROJECT_ID", "SUPABASE_PROJECT_REF", "E2E_SUPABASE_PROJECT_ID", "E2E_SUPABASE_PROJECT_REF", "VITE_SUPABASE_PROJECT_ID", "VITE_SUPABASE_PROJECT_REF"]) env[key] = source[key] || "local";
  for (const key of ["SUPABASE_SERVICE_ROLE_KEY", "E2E_SUPABASE_SERVICE_ROLE_KEY", "CONFIRMATIONS_SUPABASE_SERVICE_ROLE_KEY", "VITE_SUPABASE_SERVICE_ROLE_KEY"]) env[key] = "";
  for (const key of ["SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY", "CONFIRMATIONS_SUPABASE_PUBLISHABLE_KEY", "VITE_CONFIRMATIONS_SUPABASE_PUBLISHABLE_KEY"]) env[key] = "sb_publishable_preflight_local_only";
  for (const key of ["DATABASE_URL", "POSTGRES_URL", "SUPABASE_DB_URL", "DB_URL"]) env[key] = source[key] || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  env.V3_VERIFICATION_TARGET = "local";
  env.V3_SEED_TARGET = "local";
  env.V3_CLEANUP_TARGET = "local";
  env.V3_DESTRUCTIVE_VERIFICATION = "0";
  return env;
}
export function localSupabaseEnvironment(run = execute) {
  staticEnvironment(); // Reject any inherited hosted API/database target first.
  const result = run(["supabase", "status", "-o", "env"]);
  if (result.status !== 0) throw new Error("Isolated local Supabase is unavailable; no stateful check executed");
  const values: Record<string, string> = {};
  for (const line of result.stdout.split("\n")) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (!match) continue;
    values[match[1]] = match[2].startsWith('"') ? JSON.parse(match[2]) : match[2];
  }
  assertLocalTargets(values.API_URL, values.DB_URL);
  return values;
}
export function runSweep(
  checks: Check[], directory: string,
  run: (check: Check) => Execution = (check) => execute(check.command),
): Record<string, Outcome> {
  mkdirSync(directory, { recursive: true });
  const outcomes: Record<string, Outcome> = {};
  for (const check of checks) {
    const unmet = (check.dependencies ?? []).filter((id) => outcomes[id]?.status !== "pass");
    if (unmet.length) {
      outcomes[check.id] = { status: "blocked", exitCode: null, findings: [`DEPENDENCY_FAILED ${unmet.join(",")}`] };
      continue;
    }
    try {
      const result = run(check);
      const log = `${check.id}.log`;
      writeFileSync(join(directory, log), result.stdout + result.stderr);
      const findings: string[] = [];
      let report: unknown;
      if (check.json) {
        try {
          report = JSON.parse(result.stdout);
          const parsed = report as { findings?: string[] };
          if (Array.isArray(parsed.findings)) findings.push(...parsed.findings.map((finding) =>
            typeof finding === "string" ? finding : `STRUCTURED_FINDING ${JSON.stringify(finding)}`,
          ));
        } catch { findings.push("INVALID_JSON_REPORT"); }
      }
      if (result.error) findings.push(`EXECUTION_ERROR ${result.error}`);
      if (result.status !== 0 && !findings.length) {
        const lines = stripVTControlCharacters(result.stdout + result.stderr).split("\n").filter((line) => line.trim());
        const meaningful = lines.filter((line) => /^(\(fail\)|\[[^\]]+\] FAIL:|ERROR:)|error TS[0-9]+:/.test(line));
        findings.push(...new Set(meaningful.length ? meaningful : lines.slice(-6)));
        if (!findings.length) findings.push(`CHECK_EXIT ${result.status}; see ${log}`);
      }
      outcomes[check.id] = {
        status: result.status === 0 && !findings.length ? "pass" : "fail",
        exitCode: result.status, findings, log, ...(report === undefined ? {} : { report }),
      };
    } catch (error) {
      outcomes[check.id] = { status: "fail", exitCode: null, findings: [String(error)] };
    }
  }
  return outcomes;
}

/** A clean working tree can still have moved to another commit mid-run. */
export function candidateSnapshotFindings(beforeSha: string, afterSha: string, changedPaths: readonly string[]) {
  return [
    ...(beforeSha !== afterSha ? [`CANDIDATE_CHANGED ${beforeSha} -> ${afterSha}`] : []),
    ...changedPaths.map((path) => `SOURCE_MUTATION ${path}`),
  ];
}

export type GroupReport = {
  candidateSha: string; group: string; passed: boolean; sourceClean: boolean;
  checks: Record<string, Outcome>; cutoverAudit?: unknown[]; consequenceAudit?: unknown[];
};
export function combineReports(reports: GroupReport[], candidateSha: string) {
  const checks: Record<string, Outcome> = {};
  const groups: Record<string, string> = {};
  const findings: string[] = [];
  const audit: unknown[] = [];
  const consequenceAudit: unknown[] = [];
  for (const report of reports) {
    if (!report || !report.checks || Object.keys(report.checks).length === 0) { findings.push("INVALID_GROUP_REPORT"); continue; }
    if (!report.sourceClean) findings.push(`UNCLEAN_SOURCE ${report.group}`);
    if (report.candidateSha !== candidateSha) { findings.push(`CANDIDATE_MISMATCH ${report.group}`); continue; }
    if (!["static", "database"].includes(report.group) || groups[report.group]) { findings.push(`INVALID_OR_DUPLICATE_GROUP ${report.group}`); continue; }
    const passed = Object.values(report.checks).every((check) => check.status === "pass");
    if (passed !== report.passed) findings.push(`GROUP_STATUS_CONFLICT ${report.group}`);
    groups[report.group] = passed ? "pass" : "fail";
    for (const [id, result] of Object.entries(report.checks)) {
      if (checks[id]) findings.push(`DUPLICATE_CHECK ${id}`);
      else checks[id] = result;
    }
    audit.push(...(report.cutoverAudit ?? []));
    consequenceAudit.push(...(report.consequenceAudit ?? []));
  }
  for (const group of ["static", "database"]) if (!groups[group]) findings.push(`MISSING_DISCOVERY_GROUP ${group}`);
  const uniqueFindings = [...new Set([...findings, ...Object.values(checks).flatMap((check) => check.findings)])].sort();
  const findingCounts: Record<string, number> = {};
  for (const finding of uniqueFindings) {
    const category = finding.split(" ")[0];
    findingCounts[category] = (findingCounts[category] ?? 0) + 1;
  }
  return {
    schemaVersion: 1, candidateSha,
    passed: findings.length === 0 && Object.values(groups).every((status) => status === "pass"),
    groups, checks, discoveryFindings: findings, findings: uniqueFindings, findingCounts, cutoverAudit: audit, consequenceAudit,
  };
}
