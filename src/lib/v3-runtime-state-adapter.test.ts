import { describe, expect, it } from "vitest";

import type { EditionRuntimeState } from "./edition-state";
import { projectV3Experience } from "./v3-domain-state";
import { v3ContestDomainFromRuntime } from "./v3-runtime-state-adapter";

function runtime(overrides: Partial<EditionRuntimeState> = {}): EditionRuntimeState {
  return {
    edition: "pre_show",
    subsystems: {
      confirmations: "locked",
      submissions: "locked",
      juryVoting: "open",
      televoting: "not_started",
      results: "not_started",
      predictions: "locked",
    },
    ...overrides,
  };
}

describe("V3 runtime-state adapter", () => {
  it("preserves overlapping subsystem truth instead of forcing one global phase", () => {
    const domain = v3ContestDomainFromRuntime({
      runtime: runtime({
        edition: "live_show",
        subsystems: {
          confirmations: "locked",
          submissions: "locked",
          juryVoting: "closed",
          televoting: "open",
          results: "not_started",
          predictions: "locked",
        },
      }),
      show: "live",
    });

    expect(domain.show).toBe("live");
    expect(domain.televote).toBe("open");
    expect(domain.jury).toBe("closed");
    expect(projectV3Experience(domain).mode).toBe("live-voting");
  });

  it("maps runtime confirmation and submission windows without participant-state guesses", () => {
    const domain = v3ContestDomainFromRuntime({
      runtime: runtime({
        edition: "submissions",
        subsystems: {
          confirmations: "locked",
          submissions: "open",
          juryVoting: "not_started",
          televoting: "not_started",
          results: "not_started",
          predictions: "open",
        },
      }),
      show: null,
    });

    expect(domain.confirmationWindow).toBe("closed");
    expect(domain.submissionWindow).toBe("open");
    expect(domain.jury).toBe("upcoming");
    expect(domain.televote).toBe("upcoming");
    expect("entry" in domain).toBe(false);
  });

  it("treats pre-phase locked voting subsystems as locked rather than completed", () => {
    const domain = v3ContestDomainFromRuntime({
      runtime: runtime({
        edition: "submissions",
        subsystems: {
          confirmations: "locked",
          submissions: "open",
          juryVoting: "locked",
          televoting: "locked",
          results: "not_started",
          predictions: "open",
        },
      }),
      show: null,
    });

    expect(domain.jury).toBe("locked");
    expect(domain.televote).toBe("locked");
  });

  it("treats post-phase locked subsystems as closed", () => {
    const domain = v3ContestDomainFromRuntime({
      runtime: runtime({
        edition: "vote_verification",
        subsystems: {
          confirmations: "locked",
          submissions: "locked",
          juryVoting: "locked",
          televoting: "locked",
          results: "open",
          predictions: "locked",
        },
      }),
      show: "ended",
    });

    expect(domain.jury).toBe("closed");
    expect(domain.televote).toBe("closed");
    expect(domain.results).toBe("reviewing");
  });

  it("maps verified and published results into approved/public output", () => {
    const approved = v3ContestDomainFromRuntime({
      runtime: runtime({
        edition: "vote_verification",
        subsystems: {
          confirmations: "locked",
          submissions: "locked",
          juryVoting: "verified",
          televoting: "verified",
          results: "verified",
          predictions: "locked",
        },
      }),
      show: "ended",
    });

    expect(approved.jury).toBe("validated");
    expect(approved.televote).toBe("validated");
    expect(approved.results).toBe("approved");
    expect(approved.publication).toBe("scheduled");

    const published = v3ContestDomainFromRuntime({
      runtime: runtime({
        edition: "results",
        subsystems: {
          confirmations: "locked",
          submissions: "locked",
          juryVoting: "verified",
          televoting: "verified",
          results: "published",
          predictions: "locked",
        },
      }),
      show: "ended",
    });

    expect(published.results).toBe("published");
    expect(published.publication).toBe("public");
    expect(projectV3Experience(published).mode).toBe("results");
  });

  it("maps archived and post-edition lifecycle independently from subsystem completion", () => {
    expect(
      v3ContestDomainFromRuntime({
        runtime: runtime({ edition: "post_edition" }),
        show: "ended",
      }).edition,
    ).toBe("completed");

    expect(
      v3ContestDomainFromRuntime({
        runtime: runtime({ edition: "archived" }),
        show: "ended",
      }).edition,
    ).toBe("archived");
  });
});
