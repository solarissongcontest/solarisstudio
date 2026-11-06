import { describe, expect, it } from "vitest";

import {
  recentPublicationSlugs,
  visiblePublicationVerifiedRecents,
} from "./v3-search-recent-publication";

const saved = [
  { path: "/shows/222", label: "Public show" },
  { path: "/editions/ssc22", label: "Unpublished edition title" },
  { path: "/editions/ssc21", label: "Published edition" },
  { path: "/stories/ssc22", label: "Withdrawn story title" },
  { path: "/stories/ssc21", label: "Published story" },
  { path: "/countries/ol", label: "Oland" },
];

describe("V3 Search shared-device recent publication", () => {
  it("extracts only bounded single-segment editions and stories", () => {
    expect(recentPublicationSlugs(saved)).toEqual({
      editionSlugs: ["ssc22", "ssc21"],
      storySlugs: ["ssc22", "ssc21"],
    });
    const long = Array.from({ length: 12 }, (_, index) => ({
      path: `/editions/ssc${index}`,
    }));
    expect(recentPublicationSlugs(long).editionSlugs).toHaveLength(8);
  });

  it("does not query malformed, encoded or nested edition and story paths", () => {
    expect(recentPublicationSlugs([
      { path: "/editions/%2Fhidden" },
      { path: "/stories/%00private" },
      { path: "/editions/ssc22/private" },
      { path: "/editions/%2e%2e" },
      { path: "/stories/%2e" },
      { path: "/stories/%E0%A4%A" },
      { path: "/editions/ssc21/" },
    ])).toEqual({ editionSlugs: ["ssc21"], storySlugs: [] });
  });

  it("hides changed or unverified publications before replaying stored labels", () => {
    const verified = visiblePublicationVerifiedRecents(saved, {
      publishedEditionLabels: new Map([["ssc21", "Official edition 21"]]),
      publishedStoryLabels: new Map([["ssc21", "Official story 21"]]),
    });
    expect(verified.map((item) => item.path)).toEqual([
      "/shows/222",
      "/editions/ssc21",
      "/stories/ssc21",
      "/countries/ol",
    ]);
    expect(visiblePublicationVerifiedRecents(saved, {
      publishedEditionLabels: new Map(),
      publishedStoryLabels: new Map(),
    }).map((item) => item.path)).toEqual(["/shows/222", "/countries/ol"]);
  });

  it("replaces stale local titles with current verified public labels", () => {
    const items = visiblePublicationVerifiedRecents(saved, {
      publishedEditionLabels: new Map([["ssc21", "Current published Edition"]]),
      publishedStoryLabels: new Map([["ssc21", "Revised published Story"]]),
    });
    expect(items.find((item) => item.path === "/editions/ssc21")?.label)
      .toBe("Current published Edition");
    expect(items.find((item) => item.path === "/stories/ssc21")?.label)
      .toBe("Revised published Story");
    expect(saved.find((item) => item.path === "/stories/ssc21")?.label)
      .toBe("Published story");
  });

  it("does not trust empty or missing official titles even when the slug exists", () => {
    const verified = visiblePublicationVerifiedRecents(saved, {
      publishedEditionLabels: new Map([["ssc21", "   "]]),
      publishedStoryLabels: new Map([["ssc21", ""]]),
    });
    expect(verified.map((item) => item.path)).toEqual(["/shows/222", "/countries/ol"]);
  });

  it("does not mutate or promote unrelated public content into new destinations", () => {
    const visible = visiblePublicationVerifiedRecents(saved, {
      publishedEditionLabels: new Map([["ssc22", "Official edition 22"], ["ssc21", "Official edition 21"]]),
      publishedStoryLabels: new Map([["ssc21", "Official story 21"]]),
    });
    expect(visible).toHaveLength(saved.length - 1);
    expect(saved).toHaveLength(6);
    expect(visible[0]).toBe(saved[0]);
  });
});
