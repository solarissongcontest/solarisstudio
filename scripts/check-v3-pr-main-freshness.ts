import { appendFileSync } from "node:fs";

const EXACT_SHA = /^[0-9a-f]{40}$/i;
const ACCEPTED_COMPARE_STATUSES = new Set(["ahead", "identical"]);
const FRESHNESS_STATUS_CONTEXT = "V3 PR Main Freshness";

export type V3PrMainFreshnessInput = {
  baseRef: string;
  currentMainSha: string;
  prHeadSha: string;
  compareStatus: string;
  mergeBaseSha: string;
  expectedEventHeadSha?: string | null;
};

export type V3PrMainFreshnessAssessment = {
  valid: boolean;
  baseRef: string;
  currentMainSha: string | null;
  prHeadSha: string | null;
  compareStatus: string;
  mergeBaseSha: string | null;
  errors: readonly string[];
};

type PullResponse = {
  number: number;
  title: string;
  base: { ref: string };
  head: { ref: string; sha: string };
};

type BranchResponse = {
  commit: { sha: string };
};

type CompareResponse = {
  status: string;
  merge_base_commit: { sha: string };
};

type StatusState = "success" | "failure" | "error";

function exactSha(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return EXACT_SHA.test(normalized) ? normalized : null;
}

export function isV3PullForFreshness(pull: Pick<PullResponse, "title" | "base" | "head">): boolean {
  return (
    pull.base.ref === "main" &&
    (pull.head.ref.startsWith("v3/") || pull.title.startsWith("[V3-"))
  );
}

export function assessV3PrMainFreshness(
  input: V3PrMainFreshnessInput,
): V3PrMainFreshnessAssessment {
  const errors: string[] = [];
  const currentMainSha = exactSha(input.currentMainSha);
  const prHeadSha = exactSha(input.prHeadSha);
  const mergeBaseSha = exactSha(input.mergeBaseSha);
  const expectedEventHeadSha = input.expectedEventHeadSha
    ? exactSha(input.expectedEventHeadSha)
    : null;

  if (input.baseRef !== "main") {
    errors.push(`V3 integration freshness applies only to main-based PRs; received ${input.baseRef}`);
  }
  if (!currentMainSha) errors.push("current main SHA is not an exact 40-character SHA");
  if (!prHeadSha) errors.push("pull-request head SHA is not an exact 40-character SHA");
  if (!mergeBaseSha) errors.push("compare merge-base SHA is not an exact 40-character SHA");
  if (input.expectedEventHeadSha && !expectedEventHeadSha) {
    errors.push("workflow event head SHA is not an exact 40-character SHA");
  }
  if (expectedEventHeadSha && prHeadSha && expectedEventHeadSha !== prHeadSha) {
    errors.push("pull-request head moved after this workflow event; rerun on the current exact head");
  }
  if (!ACCEPTED_COMPARE_STATUSES.has(input.compareStatus)) {
    errors.push(
      `pull-request head does not contain current main (compare status: ${input.compareStatus || "unknown"})`,
    );
  }
  if (currentMainSha && mergeBaseSha && currentMainSha !== mergeBaseSha) {
    errors.push("current main is not the merge base of the pull-request head");
  }

  return {
    valid: errors.length === 0,
    baseRef: input.baseRef,
    currentMainSha,
    prHeadSha,
    compareStatus: input.compareStatus,
    mergeBaseSha,
    errors,
  };
}

async function githubRequest<T>(
  url: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API ${response.status} for ${url}: ${body.slice(0, 400)}`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function workflowUrl(repository: string): string | undefined {
  const runId = process.env.GITHUB_RUN_ID?.trim();
  return runId ? `https://github.com/${repository}/actions/runs/${runId}` : undefined;
}

async function publishFreshnessStatus(
  apiBase: string,
  repository: string,
  token: string,
  headSha: string,
  state: StatusState,
  description: string,
): Promise<void> {
  const targetUrl = workflowUrl(repository);
  await githubRequest(
    `${apiBase}/statuses/${encodeURIComponent(headSha)}`,
    token,
    {
      method: "POST",
      body: JSON.stringify({
        state,
        context: FRESHNESS_STATUS_CONTEXT,
        description: description.slice(0, 140),
        ...(targetUrl ? { target_url: targetUrl } : {}),
      }),
    },
  );
}

async function currentMainSha(apiBase: string, token: string): Promise<string> {
  const branch = await githubRequest<BranchResponse>(`${apiBase}/branches/main`, token);
  return branch.commit.sha;
}

async function assessPull(
  apiBase: string,
  token: string,
  pull: PullResponse,
  mainSha: string,
  expectedEventHeadSha?: string | null,
): Promise<V3PrMainFreshnessAssessment> {
  const compare = await githubRequest<CompareResponse>(
    `${apiBase}/compare/${encodeURIComponent(mainSha)}...${encodeURIComponent(pull.head.sha)}`,
    token,
  );
  return assessV3PrMainFreshness({
    baseRef: pull.base.ref,
    currentMainSha: mainSha,
    prHeadSha: pull.head.sha,
    compareStatus: compare.status,
    mergeBaseSha: compare.merge_base_commit.sha,
    expectedEventHeadSha,
  });
}

function appendAssessmentSummary(
  prNumber: number | string,
  assessment: V3PrMainFreshnessAssessment,
): void {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY?.trim();
  if (!summaryPath) return;
  const mark = assessment.valid ? "✅" : "❌";
  const lines = [
    "",
    `### V3 PR #${prNumber} main freshness`,
    "",
    `${mark} ${assessment.valid ? "fresh" : "stale / invalid"}`,
    "",
    `- current main: \`${assessment.currentMainSha ?? "invalid"}\``,
    `- PR head: \`${assessment.prHeadSha ?? "invalid"}\``,
    `- merge base: \`${assessment.mergeBaseSha ?? "invalid"}\``,
    `- compare status: \`${assessment.compareStatus || "unknown"}\``,
  ];
  if (assessment.errors.length) {
    lines.push("", "Failures:", ...assessment.errors.map((error) => `- ${error}`));
  }
  lines.push("");
  appendFileSync(summaryPath, `${lines.join("\n")}\n`, "utf8");
}

async function listOpenMainPulls(apiBase: string, token: string): Promise<PullResponse[]> {
  const pulls: PullResponse[] = [];
  for (let page = 1; ; page += 1) {
    const batch = await githubRequest<PullResponse[]>(
      `${apiBase}/pulls?state=open&base=main&per_page=100&page=${page}`,
      token,
    );
    pulls.push(...batch);
    if (batch.length < 100) break;
  }
  return pulls;
}

export async function runV3PrMainFreshnessCheck(): Promise<number> {
  const repository = requireEnv("GITHUB_REPOSITORY");
  const token = requireEnv("GITHUB_TOKEN");
  const prNumber = requireEnv("V3_CURRENT_PR");
  const expectedEventHeadSha = process.env.V3_EXPECTED_HEAD_SHA?.trim() || null;
  const apiBase = `https://api.github.com/repos/${repository}`;

  const pull = await githubRequest<PullResponse>(`${apiBase}/pulls/${prNumber}`, token);
  if (String(pull.number) !== prNumber) {
    throw new Error(`GitHub returned PR #${pull.number} while #${prNumber} was requested`);
  }
  if (!isV3PullForFreshness(pull)) {
    throw new Error(`PR #${prNumber} is not a main-based V3 pull request`);
  }

  const mainSha = await currentMainSha(apiBase, token);
  const assessment = await assessPull(
    apiBase,
    token,
    pull,
    mainSha,
    expectedEventHeadSha,
  );
  appendAssessmentSummary(prNumber, assessment);
  process.stdout.write(`${JSON.stringify(assessment, null, 2)}\n`);

  await publishFreshnessStatus(
    apiBase,
    repository,
    token,
    pull.head.sha,
    assessment.valid ? "success" : "failure",
    assessment.valid
      ? `Fresh: exact head contains current main ${mainSha.slice(0, 7)}`
      : `Stale: restack on current main ${mainSha.slice(0, 7)} and rerun exact-head gates`,
  );

  if (!assessment.valid) {
    console.error(
      `[v3-pr-main-freshness] FAIL: ${assessment.errors.join("; ")}. Restack on literal current main and rerun exact-head evidence.`,
    );
    return 1;
  }
  console.error(
    `[v3-pr-main-freshness] PASS: PR #${prNumber} head ${assessment.prHeadSha} contains current main ${assessment.currentMainSha}.`,
  );
  return 0;
}

export async function refreshOpenV3PrFreshnessStatuses(): Promise<number> {
  const repository = requireEnv("GITHUB_REPOSITORY");
  const token = requireEnv("GITHUB_TOKEN");
  const apiBase = `https://api.github.com/repos/${repository}`;
  const mainSha = await currentMainSha(apiBase, token);
  const pulls = (await listOpenMainPulls(apiBase, token)).filter(isV3PullForFreshness);
  let fresh = 0;
  let stale = 0;
  let errored = 0;

  for (const pull of pulls) {
    try {
      const assessment = await assessPull(apiBase, token, pull, mainSha);
      appendAssessmentSummary(pull.number, assessment);
      await publishFreshnessStatus(
        apiBase,
        repository,
        token,
        pull.head.sha,
        assessment.valid ? "success" : "failure",
        assessment.valid
          ? `Fresh: exact head contains current main ${mainSha.slice(0, 7)}`
          : `Stale: restack on current main ${mainSha.slice(0, 7)} and rerun exact-head gates`,
      );
      if (assessment.valid) fresh += 1;
      else stale += 1;
    } catch (error) {
      errored += 1;
      const detail = error instanceof Error ? error.message : String(error);
      await publishFreshnessStatus(
        apiBase,
        repository,
        token,
        pull.head.sha,
        "error",
        `Freshness check failed closed: ${detail}`,
      );
      console.error(`[v3-pr-main-freshness] PR #${pull.number} ERROR: ${detail}`);
    }
  }

  const summaryPath = process.env.GITHUB_STEP_SUMMARY?.trim();
  if (summaryPath) {
    appendFileSync(
      summaryPath,
      `\n### Main-movement refresh\n\n- current main: \`${mainSha}\`\n- open V3 PRs: ${pulls.length}\n- fresh: ${fresh}\n- stale: ${stale}\n- check errors: ${errored}\n\nStale PRs receive a failing \`${FRESHNESS_STATUS_CONTEXT}\` status on their exact head. The main push itself is not failed merely because old PRs need restacking.\n`,
      "utf8",
    );
  }

  console.error(
    `[v3-pr-main-freshness] refreshed ${pulls.length} open V3 PRs against ${mainSha}: ${fresh} fresh, ${stale} stale, ${errored} errors`,
  );
  return errored > 0 ? 2 : 0;
}

if (import.meta.main) {
  const runner = process.env.V3_SCAN_OPEN_PRS === "1"
    ? refreshOpenV3PrFreshnessStatuses
    : runV3PrMainFreshnessCheck;
  runner()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      const detail = error instanceof Error ? error.message : String(error);
      console.error(`[v3-pr-main-freshness] ERROR: ${detail}`);
      process.exitCode = 2;
    });
}
