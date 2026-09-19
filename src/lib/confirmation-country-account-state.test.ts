import { describe, expect, it } from "vitest";

import type { CountryConfirmationResponse } from "./confirmation-country-account";
import {
  preferredCountryConfirmationResponse,
  resolveCountryConfirmationRoundState,
} from "./confirmation-country-account-state";

function response(
  overrides: Partial<CountryConfirmationResponse> = {},
): CountryConfirmationResponse {
  return {
    submission_id: "submission-1",
    round_id: "round-22",
    round_name: "SSC22 confirmation",
    edition_id: "edition-22",
    edition_name: "Solaris Song Contest 22",
    edition_number: 22,
    country: "Oland",
    submitted_at: "2026-09-19T18:00:00Z",
    updated_at: "2026-09-19T18:00:00Z",
    can_edit: true,
    reason: "open",
    ...overrides,
  };
}

describe("country-account confirmation state", () => {
  it("keeps a signed-in HOD in create state when this round has no response", () => {
    expect(resolveCountryConfirmationRoundState([], "round-22")).toEqual({
      kind: "create",
      response: null,
    });
  });

  it("keeps a response from another round from forcing the selected round into edit state", () => {
    const oldResponse = response({ round_id: "round-21", edition_number: 21 });

    expect(resolveCountryConfirmationRoundState([oldResponse], "round-22")).toEqual({
      kind: "create",
      response: null,
    });
  });

  it("returns the exact existing response for the selected round so edit-token creation has a valid target", () => {
    const currentResponse = response();

    expect(resolveCountryConfirmationRoundState([currentResponse], "round-22")).toEqual({
      kind: "edit",
      response: currentResponse,
    });
  });

  it("prefers an editable response for the signed-in country account", () => {
    const closed = response({
      submission_id: "closed",
      round_id: "round-21",
      can_edit: false,
      reason: "editing_closed",
    });
    const editable = response({
      submission_id: "editable",
      round_id: "round-22",
      can_edit: true,
    });

    expect(preferredCountryConfirmationResponse([closed, editable])).toBe(editable);
  });

  it("falls back to the first saved response when none can be edited", () => {
    const first = response({ submission_id: "first", can_edit: false, reason: "locked" });
    const second = response({
      submission_id: "second",
      round_id: "round-21",
      can_edit: false,
      reason: "editing_closed",
    });

    expect(preferredCountryConfirmationResponse([first, second])).toBe(first);
  });
});
