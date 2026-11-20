import { describe, expect, it } from "vitest";
import type { FanRecord } from "./fan-records";
import { filterPublishedFanRecords } from "./fan-records-search";

const rows: FanRecord[] = [
  {
    id: "wins",
    category: "career",
    label: "Most wins",
    value: "8",
    explanation: "Published Grand Final victories",
    holders: [{ countryId: "o", countryName: "Oland", shortCode: "OL", flagImage: null, accentColor: "#ffffff" }],
  },
  {
    id: "jury",
    category: "voting",
    label: "Highest jury points",
    value: "421",
    explanation: "Published jury ballots",
    holders: [{ countryId: "a", countryName: "Aotea", shortCode: "AO", flagImage: null, accentColor: "#ffffff", artist: "Reya", song: "Northern Lights", editionLabel: "SSC 22" }],
  },
];

describe("published fan-record directory search", () => {
  it("keeps source projection order and does not mutate canonical rows", () => {
    const input = rows.slice();
    expect(filterPublishedFanRecords(input, "all", "").map((x) => x.id)).toEqual(["wins", "jury"]);
    expect(input).toEqual(rows);
  });

  it("searches title, country, artist, song and published edition labels", () => {
    for (const query of ["aotea", "REYA", "northern lights", "SSC 22", "421"]) {
      expect(filterPublishedFanRecords(rows, "all", query).map((x) => x.id)).toEqual(["jury"]);
    }
    expect(filterPublishedFanRecords(rows, "all", " Oland ").map((x) => x.id)).toEqual(["wins"]);
  });

  it("combines categories with search and does not infer missing records", () => {
    expect(filterPublishedFanRecords(rows, "career", "Reya")).toEqual([]);
    expect(filterPublishedFanRecords(rows, "voting", "Reya").map((x) => x.id)).toEqual(["jury"]);
    expect(filterPublishedFanRecords(rows, "all", "unpublished entry")).toEqual([]);
  });
});
