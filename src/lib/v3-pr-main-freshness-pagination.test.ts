import { afterEach, describe, expect, it, vi } from "vitest";
import { invalidateSuccessfulFreshnessAfterMainAdvance } from "../../scripts/check-v3-pr-main-freshness";

const MAIN = "a".repeat(40);
const OLD_MAIN = "b".repeat(40);
const HEAD = "c".repeat(40);

type Page = {
  nodes: unknown[];
  pageInfo: { hasNextPage?: boolean; endCursor?: string | null };
};

function staleV3Pull() {
  return {
    number: 18,
    title: "[V3-QA] Test",
    headRefName: "v3/qa-test",
    headRefOid: HEAD,
    commits: {
      nodes: [{
        commit: {
          status: {
            contexts: [{
              context: "V3 PR Main Freshness",
              state: "SUCCESS",
              description: `Fresh against main ${OLD_MAIN}`,
            }],
          },
        },
      }],
    },
  };
}

function installMockGithub(pages: Page[]) {
  let page = 0;
  const urls: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    if (url.endsWith("/branches/main")) {
      return { ok: true, json: async () => ({ commit: { sha: MAIN } }) } as Response;
    }
    if (url.endsWith("/graphql")) {
      const next = pages[page++];
      if (!next) throw new Error("Unexpected extra GitHub GraphQL page request");
      return {
        ok: true,
        json: async () => ({ data: { repository: { pullRequests: next } } }),
      } as Response;
    }
    // A pagination failure must stop before even a previously collected stale
    // head can receive a status mutation.
    throw new Error(`Unexpected GitHub write/request: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("GITHUB_REPOSITORY", "solarissongcontest/solarisstudio");
  vi.stubEnv("GITHUB_TOKEN", "offline-test-only");
  vi.stubEnv("GITHUB_STEP_SUMMARY", "");
  return { urls, fetchMock };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("main-advance exact-head freshness invalidation pagination", () => {
  it("rejects a next-page declaration with a missing cursor before status writes", async () => {
    const { urls } = installMockGithub([{
      nodes: [staleV3Pull()],
      pageInfo: { hasNextPage: true, endCursor: null },
    }]);
    await expect(invalidateSuccessfulFreshnessAfterMainAdvance())
      .rejects.toThrow(/missing or repeated cursor/);
    expect(urls.some((url) => url.includes("/statuses/"))).toBe(false);
  });

  it("rejects a repeated cursor instead of looping indefinitely", async () => {
    const { urls } = installMockGithub([
      { nodes: [staleV3Pull()], pageInfo: { hasNextPage: true, endCursor: "cursor-A" } },
      { nodes: [], pageInfo: { hasNextPage: true, endCursor: "cursor-A" } },
    ]);
    await expect(invalidateSuccessfulFreshnessAfterMainAdvance())
      .rejects.toThrow(/missing or repeated cursor/);
    expect(urls.some((url) => url.includes("/statuses/"))).toBe(false);
  });

  it("accepts a complete two-page scan without statuses to invalidate", async () => {
    const { urls } = installMockGithub([
      { nodes: [], pageInfo: { hasNextPage: true, endCursor: "cursor-A" } },
      { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
    ]);
    await expect(invalidateSuccessfulFreshnessAfterMainAdvance()).resolves.toBe(0);
    expect(urls.filter((url) => url.endsWith("/graphql"))).toHaveLength(2);
  });

  it("rejects incomplete pageInfo instead of guessing the last page", async () => {
    installMockGithub([{
      nodes: [],
      pageInfo: { endCursor: null },
    }]);
    await expect(invalidateSuccessfulFreshnessAfterMainAdvance())
      .rejects.toThrow(/omitted hasNextPage/);
  });
});
