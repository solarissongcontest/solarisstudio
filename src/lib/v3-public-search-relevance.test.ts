import { describe, expect, it } from "vitest";

import type { PublicSearchResult } from "./public-search";
import {
  limitV3PublicSearchGroups,
  matchesV3PublicSearch,
  navigationV3PublicSearchResults,
  rankV3PublicSearchResults,
} from "./v3-public-search-relevance";

describe("V3 publication-safe Search relevance", () => {
  it("retains canonical substring and Scandinavian-diacritic matching", () => {
    expect(matchesV3PublicSearch("ørnå", "Ørnådal")).toBe(true);
    expect(matchesV3PublicSearch("ornadal", "Ørnådal")).toBe(true);
    expect(matchesV3PublicSearch("landi", "Ålandin historia")).toBe(true);
    expect(matchesV3PublicSearch("SSC 22", "SSC", 22)).toBe(true);
  });

  it("recognizes compact SSC edition aliases without matching another edition number", () => {
    expect(matchesV3PublicSearch("SSC22", "SSC 22")).toBe(true);
    expect(matchesV3PublicSearch("SSC-22", "SSC 22")).toBe(true);
    expect(matchesV3PublicSearch("SSC022", "SSC 22")).toBe(true);
    expect(matchesV3PublicSearch("SSC22", "SSC 220")).toBe(false);
    expect(matchesV3PublicSearch("SSC23", "SSC 22")).toBe(false);
    expect(matchesV3PublicSearch("SSC22", "Other edition 22")).toBe(false);
  });

  it("recovers one conservative human-name typo", () => {
    expect(matchesV3PublicSearch("Olnd", "Oland")).toBe(true); // insertion
    expect(matchesV3PublicSearch("Olnad", "Oland")).toBe(true); // transposition
    expect(matchesV3PublicSearch("Olamd", "Oland")).toBe(true); // substitution
    expect(matchesV3PublicSearch("Olandd", "Oland")).toBe(true); // deletion
    expect(matchesV3PublicSearch("Aquliateria", "Aquliateria")).toBe(true);
  });

  it("rejects short, multi-error and nonmatching fuzzy suggestions", () => {
    expect(matchesV3PublicSearch("cat", "car")).toBe(false);
    expect(matchesV3PublicSearch("Olxxd", "Oland")).toBe(false);
    expect(matchesV3PublicSearch("Olnd Dairia", "Oland Diaria")).toBe(false);
    expect(matchesV3PublicSearch("unknown", "Oland")).toBe(false);
    expect(matchesV3PublicSearch("one two three four fiev", "one two three four five")).toBe(false);
  });

  it("finds misspelled public navigation destinations without inventing routes", () => {
    const exact = navigationV3PublicSearchResults("Predictions");
    const typo = navigationV3PublicSearchResults("Predictins");
    expect(exact.find((item) => item.href === "/predictions")?.label).toBe("Predictions");
    expect(typo.find((item) => item.href === "/predictions")?.label).toBe("Predictions");
    expect(navigationV3PublicSearchResults("zzzzzzzz")).toEqual([]);
  });

  it("allows one typo among other exact query terms", () => {
    expect(matchesV3PublicSearch("Olnd song", "Oland", "published song")).toBe(true);
    expect(matchesV3PublicSearch("Oland song", "Oland", "published song")).toBe(true);
  });

  it("ranks exact names ahead of prefix, label, keyword and description matches", () => {
    const input: PublicSearchResult[] = [
      { id: "description", label: "Browse archive", description: "Find Oland", href: "/archive", group: "Tools" },
      { id: "keyword", label: "Delegations", description: "Countries", keywords: "Oland", href: "/countries", group: "Tools" },
      { id: "prefix", label: "Oland national archive", description: "Country archive", href: "/country", group: "Countries" },
      { id: "exact", label: "Oland", description: "Country", href: "/oland", group: "Countries" },
      { id: "word", label: "Historic Oland gallery", description: "Archive", href: "/gallery", group: "Stories" },
      { id: "fuzzy", label: "Olndians", description: "Related result", href: "/related", group: "Stories" },
    ];
    expect(rankV3PublicSearchResults(input, "Oland").map((row) => row.id))
      .toEqual(["exact", "prefix", "word", "keyword", "description", "fuzzy"]);
  });

  it("prioritizes compact SSC-number labels over generic matches", () => {
    const rows: PublicSearchResult[] = [
      { id: "generic", label: "Browse editions", description: "SSC 22", href: "/editions", group: "Tools" },
      { id: "edition", label: "SSC 22", description: "Published edition", href: "/editions/ssc22", group: "Editions" },
    ];
    expect(rankV3PublicSearchResults(rows, "SSC22").map((row) => row.id))
      .toEqual(["edition", "generic"]);
  });

  it("keeps categories discoverable when one archive source dominates the matches", () => {
    const prolific = Array.from({ length: 120 }, (_, index) => ({
      id: `entry-${index}`,
      group: "Entries",
    }));
    const ranked = [
      ...prolific,
      { id: "country", group: "Countries" },
      { id: "story", group: "Stories" },
      { id: "rule", group: "Rules" },
    ];
    const visible = limitV3PublicSearchGroups(ranked);
    expect(visible.filter((item) => item.group === "Entries")).toHaveLength(10);
    expect(visible.map((item) => item.id)).toContain("country");
    expect(visible.map((item) => item.id)).toContain("story");
    expect(visible.map((item) => item.id)).toContain("rule");
    expect(visible.map((item) => item.id).slice(0, 3)).toEqual([
      "entry-0",
      "entry-1",
      "entry-2",
    ]);
    expect(ranked).toHaveLength(123);
  });

  it("never exceeds the 50-result UI budget and preserves ranked source order", () => {
    const ranked = Array.from({ length: 80 }, (_, index) => ({
      id: `result-${index}`,
      group: `Group ${Math.floor(index / 10)}`,
    }));
    const visible = limitV3PublicSearchGroups(ranked);
    expect(visible).toHaveLength(50);
    expect(visible.map((item) => item.group)).toContain("Group 7");
    const positions = visible.map((item) => Number(item.id.slice("result-".length)));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(Math.max(...[...new Set(visible.map((item) => item.group))]
      .map((group) => visible.filter((item) => item.group === group).length))).toBeLessThanOrEqual(10);
  });

  it("prioritizes the first 50 distinct categories when there are more groups than slots", () => {
    const ranked = Array.from({ length: 65 }, (_, index) => ({
      id: `item-${index}`,
      group: `Category ${index}`,
    }));
    const limited = limitV3PublicSearchGroups(ranked);
    expect(limited).toHaveLength(50);
    expect(limited[0].id).toBe("item-0");
    expect(limited[49].id).toBe("item-49");
    expect(limited.map((item) => item.id)).not.toContain("item-50");
  });

  it("preserves provider order for equally relevant matches, immutably", () => {
    const input: PublicSearchResult[] = [
      { id: "b", label: "Oland A", description: "", href: "/b", group: "Countries" },
      { id: "a", label: "Oland B", description: "", href: "/a", group: "Countries" },
    ];
    expect(rankV3PublicSearchResults(input, "Ol").map((row) => row.id)).toEqual(["b", "a"]);
    expect(rankV3PublicSearchResults(input, "").map((row) => row.id)).toEqual(["b", "a"]);
    expect(input.map((row) => row.id)).toEqual(["b", "a"]);
  });
});
