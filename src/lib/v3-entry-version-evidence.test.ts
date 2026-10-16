import { describe, expect, it } from "vitest";

import { entryVersionEvidenceLabel } from "@/components/ConfirmationReviewStatus";

describe("V3 Entry review version evidence", () => {
  it("binds a decision only when the reviewed and current immutable versions match", () => {
    expect(
      entryVersionEvidenceLabel({
        review_status: "accepted",
        content_revision: 4,
        current_version_id: "version-4",
        reviewed_version_id: "version-4",
      }),
    ).toBe("Version 4 · Review applies to this version");
  });

  it("surfaces a stale decision when the entry changed after review", () => {
    expect(
      entryVersionEvidenceLabel({
        review_status: "accepted",
        content_revision: 5,
        current_version_id: "version-5",
        reviewed_version_id: "version-4",
      }),
    ).toBe("Version 5 · Entry changed after review · Review applies to an earlier version");
  });

  it("keeps legacy unbound reviews distinct from stale version-bound reviews", () => {
    expect(
      entryVersionEvidenceLabel({
        review_status: "declined",
        content_revision: 3,
        current_version_id: "version-3",
        reviewed_version_id: null,
      }),
    ).toBe("Version 3 · Earlier review has no version binding");
  });

  it("shows the current immutable version as awaiting review before a decision", () => {
    expect(
      entryVersionEvidenceLabel({
        review_status: "pending",
        content_revision: 6,
        current_version_id: "version-6",
        reviewed_version_id: "version-5",
      }),
    ).toBe("Version 6 · Awaiting review of this version");
  });
});
