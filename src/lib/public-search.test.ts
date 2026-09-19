import { describe, expect, it } from "vitest";

import {
  dedupePublicSearchResults,
  matchesPublicSearch,
  navigationSearchResults,
} from "./public-search";

describe("public search", () => {
  it("finds destinations by old and new terminology", () => {
    expect(navigationSearchResults("Broadcast Intelligence")[0]?.href).toBe(
      "/broadcast-intelligence",
    );
    expect(navigationSearchResults("preclearance")[0]?.href).toBe("/integrity/preclearance");
    expect(navigationSearchResults("rule clarifications")[0]?.href).toBe(
      "/rules/interpretations",
    );
  });

  it("matches multiple words without depending on order in one exact phrase", () => {
    expect(matchesPublicSearch("ssc oland", "Oland", "SSC 21")).toBe(true);
    expect(matchesPublicSearch("ssc vendia", "Oland", "SSC 21")).toBe(false);
  });

  it("deduplicates identical destinations", () => {
    const value = {
      id: "a",
      label: "Oland",
      description: "",
      href: "/countries/OL",
      group: "Countries",
    };
    expect(dedupePublicSearchResults([value, { ...value, id: "b" }])).toHaveLength(1);
  });
});
