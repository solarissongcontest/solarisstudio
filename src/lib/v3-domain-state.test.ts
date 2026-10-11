import { describe, expect, it } from "vitest";

import {
  projectV3Experience,
  type V3DomainSnapshot,
} from "./v3-domain-state";

function snapshot(overrides: Partial<V3DomainSnapshot> = {}): V3DomainSnapshot {
  return {
    edition: "active",
    confirmation: "closed",
    entry: "verified",
    show: "scheduled",
    jury: "closed",
    televote: "locked",
    results: "hidden",
    publication: "scheduled",
    ...overrides,
  };
}

describe("V3 domain-state experience projection", () => {
  it("does not require workflows to form one linear global phase", () => {
    const state = snapshot({
      confirmation: "closed",
      entry: "under_review",
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
