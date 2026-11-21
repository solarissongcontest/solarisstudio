import { describe, expect, it } from "vitest";
import {
  confirmationResponseCountLabel,
  describeConfirmationResponseLoadFailure,
} from "./v3-confirmation-response-load-state";

describe("Organizer Confirmation response loading", () => {
  it("identifies missing exact-edition backend RPCs from plain PostgREST error objects", () => {
    expect(describeConfirmationResponseLoadFailure({ code: "PGRST202", message: "Could not find the function" }))
      .toMatch(/controlled database deployment/);
    expect(describeConfirmationResponseLoadFailure({ code: "42883", message: "function does not exist" }))
      .toMatch(/exact-edition/);
  });

  it("distinguishes denied permission and network failure", () => {
    expect(describeConfirmationResponseLoadFailure({ code: "42501", message: "permission denied" }))
      .toMatch(/Organizer permissions/);
    expect(describeConfirmationResponseLoadFailure(new Error("Failed to fetch")))
      .toMatch(/connection and retry/);
  });

  it("retains actionable messages for ordinary failures and never converts unknown failures to success", () => {
    expect(describeConfirmationResponseLoadFailure({ code: "OTHER", message: "Unexpected response" }))
      .toBe("Unexpected response");
    expect(describeConfirmationResponseLoadFailure({ unexpected: true }))
      .toBe("Exact-edition responses could not be loaded.");
  });

  it("shows unavailable instead of a misleading zero until the scoped page succeeds", () => {
    expect(confirmationResponseCountLabel(0, false)).toBe("—");
    expect(confirmationResponseCountLabel(3, false)).toBe("—");
    expect(confirmationResponseCountLabel(0, true)).toBe("0");
    expect(confirmationResponseCountLabel(3, true)).toBe("3");
  });
});
