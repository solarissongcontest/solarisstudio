import { describe, expect, it } from "vitest";

import {
  dedupePublicSearchResults,
  matchesPublicSearch,
  navigationSearchResults,
} from "./public-search";

describe("public search", () => {
  it("finds public destinations by old and new terminology", () => {
    expect(navigationSearchResults("Broadcast Intelligence")[0]?.href).toBe(
      "/broadcast-intelligence",
    );
    expect(navigationSearchResults("rule clarifications")[0]?.href).toBe(
      "/rules/interpretations",
    );
  });

  it("fails protected contextual navigation discovery closed for anonymous callers", () => {
    expect(navigationSearchResults("preclearance")).toEqual([]);
    expect(
      navigationSearchResults("MySolaris").some((item) => item.href === "/my-solaris"),
    ).toBe(false);

    expect(
      navigationSearchResults("preclearance", {
        authenticationState: "signed-in",
      })[0]?.href,
    ).toBe("/integrity/preclearance");
    expect(
      navigationSearchResults("MySolaris", {
        authenticationState: "signed-in",
      })[0]?.href,
    ).toBe("/my-solaris");
  });

  it("shows Sign in to anonymous discovery but removes it after authentication", () => {
    expect(navigationSearchResults("Sign in")[0]?.href).toBe("/auth");
    expect(
      navigationSearchResults("Sign in", {
        authenticationState: "signed-in",
      }).some((item) => item.href === "/auth"),
    ).toBe(false);
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
