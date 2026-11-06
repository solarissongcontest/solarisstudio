import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/components/public/PublicCommandPalette.tsx"),
  "utf8",
);
const app = source.slice(
  source.indexOf("function AppPublicPaletteDialog"),
  source.indexOf("function WebPublicPaletteDialog"),
);

describe("V3 installed global Search recovery", () => {
  it("keeps the canonical publication-safe remote search with a bounded request", () => {
    expect(app).toContain('rpc("solaris_public_search"');
    expect(app).toContain("result_limit: 30");
    expect(app).toContain("enabled: normalized.length >= 2");
    expect(app).toContain("retry: false");
    expect(app).toContain("refetchOnWindowFocus: false");
    expect(app).not.toContain("refetchInterval");
    expect(app).not.toContain("useAllResults()");
    expect(app).not.toContain("useAllParticipants()");
  });

  it("distinguishes a remote error from a legitimate zero-result search", () => {
    expect(app).toContain("remote.isError && normalized.length >= 2");
    expect(app).toContain('role="alert"');
    expect(app).toContain("Published search could not load");
    expect(app).toContain("Nothing in Solaris Studio matches that search.");
    expect(app).toContain("(normalized.length < 2 || awaitingRemote || remote.isError ? [] : remote.data ?? [])");
  });

  it("debounces remote reads and prevents stale query results while local suggestions remain immediate", () => {
    expect(app).toContain("window.setTimeout(() => setDebouncedQuery(normalized), 300)");
    expect(app).toContain("window.clearTimeout(timer)");
    expect(app).toContain("enabled: normalized.length >= 2 && !awaitingRemote");
    expect(app).toContain('queryKey: ["solaris-public-app-search", debouncedQuery.toLowerCase()]');
    expect(app).toContain("search_query: debouncedQuery");
    expect(app).toContain("normalized.length < 2 || awaitingRemote || remote.isError");
    expect(app).toContain("navigationSearchResults(normalized)");
    expect(app).toContain("(awaitingRemote || remote.isFetching)");
  });

  it("offers explicit accessible retry without automated failure loops", () => {
    expect(app).toContain("onClick={() => void remote.refetch()}");
    expect(app).toContain("Retry published search");
    expect(app.match(/remote\.refetch\(/g)).toHaveLength(1);
    expect(app).toContain('role="status" aria-live="polite"');
  });

  it("keeps local navigation available while remote search is broken", () => {
    expect(app).toContain("navigationSearchResults(normalized)");
    expect(app).toContain("dedupePublicSearchResults([...local, ...remoteResults])");
    expect(app).toContain("renderSearchGroups(grouped, openResult)");
    expect(app).toContain("rememberAppSearchReturn(originPath, normalized, result.href)");
    expect(app).toContain("!awaitingRemote && !remote.isFetching && !remote.isError && !searchResults.length");
  });
});
