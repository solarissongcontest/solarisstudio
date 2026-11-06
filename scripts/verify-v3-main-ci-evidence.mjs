import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

const REQUIRED_WORKFLOWS = Object.freeze([
  "Quality",
  "Browser audit",
  "V3 S13 Migration Adoption",
]);

const shaPattern = /^[0-9a-f]{40}$/;

export function evaluateMainCiEvidence({ expectedSha, ref, firstMainSha, lastMainSha, workflowRuns }) {
  if (!shaPattern.test(expectedSha ?? "")) throw new Error("Expected an exact 40-character lowercase commit SHA");
  if (!Array.isArray(workflowRuns)) throw new Error("GitHub workflow run evidence must be an array");

  const workflowResults = REQUIRED_WORKFLOWS.map((name) => {
    const candidates = workflowRuns
      .filter((run) =>
        run.name === name &&
        run.head_sha === expectedSha &&
        run.head_branch === "main" &&
        run.event === "push",
      )
      .sort((a, b) =>
        (Date.parse(b.run_started_at ?? b.created_at ?? "") || 0) -
          (Date.parse(a.run_started_at ?? a.created_at ?? "") || 0) ||
        (b.id ?? 0) - (a.id ?? 0),
      );
    const latest = candidates[0];
    return {
      name,
      status: latest?.status ?? "missing",
      conclusion: latest?.conclusion ?? null,
      runId: latest?.id ?? null,
      runAttempt: latest?.run_attempt ?? null,
      url: latest?.html_url ?? null,
      passed: latest?.status === "completed" && latest?.conclusion === "success",
    };
  });

  const refIsMain = ref === "refs/heads/main";
  const firstMainMatches = firstMainSha === expectedSha;
  const lastMainMatches = lastMainSha === expectedSha;
  const passed = refIsMain && firstMainMatches && lastMainMatches && workflowResults.every((run) => run.passed);
  return {
    schemaVersion: 1,
    scope: "post-merge-main-quality-browser-s13",
    expectedSha,
    firstMainSha,
    lastMainSha,
    ref,
    refIsMain,
    mainUnchanged: firstMainMatches && lastMainMatches,
    workflows: workflowResults,
    passed,
    releaseCertified: false,
  };
}

export async function fetchGithubJson(url, token, fetchImpl = fetch) {
  if (!token) throw new Error("GITHUB_TOKEN is required for read-only GitHub Actions evidence");
  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`GitHub evidence request failed: HTTP ${response.status}`);
  return response.json();
}

async function gatherEvidence({ repository, expectedSha, token, fetchJson = fetchGithubJson }) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? "")) {
    throw new Error("GITHUB_REPOSITORY must be owner/repository");
  }
  if (!shaPattern.test(expectedSha ?? "")) throw new Error("GITHUB_SHA must be an exact commit SHA");
  const api = `https://api.github.com/repos/${repository}`;
  const firstMain = await fetchJson(`${api}/branches/main`, token);
  const runs = [];
  for (let page = 1; page <= 5; page++) {
    const result = await fetchJson(
      `${api}/actions/runs?branch=main&event=push&head_sha=${expectedSha}&per_page=100&page=${page}`,
      token,
    );
    if (!Array.isArray(result.workflow_runs) || !Number.isInteger(result.total_count)) {
      throw new Error("GitHub workflow runs response has no authoritative run count");
    }
    runs.push(...result.workflow_runs);
    if (runs.length >= result.total_count) break;
    if (page === 5) throw new Error("More than 500 runs for this exact commit; evidence is incomplete");
  }
  const lastMain = await fetchJson(`${api}/branches/main`, token);
  return evaluateMainCiEvidence({
    expectedSha,
    ref: process.env.GITHUB_REF,
    firstMainSha: firstMain?.commit?.sha,
    lastMainSha: lastMain?.commit?.sha,
    workflowRuns: runs,
  });
}

function writeEvidence(report, path, summaryPath) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
  if (!summaryPath) return;
  const lines = [
    "## Solaris V3 post-merge main CI evidence",
    "",
    `- Expected SHA: \`${report.expectedSha ?? "unknown"}\``,
    `- Main at start: \`${report.firstMainSha ?? "unknown"}\``,
    `- Main at end: \`${report.lastMainSha ?? "unknown"}\``,
    `- Exact-current-main gate: **${report.passed ? "PASS" : "FAIL"}**`,
    "- This gate is not V3 production deployment or final release certification.",
    "",
    "| Workflow | Status | Conclusion | Evidence |",
    "|---|---|---|---|",
    ...(report.workflows ?? []).map((run) =>
      `| ${run.name} | ${run.status} | ${run.conclusion ?? "none"} | ${run.url ? `[Run](${run.url})` : "Missing"} |`,
    ),
    "",
  ];
  appendFileSync(summaryPath, `${lines.join("\n")}\n`);
}

async function main() {
  const expectedSha = process.env.GITHUB_SHA;
  const reportPath = process.env.POSTMERGE_CI_REPORT ?? "artifacts/v3-postmerge-main-ci-evidence.json";
  let report;
  try {
    report = await gatherEvidence({
      repository: process.env.GITHUB_REPOSITORY,
      expectedSha,
      token: process.env.GITHUB_TOKEN,
    });
  } catch (error) {
    report = {
      schemaVersion: 1,
      scope: "post-merge-main-quality-browser-s13",
      expectedSha: expectedSha ?? null,
      passed: false,
      releaseCertified: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  writeEvidence(report, reportPath, process.env.GITHUB_STEP_SUMMARY);
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
