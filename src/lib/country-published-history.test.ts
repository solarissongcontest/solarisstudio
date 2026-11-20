import { describe, expect, it } from "vitest";
import { filterPublishedCountryHistory } from "./country-published-history";

const entries = [
  { id: "newest", edition_id: "e3", artist: "Reya", song: "Northern Lights" },
  { id: "middle", edition_id: "e2", artist: "Ari", song: "Golden Hour" },
  { id: "oldest", edition_id: "e1", artist: "Nera", song: "A Long Road" },
];
const editions: Record<string, string[]> = {
  e3: ["SSC 23", "ssc23", "New Harbour"],
  e2: ["SSC 22", "ssc22", "Tetlehamn"],
  e1: ["SSC 21", "ssc21", "Averia"],
};
const outcomes: Record<string, string> = { e3: "aq", e2: "nq", e1: "wildcard" };
const terms = (id: string) => editions[id] ?? [];
const status = (id: string) => outcomes[id] ?? null;

describe("browser Country history public-only filters", () => {
  it("retains canonical ordering and does not mutate the source projection", () => {
    const data = entries.slice();
    const result = filterPublishedCountryHistory(data, { search: "  ", outcome: "all" }, terms, status);
    expect(result.map((item) => item.id)).toEqual(["newest", "middle", "oldest"]);
    expect(data.map((item) => item.id)).toEqual(["newest", "middle", "oldest"]);
  });

  it("searches only published artist/song/edition text without new queries", () => {
    expect(filterPublishedCountryHistory(entries, { search: "northERN", outcome: "all" }, terms, status)
      .map((item) => item.id)).toEqual(["newest"]);
    expect(filterPublishedCountryHistory(entries, { search: "  TETLEHAMN ", outcome: "all" }, terms, status)
      .map((item) => item.id)).toEqual(["middle"]);
    expect(filterPublishedCountryHistory(entries, { search: "ssc21", outcome: "all" }, terms, status)
      .map((item) => item.id)).toEqual(["oldest"]);
    expect(filterPublishedCountryHistory(entries, { search: "secret unpublished title", outcome: "all" }, terms, status))
      .toEqual([]);
  });

  it("recognizes direct qualifiers and wildcards; does not guess unknown statuses", () => {
    const withUnknown = [...entries, { id: "unknown", edition_id: "e4", artist: null, song: null }];
    expect(filterPublishedCountryHistory(withUnknown, { search: "", outcome: "finalist" }, terms, status)
      .map((item) => item.id)).toEqual(["newest", "oldest"]);
    expect(filterPublishedCountryHistory(withUnknown, { search: "", outcome: "eliminated" }, terms, status)
      .map((item) => item.id)).toEqual(["middle"]);
    expect(filterPublishedCountryHistory(withUnknown, { search: "new", outcome: "eliminated" }, terms, status))
      .toEqual([]);
  });
});
