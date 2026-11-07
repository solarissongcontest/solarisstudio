import { describe, expect, it } from "vitest";

import { projectJurySummary } from "./public-participation-jury-summary";

const eligibleOpen = {
  show_id: "show-1",
  show_name: "Grand Final",
  status: "open",
  eligible: true,
  already_submitted: false,
  opened_at: "2026-11-05T18:00:00+00:00",
  closed_at: "2026-11-05T21:00:00+00:00",
};

describe("canonical jury context display projection", () => {
  it("accepts the two explicit caller-scoped access restrictions", () => {
    for (const error of ["country_account_required", "account_suspended"]) {
      expect(projectJurySummary({ ok: false, error })).toEqual({
        restriction: error,
        openRound: null,
        completedOpenRound: null,
      });
    }
  });

  it("does not confuse invalid RPC responses with no open rounds", () => {
    for (const payload of [
      null,
      [],
      {},
      { ok: false, error: "not_authenticated" },
      { ok: false, error: "rpc_failed" },
      { ok: true },
      { ok: true, rounds: null },
      { ok: true, rounds: {} },
      { ok: true, rounds: [null] },
      { ok: true, rounds: [{ status: "open" }] },
    ]) {
      expect(() => projectJurySummary(payload)).toThrow();
    }
  });

  it("shows the official eligible open round and canonical deadline", () => {
    expect(projectJurySummary({ ok: true, rounds: [eligibleOpen] })).toEqual({
      restriction: null,
      openRound: {
        id: "show-1",
        name: "Grand Final",
        opensAt: "2026-11-05T18:00:00+00:00",
        closesAt: "2026-11-05T21:00:00+00:00",
      },
      completedOpenRound: null,
    });
  });

  it("retains submitted jury truth separately from an available ballot", () => {
    const submitted = {
      ...eligibleOpen,
      show_id: "show-2",
      show_name: "Semi-Final",
      already_submitted: true,
    };
    const value = projectJurySummary({
      ok: true,
      rounds: [submitted, eligibleOpen],
    });
    expect(value.openRound?.id).toBe("show-1");
    expect(value.completedOpenRound?.id).toBe("show-2");
  });

  it("does not fabricate availability for ineligible or closed rounds", () => {
    expect(projectJurySummary({
      ok: true,
      rounds: [
        { ...eligibleOpen, eligible: false },
        { ...eligibleOpen, status: "closed" },
      ],
    })).toEqual({
      restriction: null,
      openRound: null,
      completedOpenRound: null,
    });
  });

  it("rejects ambiguous identities and invalid timestamps rather than silently displaying them", () => {
    for (const row of [
      { ...eligibleOpen, show_id: undefined },
      { ...eligibleOpen, show_id: "" },
      { ...eligibleOpen, eligible: null },
      { ...eligibleOpen, already_submitted: "false" },
      { ...eligibleOpen, opened_at: "not a date" },
      { ...eligibleOpen, closed_at: 1730000000 },
    ]) {
      expect(() => projectJurySummary({ ok: true, rounds: [row] })).toThrow();
    }
  });

  it("supports the legacy open/close aliases only when canonical fields are absent", () => {
    const { opened_at, closed_at, ...legacy } = eligibleOpen;
    expect(projectJurySummary({
      ok: true,
      rounds: [{ ...legacy, opens_at: opened_at, closes_at: closed_at }],
    }).openRound).toEqual({
      id: "show-1",
      name: "Grand Final",
      opensAt: opened_at,
      closesAt: closed_at,
    });
  });
});
