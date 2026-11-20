import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MAX_REFERENCE_QUERY_LENGTH,
  parseReferenceUrlSearch,
  referenceQueryFromUrl,
} from "./v3-reference-url-search";

const source = readFileSync("src/routes/encyclopedia/index.tsx", "utf8");

describe("V3 Reference deep links, publication safety and three-experience reconciliation", () => {
  it("validates shareable search/topic without using an artist label as durable identity", () => {
    expect(parseReferenceUrlSearch({ q: "  SSC 19 ", kind: "country" }))
      .toEqual({ q: "SSC 19", kind: "country", artist: undefined });
    expect(referenceQueryFromUrl(parseReferenceUrlSearch({ artist: "Reya" }))).toBe("Reya");
    expect(parseReferenceUrlSearch({ q: ["private"], kind: "private-jury" }))
      .toEqual({ q: undefined, kind: undefined, artist: undefined });
    expect(MAX_REFERENCE_QUERY_LENGTH).toBe(120);
    expect(source).toContain("validateSearch: parseReferenceUrlSearch");
    expect(source).toContain("const urlQuery = referenceQueryFromUrl(search)");
    expect(source).toContain("Route.useNavigate()");
    expect(source).toContain("replace: true");
  });

  it("waits for current public rollout verification before activating public readers", () => {
    expect(source).toContain('refetchOnMount: "always"');
    expect(source).toContain("const referenceReleased = feature.isSuccess && !feature.isFetching");
    expect(source).toContain("!feature.isRefetchError && feature.data === true");
    expect(source).toContain("enabled: referenceReleased,");
    expect(source).toContain("enabled: referenceReleased && !dedicatedTopicOnly");
    expect(source).toContain("if (feature.isLoading || feature.isFetching)");
    expect(source).toContain("if (!referenceReleased)");
  });

  it("keeps stale reference rows hidden while verifying them, and guards every link", () => {
    expect(source).toContain("referenceQuery.isSuccess && !referenceQuery.isFetching");
    expect(source).toContain("!referenceQuery.isRefetchError ? referenceQuery.data ?? [] : []");
    expect(source).toContain("referenceQuery.isLoading || referenceQuery.isFetching");
    expect(source).toContain("referenceQuery.isError || referenceQuery.isRefetchError");
    expect(source).toContain("allowsReleased(destination.href)");
    expect(source).toContain("allowsReleased(item.href)");
    expect(source).toContain('actions={allowsReleased("/countries") ?');
    expect(source).not.toContain("service_role");
    expect(source).not.toContain("useAllJuryVotes");
  });

  it("preserves the original editorial rail, mobile browser, installed app and bounded RPC", () => {
    expect(source).toContain("useV3DirectoryPresentation()");
    expect(source).toContain('data-directory-experience={presentation}');
    expect(source).toContain("v3-directory-desktop-rail");
    expect(source).toContain("v3-directory-mobile-list");
    expect(source).toContain("solaris-app-grouped-list");
    expect(source).toContain("v3-directory-desktop-grid");
    expect(source).toContain("SolarisSearchField");
    expect(source).toContain('"solaris_public_search"');
    expect(source).toContain('"v3_public_explore_counts"');
    expect(source).toContain("result_limit: 50");
    expect(source).toContain("const parseSearchRows = parseReferenceSearchRows");
  });
});
