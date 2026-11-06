#!/usr/bin/env node
// Independent, read-only S14/S15 integration diagnostics. Never a release certificate.
// No database client is created and no network/database command is executed here.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const LOCAL_API = "http://127.0.0.1:54321";

function read(path) {
  const target = resolve(ROOT, path);
  return existsSync(target) ? readFileSync(target, "utf8") : "";
}

function run(program, args, env = process.env, timeout = 90000) {
  const result = spawnSync(program, args, {
    cwd: ROOT, encoding: "utf8", env, timeout, maxBuffer: 12 * 1024 * 1024,
  });
  return {
    status: result.status,
    error: result.error?.message ?? null,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

export function unsafeEnvironmentKeys(env) {
  return Object.entries(env).flatMap(([key, raw]) => {
    if (!raw || !/(?:SUPABASE|DATABASE_URL|DB_URL|PGHOST|PGSERVICE|SERVICE_ROLE_KEY|^API_URL$)/i.test(key)) return [];
    if (/SERVICE_ROLE_KEY/i.test(key)) return [key];
    if (/PGHOST/i.test(key)) return /^(127\.0\.0\.1|localhost|::1)$/i.test(raw) ? [] : [key];
    if (/PGSERVICE/i.test(key)) return [key];
    if (!/(?:URL|HOST|DB_URL)/i.test(key)) return [];
    if (/^https?:/i.test(raw)) {
      try {
        const parsed = new URL(raw);
        return /^(127\.0\.0\.1|localhost|\[::1\])$/i.test(parsed.hostname) && parsed.protocol === "http:" ? [] : [key];
      } catch { return [key]; }
    }
    // PostgreSQL DSNs are not needed for a source-only scan.
    return [key];
  });
}

export function classifyS15Finding(value) {
  const type = String(value).split(/\s+/)[0];
  if (/^(?:PUBLIC|ORGANIZER)_CUTOVER_UNRESOLVED$/.test(type)) {
    return { family: "capability-cutover", risk: "release-scope-review" };
  }
  if (/^(?:SYSTEM_COMMAND_MULTIPLE_OWNERS|SYSTEM_EVENT_MULTIPLE_OWNERS|PHYSICAL_.*|.*OWNERSHIP_CONFLICT.*)$/.test(type)) {
    return { family: "canonical-ownership", risk: "potential-integrity-blocker" };
  }
  if (/^(?:RUNTIME_API_ROUTE_ORPHAN|SYSTEM_CONCEPT_ORPHAN|SYSTEM_COMMAND_ORPHAN|SYSTEM_EVENT_ORPHAN)$/.test(type)) {
    return { family: "unowned-canonical-surface", risk: "potential-integrity-blocker" };
  }
  if (/^(?:PUBLIC|ORGANIZER|RUNTIME)_.*(?:ROUTE|SURFACE|ALIAS).*ORPHAN$/.test(type)) {
    return { family: "surface-registry", risk: "release-scope-review" };
  }
  return { family: "unclassified-inventory", risk: "needs-triage" };
}

export function detectS14SourceDefects(files) {
  const { deadline = "", stage7 = "", stage8 = "", adapter = "", math = "", migration = "" } = files;
  const findings = [];
  if (/\(\s*clock_timestamp\(\)\s*>=\s*closes_at\s*\)::text[\s\S]{0,220}==\s*["']t["']/.test(deadline)) {
    findings.push({
      id: "S14-STAGE7-BOOLEAN-POLL", stage: "stage-7-public-voting",
      family: "rehearsal-driver", risk: "confirmed-integration-blocker",
      detail: "PostgreSQL boolean::text produces true/false, but the expiry poll expects t.",
      source: ".github/scripts/v3-s14-stage-7-genuine-deadline.sh",
    });
  }
  const databaseDefaultsRobust = /alter\s+column\s+televote_engine_version\s+set\s+default\s+['"]robust-televote-v2['"]/i.test(migration);
  const adapterRequiresRankV1 = /CALC_ENGINE_VERSION\s*=\s*["']rank-weighted-v1["']/.test(math)
    && adapter.includes("!== CALC_ENGINE_VERSION");
  const stage7OmitsEngine = !/televote_engine_version\s*(?:=|,)/.test(stage7);
  if (databaseDefaultsRobust && adapterRequiresRankV1 && stage7OmitsEngine
      && stage8.includes("v3-s14-materialize-televote-results.ts")) {
    findings.push({
      id: "S14-STAGE8-ENGINE-MISMATCH", stage: "stage-8-results",
      family: "rehearsal-integration", risk: "confirmed-integration-blocker",
      detail: "Stage 7 inherits robust-televote-v2 from the database, while the Stage 8 materializer only accepts rank-weighted-v1.",
      source: "scripts/v3-s14-materialize-televote-results.ts",
    });
  }
  if (/\.from\(["']round_results["']\)\.delete\(/.test(adapter)
      && /\.from\(["']round_results["']\)\.insert\(/.test(adapter)
      && /\.from\(["']televote_votes["']\)\.insert\(/.test(adapter)) {
    findings.push({
      id: "S14-STAGE8-TEST-WRITER-REVIEW", stage: "stage-8-results",
      family: "canonical-authority-review", risk: "needs-triage",
      detail: "Local-only Stage 8 helper uses multi-step direct writes. Verify that real Results uses governed atomic commands; do not mistake this fixture for production proof.",
      source: "scripts/v3-s14-materialize-televote-results.ts",
    });
  }
  return findings;
}

export function summarizeFindings(findings) {
  const grouped = new Map();
  for (const f of findings) {
    const key = f.family + "|" + f.risk;
    const item = grouped.get(key) ?? { family: f.family, risk: f.risk, count: 0, ids: [] };
    item.count += 1;
    item.ids.push(f.id);
    grouped.set(key, item);
  }
  return [...grouped.values()].sort((a, b) => b.count - a.count || a.family.localeCompare(b.family));
}

function scrub(text) {
  return String(text).replace(/(sb_secret_|sb_service_role_|eyJ[A-Za-z0-9_-]{20,})[^\s"']*/g, "[REDACTED]").slice(0, 4000);
}

function parseCheck(name, args, env, findings, checks) {
  const result = run("bun", ["run", ...args], env);
  const check = { name, status: result.status, passed: result.status === 0, diagnostics: null };
  let payload = null;
  if (result.status === 0) {
    try { payload = JSON.parse(result.stdout); }
    catch (error) {
      check.passed = false;
      check.diagnostics = "Invalid JSON: " + String(error);
    }
  } else {
    check.diagnostics = scrub(result.error || result.stderr || result.stdout || "Unknown execution failure");
  }
  if (!check.passed) findings.push({
    id: "SWEEP-SCANNER-" + name.toUpperCase().replace(/[^A-Z0-9]+/g, "-"),
    family: "sweep-infrastructure", risk: "unproven",
    detail: name + " could not produce valid source evidence.",
  });
  checks.push(check);
  return payload;
}

function gitBlob(ref, file) {
  if (!/^[a-f0-9]{40}$/.test(ref)) return null;
  const result = run("git", ["show", ref + ":" + file]);
  return result.status === 0 ? result.stdout : null;
}

function loadEvidence(sha, findings) {
  const file = read("v3-release-evidence/s14-full-contest.json");
  if (!file) return { status: "not-present", certified: false };
  try {
    const data = JSON.parse(file);
    const matching = data.candidateSha === sha;
    if (!matching) findings.push({
      id: "S14-STALE-EVIDENCE", family: "exact-sha-evidence", risk: "unproven",
      detail: "S14 full-contest evidence does not match the checked-out candidate; it cannot certify this run.",
    });
    return {
      status: matching && data.passed === true && data.lifecycle?.finalState === "archived"
        ? "candidate-s14-reported-pass" : "not-release-grade",
      certified: false, candidateMatches: matching,
      completedStages: data.completedStages ?? [],
      pendingStages: data.pendingStages ?? [],
    };
  } catch {
    findings.push({ id: "S14-INVALID-EVIDENCE", family: "exact-sha-evidence",
      risk: "unproven", detail: "S14 evidence exists but cannot be parsed." });
    return { status: "invalid", certified: false };
  }
}

function markdown(report) {
  const lines = [
    "# V3 cross-system integration defect sweep",
    "",
    "Candidate: " + report.candidateSha,
    "Reference: " + (report.referenceSha || "not provided"),
    "Mode: **diagnostic only, NOT release certification**.",
    "",
    "S14 independent source checks cannot replace the stateful ten-stage rehearsal. S15 inventory findings are not automatically release blockers.",
    "",
    "## Detected source risks",
    "",
    "| ID | Stage | Risk | Finding |",
    "| --- | --- | --- | --- |",
  ];
  for (const f of report.findings.filter(x => x.stage)) {
    lines.push("| " + f.id + " | " + f.stage + " | " + f.risk + " | " + f.detail.replace(/\|/g, "/") + " |");
  }
  if (!report.findings.some(x => x.stage)) lines.push("| None detected | - | - | Not proof of runtime correctness |");
  lines.push("", "## Independent check outcomes", "", "| Check | Result |", "| --- | --- |");
  for (const c of report.checks) lines.push("| " + c.name + " | " + (c.passed ? "passed" : "failed/unavailable") + " |");
  lines.push("", "## S15 ownership / cutover inventory by root-cause family", "", "| Family | Classification | Findings |", "| --- | --- | ---: |");
  for (const group of report.groups) lines.push("| " + group.family + " | " + group.risk + " | " + group.count + " |");
  lines.push("", "S15 findings retained in full in the JSON artifact. Source warnings and status checks do not waive any existing CI, RLS, S14, S15 or S16 gate.",
    "", "Runtime S14 evidence: " + report.s14Evidence.status, "",
    "No database was started or contacted by this sweep.", "");
  return lines.join("\n");
}

export function runSweep(argv = process.argv.slice(2)) {
  const bad = unsafeEnvironmentKeys(process.env);
  if (bad.length) throw new Error("Refusing diagnostic run with potentially hosted or privileged database configuration keys: " + bad.join(", "));
  const strict = argv.includes("--strict");
  const skipChecks = argv.includes("--skip-checks");
  const refIndex = argv.indexOf("--reference-sha");
  const referenceSha = refIndex < 0 ? null : argv[refIndex + 1];
  if (referenceSha && !/^[a-f0-9]{40}$/.test(referenceSha)) throw new Error("--reference-sha must be an exact lowercase commit SHA");
  const git = run("git", ["rev-parse", "HEAD"]);
  if (git.status !== 0 || !/^[a-f0-9]{40}$/.test(git.stdout.trim())) throw new Error("Cannot verify checked-out exact Git SHA.");
  const candidateSha = git.stdout.trim();
  if (process.env.V3_CANDIDATE_SHA && process.env.V3_CANDIDATE_SHA.toLowerCase() !== candidateSha) {
    throw new Error("V3_CANDIDATE_SHA does not match the checked-out commit.");
  }

  const checks = [];
  const findings = [];
  const allSourcePaths = {
    deadline: ".github/scripts/v3-s14-stage-7-genuine-deadline.sh",
    stage7: ".github/scripts/v3-s14-stage-7-public-voting.sh",
    stage8: ".github/scripts/v3-s14-stage-8-results.sh",
    adapter: "scripts/v3-s14-materialize-televote-results.ts",
    math: "src/integrations/televoting/televote-math.ts",
    migration: "supabase/migrations/20260906154000_robust_televote_v2.sql",
  };
  const sources = Object.fromEntries(Object.entries(allSourcePaths).map(([k, p]) => [k, read(p)]));
  for (const [key, path] of Object.entries(allSourcePaths)) {
    if (!sources[key]) findings.push({ id: "SWEEP-MISSING-" + key.toUpperCase(),
      family: "source-inventory", risk: "unproven", detail: "Expected source not found: " + path });
  }
  findings.push(...detectS14SourceDefects(sources));

  if (referenceSha) {
    const comparedPaths = Object.values(allSourcePaths);
    let compared = 0;
    for (const path of comparedPaths) {
      const old = gitBlob(referenceSha, path);
      if (old !== null) {
        compared++;
        if (old !== read(path)) findings.push({
          id: "REF-DIFF-" + path, family: "candidate-divergence",
          risk: "needs-triage", detail: "Candidate differs from reference at " + path,
        });
      }
    }
    if (compared === 0) findings.push({ id: "SWEEP-REFERENCE-UNAVAILABLE",
      family: "exact-sha-evidence", risk: "unproven",
      detail: "Reference commit is not reachable in the checkout; no comparison has been claimed." });
  }

  const env = { ...process.env, V3_VERIFICATION_TARGET: "local",
    SUPABASE_URL: LOCAL_API, VITE_SUPABASE_URL: LOCAL_API,
    VITE_CONFIRMATIONS_SUPABASE_URL: LOCAL_API, CONFIRMATIONS_SUPABASE_URL: LOCAL_API };
  let s14 = null;
  let s15 = null;
  if (!skipChecks) {
    s14 = parseCheck("S14-static-readiness",
      ["scripts/check-v3-s14-rehearsal-readiness.ts", "--json"], env, findings, checks);
    s15 = parseCheck("S15-inventory",
      ["scripts/check-v3-s15-zero-orphan-readiness.ts", "--json"], env, findings, checks);
    const contract = run("bun", ["run", "test", "src/lib/v3-s14-stateful-harness.contract.test.ts"], env, 120000);
    checks.push({ name: "S14-harness-contracts", passed: contract.status === 0, status: contract.status,
      diagnostics: contract.status === 0 ? null : scrub(contract.error || contract.stderr || contract.stdout) });
    if (contract.status !== 0) findings.push({ id: "SWEEP-S14-CONTRACTS",
      family: "focused-regression", risk: "unproven",
      detail: "S14 static harness regression test failed; inspect its test log." });
  }
  if (s14 && Array.isArray(s14.blockers)) for (const [index, detail] of s14.blockers.entries()) {
    findings.push({ id: "S14-READINESS-" + String(index + 1), family: "S14-static-readiness",
      risk: "needs-triage", detail: String(detail) });
  }
  if (s15 && Array.isArray(s15.findings)) for (const [index, value] of s15.findings.entries()) {
    const meta = classifyS15Finding(value);
    findings.push({ id: "S15-" + String(index + 1), sourceFinding: String(value), ...meta,
      detail: String(value) });
  }
  const report = {
    schemaVersion: 1, purpose: "diagnostic-not-certification",
    candidateSha, referenceSha, generatedAt: new Date().toISOString(),
    s14Evidence: loadEvidence(candidateSha, findings),
    s14Ready: s14?.ready ?? null, s15ZeroOrphans: s15?.zeroOrphans ?? null,
    checks, findings, groups: summarizeFindings(findings),
    counts: { total: findings.length,
      confirmedIntegrationBlockers: findings.filter(x => x.risk === "confirmed-integration-blocker").length,
      potentialIntegrityBlockers: findings.filter(x => x.risk === "potential-integrity-blocker").length },
    fullContestRuntimeExecuted: false, releaseCertified: false,
  };
  const out = resolve(ROOT, "v3-release-evidence");
  mkdirSync(out, { recursive: true });
  writeFileSync(resolve(out, "integration-defect-sweep.json"), JSON.stringify(report, null, 2) + "\n");
  writeFileSync(resolve(out, "integration-defect-sweep.md"), markdown(report));
  process.stdout.write("V3 independent sweep: " + report.counts.total + " findings; " +
    report.counts.confirmedIntegrationBlockers + " known integration blockers; " +
    report.counts.potentialIntegrityBlockers + " potential integrity blockers.\n");
  process.stdout.write("Candidate: " + candidateSha + "; report: v3-release-evidence/integration-defect-sweep.md\n");
  if (strict && report.findings.some(x => x.risk === "confirmed-integration-blocker"
      || x.risk === "potential-integrity-blocker" || x.risk === "unproven")) process.exitCode = 1;
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { runSweep(); }
  catch (error) { process.stderr.write(String(error) + "\n"); process.exitCode = 1; }
}
