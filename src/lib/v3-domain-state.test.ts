import { describe, expect, it } from "vitest";

import {
  projectV3Experience,
  type V3ContestDomainSnapshot,
} from "./v3-domain-state";

function snapshot(
  overrides: Partial<V3ContestDomainSnapshot> = {},
): V3ContestDomainSnapshot {
  return {
    edition: "active",
    confirmationWindow: "closed",
    submissionWindow: "closed",
    show: "scheduled",
    jury: "closed",
    televote: "locked",
    results: "hidden",
    publication: "scheduled",
    ...overrides,
  };
}

describe("V3 contest-domain experience projection", () => {
  it("does not require overlapping contest systems to form one linear global phase", () => {
    const state = snapshot({
      confirmationWindow: "closed",
      submissionWindow: "open",
      jury: "open",
      show: "scheduled",
      televote: "upcoming",
    });

    expect(projectV3Experience(state)).toEqual({
      mode: "active",
      live: false,
      votingOpen: false,
      resultsPublic: false,
    });
  });

  it("keeps participant entry completion out of contest-domain state", () => {
    const state = snapshot({ submissionWindow: "open" });
    expect("entry" in state).toBe(false);
    expect("confirmation" in state).toBe(false);
  });

  it("projects a preparing show as show-day without pretending voting is open", () => {
    expect(projectV3Experience(snapshot({ show: "preparing" }))).toEqual({
      mode: "show-day",
      live: false,
      votingOpen: false,
      resultsPublic: false,
    });
  });

  it("projects live voting when the live and televote domains overlap", () => {
    expect(
      projectV3Experience(
        snapshot({
          show: "live",
          televote: "open",
        }),
      ),
    ).toEqual({
      mode: "live-voting",
      live: true,
      votingOpen: true,
      resultsPublic: false,
    });
  });

  it("keeps delayed and paused shows in the live operational experience", () => {
    expect(projectV3Experience(snapshot({ show: "delayed" })).mode).toBe("live");
    expect(projectV3Experience(snapshot({ show: "paused" })).mode).toBe("live");
  });

  it("supports voting independently of the current show state", () => {
    const projected = projectV3Experience(
      snapshot({
        show: "ended",
        televote: "extended",
      }),
    );

    expect(projected.mode).toBe("voting");
    expect(projected.live).toBe(false);
    expect(projected.votingOpen).toBe(true);
  });

  it("gives published results precedence over stale live decoration", () => {
    const projected = projectV3Experience(
      snapshot({
        show: "paused",
        televote: "closed",
        results: "published",
      }),
    );

    expect(projected.mode).toBe("results");
    expect(projected.resultsPublic).toBe(true);
  });

  it("treats corrected official results as public results", () => {
    expect(projectV3Experience(snapshot({ results: "corrected" })).mode).toBe("results");
  });

  it("keeps cancelled and archived editions explicit", () => {
    expect(projectV3Experience(snapshot({ edition: "cancelled" })).mode).toBe("cancelled");
    expect(projectV3Experience(snapshot({ edition: "archived" })).mode).toBe("archived");
  });
});
