/**
 * Read-only S14 cross-system defect sweep.
 *
 * Collates independently executed local-only verification results and the exact
 * source currently checked out. This is diagnostic evidence, NEVER a replacement
 * for S14/S15/S16 release certification.
 *
 * No network clients, credentials, hosted Supabase, or database mutations.
 */
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SHA = /^[0-9a-f]{40}$/;
export const STAGES = [
  "stage-1-setup",
  "stage-2-delegation-onboarding",
  "stage-3-confirmations",
  "stage-4-entries",
  "stage-5-running-orders",
  "stage-6-jury",
  "stage-7-public-voting",
  "stage-8-results",
  "stage-9-publication",
  "stage-10-archive",
];
export const EXTENSIONS = [
  "grand-final-qualifier-bridge",
  "grand-final-voting",
  "grand-final-results",
  "grand-final-publication",
];
export const LANES = ["full-contest", "archive", "deadline", "televote-truth"];

function loadJson(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}
function source(root, path) {
  const full = resolve(root, path);
  return existsSync(full) ? readFileSync(full, "utf8") : "";
}
function sameMembers(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length &&
    expected.every((x) => actual.includes(x));
}
function safeText(value) {
  return String(value ?? "").replace(/[\r\n]/g, " ").slice(0, 350);
}
function finding(id, group, status, detail, evidence) {
  return { id, group, status, detail: safeText(detail), evidence };
}
function checkSha(report, candidateSha, label, findings) {
  if (report && report.candidateSha !== candidateSha) {
    findings.push(finding(
      "EVIDENCE_SHA_MISMATCH_" + label,
      "evidence-integrity",
      "confirmed-blocker",
      label + " belongs to a different or missing commit SHA",
      label,
    ));
    return false;
  }
  return Boolean(report);
}

export function collectDefectSweep({ root, evidenceDir, candidateSha, toolSha = candidateSha }) {
  if (!SHA.test(candidateSha) || !SHA.test(toolSha)) throw new Error("Exact lowercase 40-character candidate and tooling SHAs are required");
  const dir = resolve(evidenceDir);
  const findings = [];
  const checks = {};
  const counts = {};
  const sources = {
    stage7: ".github/scripts/v3-s14-stage-7-genuine-deadline.sh",
    stage8: "scripts/v3-s14-materialize-televote-results.ts",
    robust: "src/integrations/televoting/robust-televote-math.ts",
  };

  // These are known semantic defects, not generic text-only 'test failed' guesses.
  const stage7 = source(root, sources.stage7);
  if (stage7 && /clock_timestamp\(\)\s*>=\s*closes_at\)::text/.test(stage7) &&
    /==\s*["']t["']/.test(stage7)) {
    findings.push(finding(
      "S14_STAGE7_BOOLEAN_TEXT_POLL",
      "s14-harness",
      "confirmed-source-defect",
      "PostgreSQL boolean::text returns true/false, but the expiry poll waits for t.",
      sources.stage7,
    ));
  }

  const adapter = source(root, sources.stage8);
  const robust = source(root, sources.robust);
  if (adapter.includes("Stage 8 adapter supports only the canonical") &&
    adapter.includes("CALC_ENGINE_VERSION") && robust.includes("robust-televote-v2")) {
    findings.push(finding(
      "S14_STAGE8_ENGINE_COMPATIBILITY",
      "results-integration",
      "confirmed-source-risk",
      "The S14 Stage 8 adapter rejects robust-televote-v2; verify the round engine on this candidate before full rehearsal.",
      sources.stage8,
    ));
  }

  const s14Readiness = loadJson(join(dir, "s14-readiness.json"));
  if (s14Readiness) {
    checks.s14Readiness = { ready: s14Readiness.ready === true, blockerCount: (s14Readiness.blockers ?? []).length };
    for (const blocker of s14Readiness.blockers ?? []) {
      findings.push(finding(
        "S14_READINESS_" + findings.length,
        "s14-readiness",
        "requires-triage",
        blocker,
        "s14-readiness.json",
      ));
    }
  } else {
    checks.s14Readiness = { state: "not-observed" };
  }

  const s15 = loadJson(join(dir, "s15-readiness.json"));
  if (s15) {
    checks.s15 = {
      zeroOrphans: s15.zeroOrphans === true,
      total: Array.isArray(s15.findings) ? s15.findings.length : null,
      physicalOwnershipZeroConflicts: s15.physicalOwnership?.zeroOwnershipConflicts ?? null,
    };
    for (const text of s15.findings ?? []) {
      const code = String(text).split(/\s+/)[0];
      counts[code] = (counts[code] ?? 0) + 1;
    }
    for (const [code, count] of Object.entries(counts).sort()) {
      const migration = code === "PUBLIC_CUTOVER_UNRESOLVED" || code === "ORGANIZER_CUTOVER_UNRESOLVED";
      findings.push(finding(
        "S15_" + code,
        "s15-inventory",
        migration ? "cutover-inventory-needs-risk-triage" : "requires-triage",
        count + " distinct findings, grouped by common audit cause. No release-risk reclassification is assumed.",
        "s15-readiness.json",
      ));
    }
  } else {
    checks.s15 = { state: "not-observed" };
  }

  const staticResults = loadJson(join(dir, "checks-static.json"));
  checks.static = {};
  if (staticResults) {
    checkSha(staticResults, candidateSha, "static-checks", findings);
    for (const check of staticResults.checks ?? []) {
      const name = String(check.id);
      checks.static[name] = check.exitCode === 0 ? "passed" : "failed";
      if (check.exitCode !== 0) findings.push(finding(
        "STATIC_" + name.toUpperCase().replace(/[^A-Z0-9]+/g, "_"),
        "static-verification", "confirmed-blocker",
        name + " exited with code " + check.exitCode, "checks-static.json",
      ));
    }
  }

  const laneStatuses = {};
  for (const lane of LANES) {
    const path = join(dir, "runtime-" + lane + ".json");
    const report = loadJson(path);
    if (!report) {
      laneStatuses[lane] = "not-run";
      continue;
    }
    if (!checkSha(report, candidateSha, "runtime-" + lane, findings)) {
      laneStatuses[lane] = "invalid-evidence";
      continue;
    }
    const ok = report.exitCode === 0 && report.status === "passed";
    // 90/91/92/93 are local-bootstrap, isolation, lane-config and
    // unexpected-step-abort evidence sentinels. None proves a contest runtime failure; all block evidence.
    const preflight = new Map([
      [90, "disposable local Supabase setup"],
      [91, "production-isolation verification"],
      [92, "runtime lane configuration"],
      [93, "scenario step aborted before producing evidence"],
    ]).get(report.exitCode);
    laneStatuses[lane] = ok ? "passed" : preflight ? "blocked-preflight" : "failed";
    if (!ok) {
      findings.push(finding(
        (preflight ? "PREFLIGHT_" : "RUNTIME_") + lane.toUpperCase().replace(/-/g, "_"),
        preflight ? "execution-prerequisite" : "independent-runtime",
        "confirmed-blocker",
        preflight
          ? lane + " never reached its rehearsal: " + preflight + " failed (code " + report.exitCode + ")"
          : lane + " isolated local rehearsal exited with code " + report.exitCode,
        "runtime-" + lane + ".json",
      ));
    }
  }
  checks.localRuntimeLanes = laneStatuses;

  const final = loadJson(join(dir, "s14-full-contest.json"));
  const partial = loadJson(join(dir, "s14-full-contest.partial.json"));
  if (final && partial) {
    findings.push(finding("S14_CONFLICTING_EVIDENCE", "evidence-integrity", "confirmed-blocker",
      "Full and partial S14 evidence exist for the same candidate.", "s14-full-contest*.json"));
  }
  let fullContestProof = "not-observed";
  if (final && checkSha(final, candidateSha, "s14-final", findings)) {
    const valid = final.passed === true && final.partial === false && final.runtimeFailure === false &&
      sameMembers(final.completedStages, STAGES) &&
      sameMembers(final.completedContestExtensions, EXTENSIONS) &&
      Array.isArray(final.pendingStages) && final.pendingStages.length === 0 &&
      Array.isArray(final.pendingContestExtensions) && final.pendingContestExtensions.length === 0 &&
      Array.isArray(final.blockedContestExtensions) && final.blockedContestExtensions.length === 0 &&
      final.lifecycle?.finalState === "archived";
    fullContestProof = valid ? "complete-on-exact-sha" : "invalid";
    if (!valid) findings.push(finding(
      "S14_INVALID_FINAL_EVIDENCE", "evidence-integrity", "confirmed-blocker",
      "Final evidence is missing required stage, extension, runtime, or archived-state assertions.",
      "s14-full-contest.json",
    ));
  } else if (partial && checkSha(partial, candidateSha, "s14-partial", findings)) {
    fullContestProof = "failed-" + safeText(partial.failurePhase ?? "unknown");
    findings.push(finding(
      "S14_FIRST_SEMANTIC_FAILURE",
      "s14-runtime",
      "confirmed-blocker",
      "First failure: " + safeText(partial.failureStage) + "; phase: " + safeText(partial.failurePhase) +
        "; subsequent stages not proven on this stateful run.",
      "s14-full-contest.partial.json",
    ));
  }
  if (laneStatuses["full-contest"] === "passed" && fullContestProof !== "complete-on-exact-sha") {
    findings.push(finding(
      "S14_RUNTIME_EVIDENCE_GAP", "evidence-integrity", "confirmed-blocker",
      "Full-contest lane claims success without matching complete S14 evidence.", "runtime-full-contest.json",
    ));
  }
  checks.s14 = { proof: fullContestProof };

  const blockers = findings.filter((item) => item.status === "confirmed-blocker" ||
    item.status === "confirmed-source-defect").length;
  const notRun = LANES.filter((lane) => ["not-run", "blocked-preflight"].includes(laneStatuses[lane]));
  return {
    schemaVersion: 1,
    kind: "read-only-cross-system-defect-sweep",
    candidateSha,
    toolSha,
    certification: "NOT_CERTIFICATION",
    // An audit is never evidence that unknown future defects are absent.
    conclusion: blockers ? "confirmed-defects-or-failures" :
      notRun.length ? "incomplete-diagnostic" : "no-confirmed-failure-in-observed-scope",
    exactShaFullContestProof: fullContestProof,
    checks,
    findingCounts: counts,
    confirmedBlockerCount: blockers,
    unexecutedLanes: notRun,
    findings,
  };
}

export function renderMarkdown(report) {
  const lines = [
    "# V3 S14 cross-system defect sweep",
    "",
    "**Candidate:** " + report.candidateSha,
    "**Sweep tooling:** " + report.toolSha,
    "**Status:** " + report.conclusion + " (diagnostic only; NOT release certification)",
    "**Full S14 proof:** " + report.exactShaFullContestProof,
    "**Confirmed failures/source defects:** " + report.confirmedBlockerCount,
    "",
    "## Independent verification lanes",
    "",
    "| Lane | Evidence status |",
    "| --- | --- |",
    ...Object.entries(report.checks.localRuntimeLanes).map(([id, s]) => "| " + id + " | " + s + " |"),
    "",
    "## S15 inventory (not automatically hard blockers)",
    "",
    ...Object.entries(report.findingCounts).sort().map(([k, v]) => "- " + k + ": " + v),
    "",
    "## Root-cause groups",
    "",
    ...report.findings.map((f) => "- **" + f.id + "** [" + f.status + "]: " + f.detail + " (" + f.evidence + ")"),
    "",
    "## Rules",
    "",
    "Missing evidence is never a pass. Independent lanes use isolated local Supabase. The S15 cutover inventory must receive explicit release-risk classifications under the newer V3 authority addendum; counts alone do not prove runtime defects. S14 is certified only by a separate complete exact-SHA full-contest rehearsal.",
    "",
  ];
  return lines.join("\n");
}
function argValue(flag, fallback) {
  const n = process.argv.indexOf(flag);
  return n === -1 ? fallback : process.argv[n + 1];
}
async function cli() {
  const candidateSha = argValue("--candidate", process.env.V3_CANDIDATE_SHA || "");
  const evidenceDir = argValue("--evidence-dir", "sweep-data/sweep");
  const toolSha = argValue("--tool-sha", candidateSha);
  const jsonPath = argValue("--json", "sweep-report.json");
  const markdownPath = argValue("--markdown", "sweep-report.md");
  const report = collectDefectSweep({ root: process.cwd(), evidenceDir, candidateSha, toolSha });
  for (const [path, text] of [
    [jsonPath, JSON.stringify(report, null, 2) + "\n"],
    [markdownPath, renderMarkdown(report)],
  ]) {
    mkdirSync(dirname(resolve(path)), { recursive: true });
    writeFileSync(path, text);
  }
  process.stdout.write(renderMarkdown(report) + "\n");
  if (process.argv.includes("--require-runtime-clean") &&
    (report.confirmedBlockerCount > 0 || report.unexecutedLanes.length > 0 ||
     report.exactShaFullContestProof !== "complete-on-exact-sha")) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  cli().catch((error) => {
    process.stderr.write(String(error) + "\n");
    process.exitCode = 1;
  });
}
