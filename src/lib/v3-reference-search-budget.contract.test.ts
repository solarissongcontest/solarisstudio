import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const reference = readFileSync("src/routes/encyclopedia/index.tsx", "utf8");

describe("V3 Reference search request budget", () => {
  it("waits for settled input before sending bounded search requests", () => {
    expect(reference).toContain("const REFERENCE_SEARCH_DELAY_MS = 300");
    expect(reference).toContain("window.setTimeout(() => setSettledQuery(normalizedQuery), REFERENCE_SEARCH_DELAY_MS)");
    expect(reference).toContain("window.clearTimeout(timeoutId)");
    expect(reference).toContain("const searchPending = settledQuery !== normalizedQuery");
    expect(reference).toContain('settledQuery.toLocaleLowerCase()');
    expect(reference).toContain("normalizedQuery.length <= MAX_REFERENCE_QUERY_LENGTH && !searchPending");
    expect(reference).toContain("search_query: settledQuery");
    expect(reference).toContain("searchPending || referenceQuery.isLoading");
  });

  it("respects the server search length limit and avoids an unbounded fallback", () => {
    expect(reference).toContain("const MAX_REFERENCE_QUERY_LENGTH = 120");
    expect(reference).toContain("normalizedQuery.length >= 2");
    expect(reference).toContain("normalizedQuery.length > MAX_REFERENCE_QUERY_LENGTH");
    expect(reference).toContain("Search terms must be no longer than");
    expect(reference).toContain("result_limit: 50");
    expect(reference).toContain("No private archive data");
    expect(reference).not.toContain("refetchInterval");
    expect(reference).not.toContain("useAllResults");
  });
});
