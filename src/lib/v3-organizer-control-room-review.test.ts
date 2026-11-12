import { describe, expect, it } from "vitest";

import { controlRoomReviewMatchesEdition } from "./v3-organizer-control-room-review";

describe("Control Room reviewed-command edition identity", () => {
  it("permits an operation only when selected, loaded and reviewed editions all match", () => {
    expect(controlRoomReviewMatchesEdition("ssc22", "ssc22", "ssc22")).toBe(true);
  });

  it("rejects a review from an old edition even if the new runtime version and state match", () => {
    expect(controlRoomReviewMatchesEdition("ssc22", "ssc23", "ssc23")).toBe(false);
    expect(controlRoomReviewMatchesEdition("ssc22", "ssc22", "ssc23")).toBe(false);
    expect(controlRoomReviewMatchesEdition("ssc22", "ssc23", "ssc22")).toBe(false);
  });

  it("fails closed before context or snapshot has resolved", () => {
    expect(controlRoomReviewMatchesEdition("ssc22", null, "ssc22")).toBe(false);
    expect(controlRoomReviewMatchesEdition("ssc22", "ssc22", null)).toBe(false);
    expect(controlRoomReviewMatchesEdition("", "", "")).toBe(false);
  });
});
