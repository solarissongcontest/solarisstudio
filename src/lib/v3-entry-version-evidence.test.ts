import { describe, expect, it } from "vitest";

import {
  entryVersionEvidenceLabel,
  reviewDisplayStatus,
} from "@/components/ConfirmationReviewStatus";

describe("V3 Entry review version evidence", () => {
  it("binds a decision only when the reviewed and current immutable versions match", () => {
    const entry = {
      review_status: "accepted",
      content_revision: 4,
      current_version_id: "version-4",
      reviewed_version_id: "version-4",
    };

    expect(entryVersionEvidenceLabel(entry)).toBe(
      "Version 4 · Review applies to this version",
    );
    expect(reviewDisplayStatus(entry)).toBe("accepted");
  });

  it("surfaces a stale accepted decision as waiting for review of the current version", () => {
    const entry = {
      review_status: "accepted",
      content_revision: 5,
      current_version_id: "version-5",
      reviewed_version_id: "version-4",
    };

    expect(entryVersionEvidenceLabel(entry)).toBe(
      "Version 5 · Entry changed after review · Review applies to an earlier version",
    );
    expect(reviewDisplayStatus(entry)).toBe("pending");
  });

  it("does not present a stale declined decision as a current rejection", () => {
    const entry = {
      review_status: "declined",
      content_revision: 8,
      current_version_id: "version-8",
      reviewed_version_id: "version-7",
    };

    expect(entryVersionEvidenceLabel(entry)).toBe(
      "Version 8 · Entry changed after review · Review applies to an earlier version",
    );
    expect(reviewDisplayStatus(entry)).toBe("pending");
  });

  it("keeps legacy unbound reviews distinct from stale version-bound reviews", () => {
    const entry = {
      review_status: "declined",
      content_revision: 3,
      current_version_id: "version-3",
      reviewed_version_id: null,
    };

    expect(entryVersionEvidenceLabel(entry)).toBe(
      "Version 3 · Earlier review has no version binding",
    );
    expect(reviewDisplayStatus(entry)).toBe("declined");
  });

  it("shows the current immutable version as awaiting review before a decision", () => {
    const entry = {
      review_status: "pending",
      content_revision: 6,
      current_version_id: "version-6",
      reviewed_version_id: "version-5",
    };

    expect(entryVersionEvidenceLabel(entry)).toBe(
      "Version 6 · Awaiting review of this version",
    );
    expect(reviewDisplayStatus(entry)).toBe("pending");
  });
});
