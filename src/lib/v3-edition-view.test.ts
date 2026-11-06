import { describe, expect, it } from "vitest";

import {
  V3_EDITION_OVERVIEW_LIMITS,
  resolveV3EditionCollectionView,
  v3EditionOverviewHref,
  v3EditionViewHref,
} from "./v3-edition-view";

describe("V3 Edition collection view contract", () => {
  it("pins the bounded Overview content budget from the canonical Chat 2 plan", () => {
    expect(V3_EDITION_OVERVIEW_LIMITS).toEqual({
      participants: 8,
      songs: 6,
      schedule: 3,
      storyItems: 3,
      resultRows: 3,
    });
  });

  it("accepts only deliberate Edition collection views", () => {
    expect(resolveV3EditionCollectionView("?view=participants")).toBe("participants");
    expect(resolveV3EditionCollectionView("view=songs")).toBe("songs");
    expect(resolveV3EditionCollectionView("?foo=bar&view=schedule")).toBe("schedule");
    expect(resolveV3EditionCollectionView("?view=results")).toBeNull();
    expect(resolveV3EditionCollectionView("?view=stories")).toBeNull();
    expect(resolveV3EditionCollectionView("?view=admin")).toBeNull();
    expect(resolveV3EditionCollectionView("")).toBeNull();
  });

  it("builds collection hrefs without destroying unrelated search state", () => {
    expect(v3EditionViewHref("/editions/ssc-22", "participants")).toBe(
      "/editions/ssc-22?view=participants",
    );
    expect(v3EditionViewHref("/editions/ssc-22?foo=bar#edition", "songs")).toBe(
      "/editions/ssc-22?foo=bar&view=songs",
    );
  });

  it("returns to Overview by removing only the collection selector", () => {
    expect(
      v3EditionOverviewHref("/editions/ssc-22?foo=bar&view=schedule#edition"),
    ).toBe("/editions/ssc-22?foo=bar#edition");
  });
});
