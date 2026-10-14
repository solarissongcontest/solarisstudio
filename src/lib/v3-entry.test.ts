import { describe, expect, it } from "vitest";

import { reviewMatchesCurrentVersion } from "./v3-entry";

describe("V3 Entry review evidence", () => {
  it("accepts only a review bound to the exact current immutable version", () => {
    expect(
      reviewMatchesCurrentVersion({
        currentVersionId: "version-2",
        reviewedVersionId: "version-2",
        reviewStatus: "accepted",
      }),
    ).toBe(true);

    expect(
      reviewMatchesCurrentVersion({
        currentVersionId: "version-2",
        reviewedVersionId: "version-1",
        reviewStatus: "accepted",
      }),
    ).toBe(false);
  });

  it("never treats pending or unversioned legacy evidence as a current approval", () => {
    expect(
      reviewMatchesCurrentVersion({
        currentVersionId: "version-2",
        reviewedVersionId: "version-2",
        reviewStatus: "pending",
      }),
    ).toBe(false);
    expect(
      reviewMatchesCurrentVersion({
        currentVersionId: null,
        reviewedVersionId: null,
        reviewStatus: "accepted",
      }),
    ).toBe(false);
  });
});
