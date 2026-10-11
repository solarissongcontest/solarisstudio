import { describe, expect, it } from "vitest";

import type { PublicContestPhase, PublicContestState } from "./current-contest-state";
import type { EditionState } from "./edition-state";
import { projectV3Experience } from "./v3-domain-state";
import { v3ContestDomainFromPublicState } from "./v3-public-contest-adapter";

function state(
  phase: PublicContestPhase,
  lifecycle: EditionState | null = "pre_show",
): PublicContestState {
  const hasEdition = phase !== "between_editions";
  return {
    edition: hasEdition
      ? {
          id: "edition-22",
          edition_number: 22,
          name: "Solaris Song Contest 22",
          year: 2026,
          slug: "ssc-22",
          description: null,
          host_country_id: null,
          host_city: "Tetlehamn",
          logo: null,
          theme_id: null,
          status: lifecycle ?? "planning",
          published: true,
        }
      : null,
    phase,
    lifecycle: hasEdition ? lifecycle : null,
    statusKey: phase === "live" ? "live" : "current",
    statusLabel: phase,
    headline: "Preview",
    description: "Preview",
    primaryAction: null,
  };
}

describe("V3 transitional public contest adapter", () => {
  it("reuses confirmation/submission phase facts without inventing participant completion", () => {
    const confirmation = v3ContestDomainFromPublicState(state("confirmations", "confirmations"));
    expect(confirmation.confirmationWindow).toBe("open");
    expect(confirmation.submissionWindow).toBe("scheduled");
    expect("entry" in confirmation).toBe(false);

    const submissions = v3ContestDomainFromPublicState(state("submissions", "submissions"));
    expect(submissions.confirmationWindow).toBe("closed");
    expect(submissions.submissionWindow).toBe("open");
  });

  it("maps existing live presentation state into the V3 live experience without extra queries", () => {
    const domain = v3ContestDomainFromPublicState(state("live", "live_show"));
    const experience = projectV3Experience(domain);

    expect(domain.show).toBe("live");
    expect(experience.mode).toBe("live");
    expect(experience.live).toBe(true);
  });

  it("does not falsely infer overlapping open televote from the legacy live phase", () => {
    const domain = v3ContestDomainFromPublicState(state("live", "live_show"));

    expect(domain.televote).toBe("upcoming");
    expect(projectV3Experience(domain).mode).toBe("live");
  });

  it("maps explicit public voting and results states", () => {
    const voting = v3ContestDomainFromPublicState(state("voting", "televoting"));
    expect(voting.televote).toBe("open");
    expect(projectV3Experience(voting).mode).toBe("voting");

    const pending = v3ContestDomainFromPublicState(state("results_pending", "vote_verification"));
    expect(pending.results).toBe("reviewing");
    expect(pending.televote).toBe("validating");

    const published = v3ContestDomainFromPublicState(state("results_published", "results"));
    expect(published.results).toBe("published");
    expect(published.publication).toBe("public");
    expect(projectV3Experience(published).mode).toBe("results");
  });

  it("keeps between-edition state sparse rather than inventing workflow windows", () => {
    const domain = v3ContestDomainFromPublicState(state("between_editions", null));

    expect(domain.edition).toBe("planning");
    expect(domain.confirmationWindow).toBeNull();
    expect(domain.submissionWindow).toBeNull();
    expect(domain.show).toBeNull();
    expect(domain.jury).toBeNull();
    expect(domain.televote).toBeNull();
    expect(domain.publication).toBeNull();
  });
});
