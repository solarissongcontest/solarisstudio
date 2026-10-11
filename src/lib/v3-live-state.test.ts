import { describe, expect, it } from "vitest";

import type { V3ContestDomainSnapshot } from "./v3-domain-state";
import { projectV3LiveState } from "./v3-live-state";

function snapshot(overrides: Partial<V3ContestDomainSnapshot> = {}): V3ContestDomainSnapshot {
  return {
    edition: "active",
    confirmationWindow: "closed",
    submissionWindow: "closed",
    show: "scheduled",
    jury: "finalized",
    televote: "upcoming",
    results: "hidden",
    publication: "scheduled",
    ...overrides,
  };
}

describe("V3 live resilience", () => {
  it("projects a normal live show without inventing voting", () => {
    expect(projectV3LiveState(snapshot({ show: "live" }))).toMatchObject({
      status: "live",
      showInteractive: true,
      votingInteractive: false,
      showRecoveryMessage: false,
    });
  });

  it("surfaces a delayed show as a recoverable warning while preserving running order", () => {
    expect(projectV3LiveState(snapshot({ show: "delayed" }))).toMatchObject({
      status: "delayed",
      severity: "warning",
      preserveRunningOrder: true,
      showRecoveryMessage: true,
    });
  });

  it("keeps paused show context visible instead of falling back to a generic non-live screen", () => {
    expect(projectV3LiveState(snapshot({ show: "paused" }))).toMatchObject({
      status: "paused",
      showInteractive: true,
      preserveRunningOrder: true,
    });
  });

  it("blocks voting interaction while a canonical voting window is paused", () => {
    expect(
      projectV3LiveState(snapshot({ show: "live", televote: "paused" })),
    ).toMatchObject({
      status: "voting_paused",
      votingInteractive: false,
      showInteractive: true,
    });
  });

  it("treats an extended voting window as open even after the show ended", () => {
    expect(
      projectV3LiveState(snapshot({ show: "ended", televote: "extended" })),
    ).toMatchObject({
      status: "voting_extended",
      votingInteractive: true,
      showRecoveryMessage: true,
    });
  });

  it("shows results-delay state after the show ends without published results", () => {
    expect(
      projectV3LiveState(snapshot({ show: "ended", televote: "validated", results: "reviewing" })),
    ).toMatchObject({
      status: "results_delayed",
      resultsAvailable: false,
      showRecoveryMessage: true,
    });
  });

  it("lets published results outrank stale live decoration", () => {
    expect(
      projectV3LiveState(snapshot({ show: "paused", televote: "closed", results: "published", publication: "public" })),
    ).toMatchObject({
      status: "results_published",
      severity: "success",
      resultsAvailable: true,
      votingInteractive: false,
    });
  });

  it("surfaces show cancellation as critical and never exposes voting controls", () => {
    expect(
      projectV3LiveState(snapshot({ show: "cancelled", televote: "upcoming" })),
    ).toMatchObject({
      status: "cancelled",
      severity: "critical",
      showInteractive: false,
      votingInteractive: false,
      showRecoveryMessage: true,
    });
  });
});
