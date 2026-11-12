import { describe, expect, it } from "vitest";
import { publicParticipationJuryAction } from "./public-participation-jury-action";
import type { JurySummary } from "./public-participation-jury-summary";

const opensAt = "2026-11-14T18:00:00Z";
const closesAt = "2026-11-14T21:00:00Z";
const round = { id: "grand-final", name: "Grand Final", opensAt, closesAt };
const jury: JurySummary = {
  signedIn: true,
  restriction: null,
  openRound: round,
  completedOpenRound: null,
};
const during = Date.parse("2026-11-14T19:00:00Z");

describe("Public Participate jury availability", () => {
  it("advertises the eligible canonical ballot only during its recorded window", () => {
    expect(publicParticipationJuryAction(jury, Date.parse(opensAt)).status).toBe("available");
    expect(publicParticipationJuryAction(jury, during)).toMatchObject({
      status: "available",
      to: "/jury-voting",
      closesAt,
    });
  });
  it("places a future ballot in Upcoming, never Open now", () => {
    expect(publicParticipationJuryAction(jury, Date.parse(opensAt) - 1)).toMatchObject({
      status: "upcoming",
      opensAt,
    });
  });
  it("stops advertising a stale cached open ballot exactly at its deadline", () => {
    for (const now of [Date.parse(closesAt), Date.parse(closesAt) + 86_400_000]) {
      expect(publicParticipationJuryAction(jury, now).status).toBe("unavailable");
    }
  });
  it("does not resurrect a closed server round based on browser time", () => {
    expect(publicParticipationJuryAction({ ...jury, openRound: null }, during).status).toBe(
      "unavailable",
    );
  });
  it("keeps authoritative submission acknowledgement after the deadline", () => {
    expect(
      publicParticipationJuryAction(
        { ...jury, openRound: null, completedOpenRound: round },
        Date.parse(closesAt) + 1,
      ),
    ).toMatchObject({ status: "complete", title: "Jury ballot submitted" });
  });
  it("prefers an actionable new ballot over older submission history", () => {
    expect(
      publicParticipationJuryAction(
        { ...jury, completedOpenRound: { ...round, id: "semifinal" } },
        during,
      ).status,
    ).toBe("available");
  });
  it("requires signed-in, unrestricted canonical eligibility", () => {
    for (const value of [
      undefined,
      { ...jury, signedIn: false },
      { ...jury, restriction: "account_suspended" as const },
      { ...jury, restriction: "country_account_required" as const },
    ]) {
      expect(publicParticipationJuryAction(value, during).status).toBe("unavailable");
    }
  });
  it("permits an explicitly open server round with no scheduled bounds", () => {
    expect(
      publicParticipationJuryAction(
        { ...jury, openRound: { ...round, opensAt: null, closesAt: null } },
        during,
      ).status,
    ).toBe("available");
  });
});
