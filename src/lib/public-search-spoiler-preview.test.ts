import { describe, expect, it } from "vitest";

import type { Edition, Show } from "./data";
import { resolvePublicationConfig } from "./publication";
import {
  excludeSearchSpoilerEdition,
  excludeSearchSpoilerStories,
  resolvePublicSearchSpoilerPreviewScope,
} from "./public-search-spoiler-preview";

function edition(id: string, number: number, status: string, published = true): Edition {
  return {
    id,
    slug: id,
    name: `Edition ${number}`,
    edition_number: number,
    year: 2026,
    status,
    published,
    description: null,
    host_country_id: null,
    host_city: null,
    logo: null,
    theme_id: null,
  };
}

function show(id: string, editionId: string, publication: boolean, kind = "grand-final"): Show {
  return {
    id,
    edition_id: editionId,
    name: id,
    kind,
    published: true,
    publication_config: resolvePublicationConfig({ participants: true, results: publication }),
    status: "complete",
    qualifier_count: null,
    theme_id: null,
    sort_order: 1,
    voting_config: null,
    broadcast_config: null,
  };
}

const editions = [edition("current", 23, "results"), edition("history", 22, "archived")];

describe("Public Search spoiler-free preview scope", () => {
  it("never hides canonical published routes without an opted-in spoiler preference", () => {
    expect(resolvePublicSearchSpoilerPreviewScope({
      spoilerFree: false,
      editions,
      shows: [show("current-final", "current", true)],
    })).toEqual({ editionId: null, editionSlug: null });
  });

  it("hides current-edition previews only when the final results are officially published", () => {
    expect(resolvePublicSearchSpoilerPreviewScope({
      spoilerFree: true,
      editions,
      shows: [show("current-final", "current", true)],
    })).toEqual({ editionId: "current", editionSlug: "current" });
    for (const onlyShow of [
      show("current-final", "current", false),
      show("historic-final", "history", true),
      show("current-semi", "current", true, "semi-final"),
      { ...show("current-final", "current", true), published: false },
    ]) {
      expect(resolvePublicSearchSpoilerPreviewScope({
        spoilerFree: true,
        editions,
        shows: [onlyShow],
      })).toEqual({ editionId: null, editionSlug: null });
    }
  });

  it("does not promote drafts or invent result protections without a public edition", () => {
    expect(resolvePublicSearchSpoilerPreviewScope({
      spoilerFree: true,
      editions: [edition("draft", 24, "pre_show", false)],
      shows: [show("draft-final", "draft", true)],
    })).toEqual({ editionId: null, editionSlug: null });
  });

  it("excludes current-edition source rows for records without touching historical rows", () => {
    const rows = [
      { edition_id: "current", points: 800 },
      { edition_id: "history", points: 750 },
    ];
    expect(excludeSearchSpoilerEdition(rows, "current")).toEqual([
      { edition_id: "history", points: 750 },
    ]);
    expect(excludeSearchSpoilerEdition(rows, null)).toEqual(rows);
  });

  it("filters current-edition story previews without blocking the archive", () => {
    const stories = [
      { editionSlug: "current", title: "Potential winner spoiler" },
      { editionSlug: "history", title: "Earlier edition" },
    ];
    expect(excludeSearchSpoilerStories(stories, "current")).toEqual([
      { editionSlug: "history", title: "Earlier edition" },
    ]);
    expect(excludeSearchSpoilerStories(stories, null)).toEqual(stories);
  });
});
