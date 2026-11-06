import { describe, expect, it } from "vitest";

import {
  publicSearchPublicationScope,
  publicSearchRowsForPublishedShows,
} from "./public-search-published-scope";

const editions = [
  { id: "public", published: true },
  { id: "draft", published: false },
];

const shows = [
  {
    id: "public-results",
    edition_id: "public",
    published: true,
    publication_config: { participants: true, results: true },
  },
  {
    id: "public-details",
    edition_id: "public",
    published: true,
    publication_config: { participants: true, results: true, detailed_voting: true },
  },
  {
    id: "public-participants-only",
    edition_id: "public",
    published: true,
    publication_config: { participants: true, results: false },
  },
  {
    id: "hidden-show",
    edition_id: "public",
    published: false,
    publication_config: { participants: true, results: true, detailed_voting: true },
  },
  {
    id: "draft-edition-show",
    edition_id: "draft",
    published: true,
    publication_config: { participants: true, results: true, detailed_voting: true },
  },
  {
    id: "public-without-grant",
    edition_id: "public",
    published: true,
    publication_config: { participants: false, results: false },
  },
];

describe("public Search publication boundaries", () => {
  it("does not promote unpublished editions or hidden shows even for signed-in viewers", () => {
    const projection = publicSearchPublicationScope(editions, shows);
    expect(projection.publicEditions.map((edition) => edition.id)).toEqual(["public"]);
    expect(projection.publicShows.map((show) => show.id)).toEqual([
      "public-results",
      "public-details",
      "public-participants-only",
    ]);
    expect(projection.publicEditionIds.has("draft")).toBe(false);
  });

  it("restricts official result and detailed voting search to their distinct grants", () => {
    const projection = publicSearchPublicationScope(editions, shows);
    expect([...projection.publishedResultShowIds]).toEqual([
      "public-results",
      "public-details",
    ]);
    expect([...projection.detailedVotingShowIds]).toEqual(["public-details"]);
    expect(projection.detailedVotingShowIds.has("public-results")).toBe(false);
  });

  it("removes all unpublished show rows before building public records", () => {
    const projection = publicSearchPublicationScope(editions, shows);
    const rows = [
      { show_id: "public-results", value: "rank" },
      { show_id: "public-details", value: "detailed-votes" },
      { show_id: "public-participants-only", value: "not-ranked-yet" },
      { show_id: "hidden-show", value: "private" },
      { show_id: "draft-edition-show", value: "draft" },
      { show_id: null, value: "unscoped" },
    ];
    expect(publicSearchRowsForPublishedShows(rows, projection.publishedResultShowIds).map((row) => row.value))
      .toEqual(["rank", "detailed-votes"]);
    expect(publicSearchRowsForPublishedShows(rows, projection.detailedVotingShowIds).map((row) => row.value))
      .toEqual(["detailed-votes"]);
  });

  it("preserves the existing legacy published-show fallback without inventing detailed voting", () => {
    const scope = publicSearchPublicationScope(editions, [
      { id: "legacy", edition_id: "public", published: true, publication_config: null },
    ]);
    expect([...scope.publishedResultShowIds]).toEqual(["legacy"]);
    expect([...scope.detailedVotingShowIds]).toEqual([]);
  });
});
