import { describe, expect, it } from "vitest";

import { buildParticipationTasks, participationTaskCounts } from "./participation-os";

const round = {
  id: "round-1",
  edition_id: "edition-22",
  name: "SSC 22 confirmation",
  status: "open",
  response_count: 0,
  response_limit: null,
  opens_at: "2026-09-28T18:00:00.000Z",
  closes_at: "2026-10-04T18:00:00.000Z",
} as any;

describe("Solaris Participation OS", () => {
  it("turns an open missing confirmation into one required action", () => {
    const tasks = buildParticipationTasks({
      editionId: "edition-22",
      responses: [],
      rounds: [round],
      now: new Date("2026-09-29T18:00:00.000Z").getTime(),
    });

    expect(tasks[0]).toMatchObject({
      id: "confirmation-missing:edition-22",
      state: "needs_attention",
      actionRequired: true,
      blocking: true,
      route: "/confirmations",
    });
    expect(participationTaskCounts(tasks).needsAction).toBe(1);
  });

  it("stops treating a confirmation as actionable once a server response exists", () => {
    const tasks = buildParticipationTasks({
      editionId: "edition-22",
      responses: [
        {
          submission_id: "submission-1",
          round_id: "round-1",
          round_name: "SSC 22 confirmation",
          edition_id: "edition-22",
          edition_name: "SSC 22",
          edition_number: 22,
          country: "Oland",
          submitted_at: "2026-09-29T18:01:00.000Z",
          updated_at: "2026-09-29T18:01:00.000Z",
          can_edit: true,
          reason: "open",
        },
      ],
      rounds: [round],
      now: new Date("2026-09-29T18:05:00.000Z").getTime(),
    });

    expect(tasks[0]).toMatchObject({
      state: "completed",
      actionRequired: false,
      blocking: false,
    });
    expect(participationTaskCounts(tasks).needsAction).toBe(0);
  });

  it("treats confirmation as fulfilled for the whole edition, not per wave", () => {
    const oldWave = {
      ...round,
      id: "round-old",
      name: "First wave",
      status: "closed",
      opens_at: "2026-08-08T18:00:00.000Z",
      closes_at: "2026-08-09T18:00:00.000Z",
    };
    const confirmedWave = {
      ...round,
      id: "round-confirmed",
      name: "Second wave",
      status: "closed",
      opens_at: "2026-08-10T18:00:00.000Z",
      closes_at: "2026-08-11T18:00:00.000Z",
    };

    const tasks = buildParticipationTasks({
      editionId: "edition-22",
      responses: [
        {
          submission_id: "submission-2",
          round_id: "round-confirmed",
          round_name: "Second wave",
          edition_id: "edition-22",
          edition_name: "SSC 22",
          edition_number: 22,
          country: "Oland",
          submitted_at: "2026-08-10T18:05:00.000Z",
          updated_at: "2026-08-10T18:05:00.000Z",
          can_edit: false,
          reason: "editing_closed",
        },
      ],
      rounds: [oldWave, confirmedWave],
      now: new Date("2026-10-02T18:00:00.000Z").getTime(),
    });

    const confirmationTasks = tasks.filter((task) => task.kind === "confirmation");
    expect(confirmationTasks).toHaveLength(1);
    expect(confirmationTasks[0]).toMatchObject({
      id: "confirmation:edition-22",
      title: "Country confirmed",
      state: "completed",
      actionRequired: false,
      blocking: false,
    });
    expect(participationTaskCounts(tasks).needsAction).toBe(0);
  });

  it("does not turn a closed missed wave into an impossible action", () => {
    const closedRound = {
      ...round,
      status: "closed",
      closes_at: "2026-08-09T18:00:00.000Z",
    };

    const tasks = buildParticipationTasks({
      editionId: "edition-22",
      responses: [],
      rounds: [closedRound],
      now: new Date("2026-10-02T18:00:00.000Z").getTime(),
    });

    expect(tasks.filter((task) => task.kind === "confirmation")).toHaveLength(0);
    expect(participationTaskCounts(tasks).needsAction).toBe(0);
  });

  it("creates only one confirmation action when an older wave is closed and a current wave is open", () => {
    const oldWave = {
      ...round,
      id: "round-old",
      name: "First wave",
      status: "closed",
      opens_at: "2026-08-08T18:00:00.000Z",
      closes_at: "2026-08-09T18:00:00.000Z",
    };
    const currentWave = {
      ...round,
      id: "round-current",
      name: "Late confirmation wave",
    };

    const tasks = buildParticipationTasks({
      editionId: "edition-22",
      responses: [],
      rounds: [oldWave, currentWave],
      now: new Date("2026-09-29T18:00:00.000Z").getTime(),
    });

    const confirmationTasks = tasks.filter((task) => task.kind === "confirmation");
    expect(confirmationTasks).toHaveLength(1);
    expect(confirmationTasks[0]).toMatchObject({
      id: "confirmation-missing:edition-22",
      title: "Confirm participation",
      state: "needs_attention",
      actionRequired: true,
    });
  });

  it("only creates a jury reminder for an eligible missing ballot", () => {
    const tasks = buildParticipationTasks({
      editionId: "edition-22",
      responses: [],
      rounds: [],
      jury: {
        id: "grand-final",
        title: "Grand Final jury ballot",
        route: "/jury-voting",
        eligible: true,
        submitted: false,
        status: "open",
        closesAt: "2026-10-18T20:00:00.000Z",
      },
      now: new Date("2026-10-18T18:00:00.000Z").getTime(),
    });

    expect(tasks[0]).toMatchObject({
      kind: "jury",
      state: "needs_attention",
      actionRequired: true,
    });
  });
  it("keeps public televoting visible without turning it into a required delegation task", () => {
    const tasks = buildParticipationTasks({
      editionId: "edition-22",
      responses: [],
      rounds: [],
      televote: {
        id: "public-final",
        title: "Grand Final public voting",
        route: "/televoting",
        eligible: true,
        submitted: false,
        status: "open",
        required: false,
      },
      now: new Date("2026-10-18T18:00:00.000Z").getTime(),
    });

    expect(tasks[0]).toMatchObject({
      kind: "televote",
      state: "available",
      importance: "optional",
      actionRequired: false,
      blocking: false,
    });
    expect(participationTaskCounts(tasks).needsAction).toBe(0);
  });

});
