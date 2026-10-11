import { describe, expect, it } from "vitest";

import type { PublicContestState } from "./current-contest-state";
import type { EditionRuntimeState } from "./edition-state";
import type { SolarisTask } from "./participation-os";
import { projectV3Bootstrap } from "./v3-bootstrap";
import { v3BootstrapSourceFromExistingData } from "./v3-existing-data-adapter";

const publicContest: PublicContestState = {
  edition: {
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
    status: "live_show",
    published: true,
  },
  phase: "live",
  lifecycle: "live_show",
  statusKey: "live",
  statusLabel: "Live",
  headline: "Live now",
  description: "Semi-final 1 is live.",
  primaryAction: { label: "Open show", to: "/shows/semi-final-1" },
};

const runtime: EditionRuntimeState = {
  edition: "live_show",
  subsystems: {
    confirmations: "locked",
    submissions: "locked",
    juryVoting: "closed",
    televoting: "open",
    results: "not_started",
    predictions: "locked",
  },
};

const juryTask: SolarisTask = {
  id: "jury:sf1",
  editionId: "edition-22",
  kind: "jury",
  title: "Jury voting",
  description: "Finish the official ballot.",
  state: "needs_attention",
  importance: "required",
  blocking: true,
  actionRequired: true,
  opensAt: null,
  deadline: "2026-10-11T20:00:00.000Z",
  route: "/jury-voting",
  priority: 120,
  why: "Official ballot is incomplete.",
};

describe("V3 existing-data bootstrap adapter", () => {
  it("prefers orthogonal runtime state when the current page already has it", () => {
    const source = v3BootstrapSourceFromExistingData({
      publicContest,
      runtime,
      show: "live",
      tasks: [juryTask],
      identity: { userId: "user-1", displayName: "Arthur" },
      delegation: { id: "oland", name: "Oland" },
      capabilities: ["jury.vote"],
      serverTime: "2026-10-11T18:00:00.000Z",
    });
    const bootstrap = projectV3Bootstrap(source);

    expect(bootstrap.experience.mode).toBe("live-voting");
    expect(bootstrap.attention.primary?.id).toBe("jury:sf1");
    expect(bootstrap.context).toMatchObject({
      editionId: "edition-22",
      editionLabel: "Solaris Song Contest 22",
      delegationId: "oland",
      delegationName: "Oland",
    });
  });

  it("falls back to the current public-state resolver without inventing overlapping voting state", () => {
    const source = v3BootstrapSourceFromExistingData({
      publicContest,
      tasks: [],
      identity: { userId: null, displayName: null },
      capabilities: [],
      serverTime: "2026-10-11T18:00:00.000Z",
    });
    const bootstrap = projectV3Bootstrap(source);

    expect(bootstrap.experience.mode).toBe("live");
    expect(bootstrap.experience.votingOpen).toBe(false);
  });

  it("passes spoiler preference and capabilities into the one bootstrap source", () => {
    const source = v3BootstrapSourceFromExistingData({
      publicContest: {
        ...publicContest,
        phase: "results_published",
        lifecycle: "results",
      },
      tasks: [],
      identity: { userId: "user-1", displayName: "Arthur" },
      capabilities: ["result.view"],
      serverTime: "2026-10-11T22:00:00.000Z",
      hideResultSpoilers: true,
    });
    const bootstrap = projectV3Bootstrap(source);

    expect(bootstrap.capabilities).toEqual(["result.view"]);
    expect(bootstrap.home.primaryMode).toBe("results-hidden");
    expect(bootstrap.home.showResults).toBe(false);
  });
});
