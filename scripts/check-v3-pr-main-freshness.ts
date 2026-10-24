import { appendFileSync } from "node:fs";

const EXACT_SHA = /^[0-9a-f]{40}$/i;
const ACCEPTED_COMPARE_STATUSES = new Set(["ahead", "identical"]);
export const FRESHNESS_STATUS_CONTEXT = "V3 PR Main Freshness";

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

export type FreshnessStatusContext = {
  context: string;
  state: string;
  description?: string | null;
};

export type FreshnessTrackedPull = {
  number: number;
  title: string;
  headRefName: string;
  headRefOid: string;
  statusContexts: FreshnessStatusContext[];
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

type GraphQlPullNode = {
  number: number;
  title: string;
  headRefName: string;
  headRefOid: string;
  commits: {
    nodes: Array<{
      commit: {
        status: { contexts: FreshnessStatusContext[] } | null;
      };
    }>;
  };
};

type OpenPullsGraphQlResponse = {
  data?: {
    repository?: {
      pullRequests: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: GraphQlPullNode[];
      };
    } | null;
  };
  errors?: Array<{ message?: string }>;
};

type StatusState = "success" | "failure";

function exactSha(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return EXACT_SHA.test(normalized) ? normalized : null;
}

function freshDescription(mainSha: string): string {
  return `Fresh against main ${mainSha.toLowerCase()}`;
}

export function isV3PullForFreshness(pull: Pick<PullResponse, "title" | "base" | "head">): boolean {
  return (
    pull.base.ref === "main" &&
    (pull.head.ref.startsWith("v3/") || pull.title.startsWith("[V3-"))
  );
}

export function selectFreshnessHeadsToInvalidate(
  pulls: readonly FreshnessTrackedPull[],
  currentMainSha: string,
): Array<{ number: number; headSha: string }> {
  const normalizedMain = exactSha(currentMainSha);
  if (!normalizedMain) throw new Error("current main SHA is not an exact 40-character SHA");
  const currentDescription = freshDescription(normalizedMain);

  return pulls.flatMap((pull) => {
    const isV3 = pull.headRefName.startsWith("v3/") || pull.title.startsWith("[V3-");
    const headSha = exactSha(pull.headRefOid);
    if (!isV3 || !headSha) return [];

    const freshness = pull.statusContexts.find(
      (status) => status.context === FRESHNESS_STATUS_CONTEXT,
    );
    if (!freshness || freshness.state.toUpperCase() !== "SUCCESS") return [];
    if (freshness.description === currentDescription) return [];
    return [{ number: pull.number, headSha }];
  });
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
  return (await response.json()) as T;
}

async function githubGraphQl<T>(token: string, query: string, variables: object): Promise<T> {
  const response = await githubRequest<T>("https://api.github.com/graphql", token, {
    method: "POST",
    body: JSON.stringify({ query, variables }),
  });
  const graph = response as OpenPullsGraphQlResponse;
  if (graph.errors?.length) {
    throw new Error(
      `GitHub GraphQL error: ${graph.errors.map((error) => error.message ?? "unknown").join("; ")}`,
    );
  }
  return response;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function publishFreshnessStatus(
  apiBase: string,
  repository: string,
  token: string,
  headSha: string,
  state: StatusState,
  description: string,
): Promise<void> {
  const runId = process.env.GITHUB_RUN_ID?.trim();
  const targetUrl = runId
    ? `https://github.com/${repository}/actions/runs/${runId}`
    : undefined;
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
    `Commit status context: \`${FRESHNESS_STATUS_CONTEXT}\``,
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

  const pullBefore = await githubRequest<PullResponse>(`${apiBase}/pulls/${prNumber}`, token);
  if (String(pullBefore.number) !== prNumber) {
    throw new Error(`GitHub returned PR #${pullBefore.number} while #${prNumber} was requested`);
  }
  if (!isV3PullForFreshness(pullBefore)) {
    throw new Error(`PR #${prNumber} is not a main-based V3 pull request`);
  }

  const mainBefore = await githubRequest<BranchResponse>(`${apiBase}/branches/main`, token);
  const compare = await githubRequest<CompareResponse>(
    `${apiBase}/compare/${encodeURIComponent(mainBefore.commit.sha)}...${encodeURIComponent(pullBefore.head.sha)}`,
    token,
  );
  const pullAfter = await githubRequest<PullResponse>(`${apiBase}/pulls/${prNumber}`, token);
  const mainAfter = await githubRequest<BranchResponse>(`${apiBase}/branches/main`, token);

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

  await publishFreshnessStatus(
    apiBase,
    repository,
    token,
    pullAfter.head.sha,
    assessment.valid ? "success" : "failure",
    assessment.valid && assessment.currentMainSha
      ? freshDescription(assessment.currentMainSha)
      : `Stale or invalid: ${assessment.errors[0] ?? "freshness proof failed"}`,
  );

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

const OPEN_PRS_QUERY = `
  query OpenV3FreshnessPulls($owner: String!, $name: String!, $cursor: String) {
    repository(owner: $owner, name: $name) {
      pullRequests(
        states: OPEN
        baseRefName: "main"
        first: 100
        after: $cursor
        orderBy: { field: UPDATED_AT, direction: DESC }
      ) {
        pageInfo { hasNextPage endCursor }
        nodes {
          number
          title
          headRefName
          headRefOid
          commits(last: 1) {
            nodes {
              commit {
                status {
                  contexts { context state description }
                }
              }
            }
          }
        }
      }
    }
  }
`;

export async function invalidateSuccessfulFreshnessAfterMainAdvance(): Promise<number> {
  const repository = requireEnv("GITHUB_REPOSITORY");
  const token = requireEnv("GITHUB_TOKEN");
  const [owner, name, extra] = repository.split("/");
  if (!owner || !name || extra) throw new Error(`Invalid GITHUB_REPOSITORY: ${repository}`);
  const apiBase = `https://api.github.com/repos/${repository}`;
  const main = await githubRequest<BranchResponse>(`${apiBase}/branches/main`, token);
  const mainSha = exactSha(main.commit.sha);
  if (!mainSha) throw new Error("current main SHA is not an exact 40-character SHA");

  let cursor: string | null = null;
  let pageCount = 0;
  let scanned = 0;
  const targets: Array<{ number: number; headSha: string }> = [];

  do {
    const graph: OpenPullsGraphQlResponse = await githubGraphQl(
      token,
      OPEN_PRS_QUERY,
      { owner, name, cursor },
    );
    const connection = graph.data?.repository?.pullRequests;
    if (!connection) throw new Error("GitHub GraphQL response omitted pullRequests");
    pageCount += 1;
    scanned += connection.nodes.length;

    const normalized: FreshnessTrackedPull[] = connection.nodes.map((pull) => ({
      number: pull.number,
      title: pull.title,
      headRefName: pull.headRefName,
      headRefOid: pull.headRefOid,
      statusContexts: pull.commits.nodes[0]?.commit.status?.contexts ?? [],
    }));
    targets.push(...selectFreshnessHeadsToInvalidate(normalized, mainSha));
    cursor = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null;
  } while (cursor);

  for (const target of targets) {
    await publishFreshnessStatus(
      apiBase,
      repository,
      token,
      target.headSha,
      "failure",
      `Stale: main advanced to ${mainSha}; rerun ${FRESHNESS_STATUS_CONTEXT}`,
    );
  }

  const summaryPath = process.env.GITHUB_STEP_SUMMARY?.trim();
  if (summaryPath) {
    appendFileSync(
      summaryPath,
      [
        "",
        "### Main-advance freshness invalidation",
        "",
        `- current main: \`${mainSha}\``,
        `- GraphQL pages: ${pageCount}`,
        `- open main PRs scanned as metadata: ${scanned}`,
        `- previously successful stale V3 heads invalidated: ${targets.length}`,
        "",
        "No PR ancestry compares are performed in this path. Only the lightweight legacy commit-status metadata is paginated, and only previously successful old-main freshness statuses receive a write.",
        "",
      ].join("\n"),
      "utf8",
    );
  }

  console.error(
    `[v3-pr-main-freshness] main ${mainSha}: scanned ${scanned} open PR metadata rows in ${pageCount} page(s); invalidated ${targets.length} stale successful freshness status(es).`,
  );
  return 0;
}

if (import.meta.main) {
  const runner = process.env.V3_INVALIDATE_OPEN_PRS === "1"
    ? invalidateSuccessfulFreshnessAfterMainAdvance
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
