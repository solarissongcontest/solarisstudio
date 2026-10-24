import { appendFileSync } from "node:fs";

const EXACT_SHA = /^[0-9a-f]{40}$/i;
const ACCEPTED_COMPARE_STATUSES = new Set(["ahead", "identical"]);

export type V3PrMainFreshnessInput = {
  baseRef: string;
  currentMainSha: string;
  prHeadSha: string;
  compareStatus: string;
  mergeBaseSha: string;
  expectedEventHeadSha?: string | null;
  finalMainSha?: string | null;
  finalPrHeadSha?: string | null;
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
  const finalMainSha = input.finalMainSha ? exactSha(input.finalMainSha) : null;
  const finalPrHeadSha = input.finalPrHeadSha ? exactSha(input.finalPrHeadSha) : null;

  if (input.baseRef !== "main") {
    errors.push(`V3 integration freshness applies only to main-based PRs; received ${input.baseRef}`);
  }
  if (!currentMainSha) errors.push("current main SHA is not an exact 40-character SHA");
  if (!prHeadSha) errors.push("pull-request head SHA is not an exact 40-character SHA");
  if (!mergeBaseSha) errors.push("compare merge-base SHA is not an exact 40-character SHA");
  if (input.expectedEventHeadSha && !expectedEventHeadSha) {
    errors.push("workflow event head SHA is not an exact 40-character SHA");
  }
  if (input.finalMainSha && !finalMainSha) {
    errors.push("final current-main SHA is not an exact 40-character SHA");
  }
  if (input.finalPrHeadSha && !finalPrHeadSha) {
    errors.push("final pull-request head SHA is not an exact 40-character SHA");
  }
  if (expectedEventHeadSha && prHeadSha && expectedEventHeadSha !== prHeadSha) {
    errors.push("pull-request head moved after this workflow event; rerun on the current exact head");
  }
  if (currentMainSha && finalMainSha && currentMainSha !== finalMainSha) {
    errors.push("current main moved during the freshness check; rerun before integration");
  }
  if (prHeadSha && finalPrHeadSha && prHeadSha !== finalPrHeadSha) {
    errors.push("pull-request head moved during the freshness check; rerun on the new exact head");
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

async function githubJson<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API ${response.status} for ${url}: ${body.slice(0, 400)}`);
  }
  return (await response.json()) as T;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function writeSummary(
  prNumber: string,
  assessment: V3PrMainFreshnessAssessment,
): void {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY?.trim();
  if (!summaryPath) return;
  const mark = assessment.valid ? "✅" : "❌";
  const lines = [
    "",
    "### V3 PR main freshness",
    "",
    `${mark} PR #${prNumber}: ${assessment.valid ? "fresh" : "stale / invalid"}`,
    "",
    `- current main: \`${assessment.currentMainSha ?? "invalid"}\``,
    `- PR head: \`${assessment.prHeadSha ?? "invalid"}\``,
    `- merge base: \`${assessment.mergeBaseSha ?? "invalid"}\``,
    `- compare status: \`${assessment.compareStatus || "unknown"}\``,
  ];
  if (assessment.errors.length) {
    lines.push("", "Failures:", ...assessment.errors.map((error) => `- ${error}`));
  }
  lines.push(
    "",
    "Green head-only Quality/Browser evidence is not merge-valid after main moves until this gate is rerun against the live PR head or an explicitly tested current-main integration candidate is used.",
    "",
  );
  appendFileSync(summaryPath, `${lines.join("\n")}\n`, "utf8");
}

export async function runV3PrMainFreshnessCheck(): Promise<number> {
  const repository = requireEnv("GITHUB_REPOSITORY");
  const token = requireEnv("GITHUB_TOKEN");
  const prNumber = requireEnv("V3_CURRENT_PR");
  const expectedEventHeadSha = process.env.V3_EXPECTED_HEAD_SHA?.trim() || null;
  const apiBase = `https://api.github.com/repos/${repository}`;

  const pullBefore = await githubJson<PullResponse>(`${apiBase}/pulls/${prNumber}`, token);
  if (String(pullBefore.number) !== prNumber) {
    throw new Error(`GitHub returned PR #${pullBefore.number} while #${prNumber} was requested`);
  }
  if (!isV3PullForFreshness(pullBefore)) {
    throw new Error(`PR #${prNumber} is not a main-based V3 pull request`);
  }

  const mainBefore = await githubJson<BranchResponse>(`${apiBase}/branches/main`, token);
  const compare = await githubJson<CompareResponse>(
    `${apiBase}/compare/${encodeURIComponent(mainBefore.commit.sha)}...${encodeURIComponent(pullBefore.head.sha)}`,
    token,
  );
  const pullAfter = await githubJson<PullResponse>(`${apiBase}/pulls/${prNumber}`, token);
  const mainAfter = await githubJson<BranchResponse>(`${apiBase}/branches/main`, token);

  const assessment = assessV3PrMainFreshness({
    baseRef: pullBefore.base.ref,
    currentMainSha: mainBefore.commit.sha,
    prHeadSha: pullBefore.head.sha,
    compareStatus: compare.status,
    mergeBaseSha: compare.merge_base_commit.sha,
    expectedEventHeadSha,
    finalMainSha: mainAfter.commit.sha,
    finalPrHeadSha: pullAfter.head.sha,
  });

  writeSummary(prNumber, assessment);
  process.stdout.write(`${JSON.stringify(assessment, null, 2)}\n`);
  if (!assessment.valid) {
    console.error(
      `[v3-pr-main-freshness] FAIL: ${assessment.errors.join("; ")}. Restack on literal current main and rerun exact-head evidence, or test an explicit current-main integration candidate.`,
    );
    return 1;
  }
  console.error(
    `[v3-pr-main-freshness] PASS: PR #${prNumber} head ${assessment.prHeadSha} contains current main ${assessment.currentMainSha}.`,
  );
  return 0;
}

if (import.meta.main) {
  runV3PrMainFreshnessCheck()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      const detail = error instanceof Error ? error.message : String(error);
      console.error(`[v3-pr-main-freshness] ERROR: ${detail}`);
      process.exitCode = 2;
    });
}
