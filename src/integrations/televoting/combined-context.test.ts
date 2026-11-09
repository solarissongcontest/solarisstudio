import { describe, expect, it } from "vitest";

import { resolveCombinedPublicationTarget } from "./combined-context";

const sources = [
  { source_round_id: "round-a", enabled: true },
  { source_round_id: null, enabled: true },
];
const bindings = [{ remote_round_id: "round-a", edition_id: "edition-1", show_id: "show-1" }];
const shows = [{ id: "show-1", edition_id: "edition-1" }];

describe("Combined publication context", () => {
  it("resolves manual correction sources alongside one bound show", () => {
    expect(resolveCombinedPublicationTarget({ sources, bindings, shows })).toEqual({
      editionId: "edition-1",
      showId: "show-1",
      sourceRoundIds: ["round-a"],
    });
  });

  it("rejects a requested context from another show", () => {
    expect(() =>
      resolveCombinedPublicationTarget({
        sources,
        bindings,
        shows,
        expectedEditionId: "edition-1",
        expectedShowId: "show-2",
      }),
    ).toThrow("does not belong to the requested Solaris edition and show");
  });

  it("rejects mixed source-round targets", () => {
    expect(() =>
      resolveCombinedPublicationTarget({
        sources: [
          { source_round_id: "round-a", enabled: true },
          { source_round_id: "round-b", enabled: true },
        ],
        bindings: [
          ...bindings,
          { remote_round_id: "round-b", edition_id: "edition-1", show_id: "show-2" },
        ],
        shows: [...shows, { id: "show-2", edition_id: "edition-1" }],
      }),
    ).toThrow("one Solaris edition and show");
  });

  it("rejects a stale or missing binding", () => {
    expect(() =>
      resolveCombinedPublicationTarget({
        sources,
        bindings: [],
        shows,
      }),
    ).toThrow("is not bound to a Solaris show");
  });
});
