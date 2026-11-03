import { describe, expect, it } from "vitest";

import type { CountryConfirmationResponse } from "./confirmation-country-account";
import {
  preferredCountryConfirmationResponse,
  countryConfirmationOverviewMessage,
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

  it("does not present an editable response from another edition as the selected edition's response", () => {
    const historical = response({ edition_id: "edition-21", round_id: "round-21", can_edit: true });
    const current = response({ edition_id: "edition-22", round_id: "round-22", can_edit: false });
    expect(preferredCountryConfirmationResponse([historical, current], "edition-22")).toBe(current);
    expect(preferredCountryConfirmationResponse([historical], "edition-22")).toBeNull();
  });

  it("prefers an editable response only within the requested edition", () => {
    const locked = response({ submission_id: "locked", can_edit: false });
    const open = response({ submission_id: "open", round_id: "round-22b", can_edit: true });
    expect(preferredCountryConfirmationResponse([locked, open], "edition-22")).toBe(open);
  });

  it("never claims completion from a saved response when the requirement remains required", () => {
    const message = countryConfirmationOverviewMessage("required", true, false);
    expect(message).toContain("still outstanding");
    expect(message).not.toContain("requirement is satisfied");
  });

  it("distinguishes waived, invalidated, satisfied and cross-edition historical responses", () => {
    expect(countryConfirmationOverviewMessage("satisfied", true, false)).toContain("is satisfied");
    expect(countryConfirmationOverviewMessage("waived", false, false)).toContain("waived");
    expect(countryConfirmationOverviewMessage("invalidated", true, false)).toContain("invalidated");
    expect(countryConfirmationOverviewMessage(null, false, true)).toContain("another edition");
    expect(countryConfirmationOverviewMessage(null, true, false)).toContain("alone does not prove completion");
  });
});
