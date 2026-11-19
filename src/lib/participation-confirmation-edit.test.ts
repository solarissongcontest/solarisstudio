import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/prediction-data", () => ({ useFanSession: vi.fn() }));

import { projectParticipationConfirmationEdit } from "./participation-confirmation-edit";

const dashboard = {
  authenticated: true,
  country: { country_id: "oland", name: "Oland" },
  edition: { name: "SSC 22" },
  response: { round: { id: "round-22", status: "closed" } },
  confirmation_state: "accepted",
  entry_state: "accepted",
  editing_open: true,
};

describe("existing Confirmation editing on Participate", () => {
  it("recognizes editing_open independently of closed new-submission rounds", () => {
    expect(projectParticipationConfirmationEdit(dashboard)).toEqual({
      status: "open",
      roundId: "round-22",
      countryName: "Oland",
      editionName: "SSC 22",
      changesRequested: false,
    });
  });

  it("identifies requested changes without making new Confirmation available", () => {
    expect(projectParticipationConfirmationEdit({ ...dashboard, entry_state: "changes_requested" }))
      .toMatchObject({ status: "open", changesRequested: true, roundId: "round-22" });
  });

  it("does not claim editing open when the server revokes permission", () => {
    expect(projectParticipationConfirmationEdit({ ...dashboard, editing_open: false }))
      .toMatchObject({ status: "closed", roundId: null });
    expect(projectParticipationConfirmationEdit({ ...dashboard, editing_open: "true" }))
      .toMatchObject({ status: "closed", roundId: null });
  });

  it("never exposes an editor to unrelated or unauthenticated identities", () => {
    expect(projectParticipationConfirmationEdit({ ...dashboard, authenticated: false }))
      .toMatchObject({ status: "no-delegation", roundId: null });
    expect(projectParticipationConfirmationEdit({ ...dashboard, country: null }))
      .toMatchObject({ status: "no-delegation", roundId: null });
  });

  it("fails closed but reports a malformed supposedly open editor instead of silently calling it closed", () => {
    expect(() => projectParticipationConfirmationEdit({ ...dashboard, response: null }))
      .toThrow("editable Confirmation could not be identified");
    expect(() => projectParticipationConfirmationEdit(null)).toThrow("status is unavailable");
    expect(() => projectParticipationConfirmationEdit({ ...dashboard, response: { round: { id: "" } } }))
      .toThrow("editable Confirmation could not be identified");
  });
});
