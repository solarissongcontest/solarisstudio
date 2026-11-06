import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { parseReferenceSearchRows } from "./v3-reference-search-rows";

const country = {
  result_id: "country:a1",
  result_type: "country",
  title: "Oland",
  subtitle: "OLA · Hydra",
  href: "/countries/OLA",
};
const wiki = {
  result_id: "wiki:a1",
  result_type: "wiki",
  title: "Oland in the Wiki",
  subtitle: "Detailed country article",
  href: "/wiki/OLA",
};

describe("Publication-safe Reference legacy Wiki search compatibility", () => {
  it("makes a published Wiki-only country hit discoverable at its canonical route", () => {
    expect(parseReferenceSearchRows([wiki])).toEqual([{
      id: "wiki:a1",
      kind: "country",
      title: "Oland",
      subtitle: "Detailed country article",
      href: "/countries/OLA",
    }]);
  });

  it("does not show duplicate canonical Country and Wiki links", () => {
    expect(parseReferenceSearchRows([country, wiki])).toEqual([{
      id: "country:a1",
      kind: "country",
      title: "Oland",
      subtitle: "OLA · Hydra",
      href: "/countries/OLA",
    }]);
    expect(parseReferenceSearchRows([wiki, country])).toHaveLength(1);
  });

  it("keeps distinct published public kinds and ignores unsupported metadata kinds", () => {
    const items = parseReferenceSearchRows([
      { result_id: "show:s1", result_type: "show", title: "Grand Final", href: "/shows/s1" },
      { result_id: "edition:e1", result_type: "edition", title: "SSC 20", href: "/editions/ssc20" },
      { result_id: "secret:p1", result_type: "organizer_note", title: "Private note", href: "/admin" },
    ]);
    expect(items.map((item) => item.kind)).toEqual(["show", "edition"]);
    expect(items.every((item) => item.href.startsWith("/"))).toBe(true);
  });

  it("keeps different country articles separate even when both are legacy aliases", () => {
    const aotea = {
      ...wiki,
      result_id: "wiki:a2",
      title: "Aotea in the Wiki",
      href: "/wiki/AOT",
    };
    expect(parseReferenceSearchRows([wiki, aotea]).map((item) => item.href))
      .toEqual(["/countries/OLA", "/countries/AOT"]);
  });

  it("rejects malformed and traversal-style legacy aliases rather than redirecting them", () => {
    for (const href of ["/wiki/../admin", "/wiki/OLA/private", "//wiki/OLA", "https://example.com"]) {
      expect(() => parseReferenceSearchRows([{ ...wiki, href }])).toThrow("Invalid public Reference result");
    }
    expect(() => parseReferenceSearchRows({})).toThrow("Invalid public search projection");
  });

  it("continues using the server-owned rollout and published-search RPC in the actual route", () => {
    const source = readFileSync("src/routes/encyclopedia/index.tsx", "utf8");
    expect(source).toContain("const parseSearchRows = parseReferenceSearchRows");
    expect(source).toContain('isStudio2FeatureEnabled("public_encyclopedia")');
    expect(source).toContain('"solaris_public_search"');
    expect(source).toContain("result_limit: 50");
    expect(source).not.toContain('select("*")');
  });
});
