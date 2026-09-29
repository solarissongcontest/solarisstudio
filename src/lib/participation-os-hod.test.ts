import { describe, expect, it } from "vitest";

import { tasksFromHodWorkspace } from "./participation-os";

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    context: {
      editionId: "edition-22",
      editionName: "SSC 22",
      countryId: "oland",
      countryName: "Oland",
      confirmationComplete: true,
      participantStatus: "confirmed",
      publicationStatus: "draft",
      entry: {
        id: "entry-1",
        artist: "Artist",
        songTitle: "Song",
        songUrl: "https://example.com/song",
        status: "submitted",
        source: "confirmation",
        metadata: {},
        createdAt: "2026-09-20T10:00:00.000Z",
        updatedAt: "2026-09-20T10:00:00.000Z",
      },
      juryMembersRequired: 1,
      juryMembersAssigned: 1,
      juryMembers: [],
      juryBallotSubmitted: false,
      notices: [],
      deadlines: [],
      reviewHistory: [],
      unresolvedOrganizerIssues: 0,
      ...((overrides.context as Record<string, unknown> | undefined) ?? {}),
    },
    eligibility: {
      status: "ready",
      blockers: [],
      warnings: [],
      checks: [],
      ...((overrides.eligibility as Record<string, unknown> | undefined) ?? {}),
    },
    workflow: {
      complete: true,
      nextTaskIds: [],
      tasks: [],
      ...((overrides.workflow as Record<string, unknown> | undefined) ?? {}),
    },
    operationalReadiness: {
      score: 100,
      state: "ready",
      signals: [],
      overdueDeadlines: [],
      upcomingDeadlines: [],
      ...((overrides.operationalReadiness as Record<string, unknown> | undefined) ?? {}),
    },
    model: {
      editionId: "edition-22",
      editionName: "SSC 22",
      countryId: "oland",
      countryName: "Oland",
      readiness: 100,
      readinessState: "ready",
      actions: [],
      outstandingAcknowledgements: 0,
      jury: {
        assigned: 1,
        required: 1,
        complete: true,
        ballotSubmitted: false,
      },
      ...((overrides.model as Record<string, unknown> | undefined) ?? {}),
    },
  } as any;
}

describe("Participation OS Studio2 projection", () => {
  it("shows canonical completed milestones without manufacturing participant actions", () => {
    const tasks = tasksFromHodWorkspace(snapshot());

    expect(tasks.find((task) => task.id === "hod:confirmation-complete")).toMatchObject({
      state: "completed",
      actionRequired: false,
    });
    expect(tasks.find((task) => task.id === "hod:entry-status")).toMatchObject({
      state: "completed",
      actionRequired: false,
    });
    expect(tasks.every((task) => !task.actionRequired)).toBe(true);
  });

  it("preserves server-owned HOD actions as actionable tasks", () => {
    const tasks = tasksFromHodWorkspace(
      snapshot({
        model: {
          actions: [
            {
              id: "entry-blocked",
              label: "Fix entry requirements",
              description: "One entry requirement blocks approval.",
              priority: "critical",
              href: "/my-solaris/entry",
            },
          ],
        },
      }),
    );

    expect(tasks.find((task) => task.id === "hod:entry-blocked")).toMatchObject({
      kind: "entry",
      state: "problem",
      importance: "required",
      blocking: true,
      actionRequired: true,
      route: "/my-solaris/entry",
    });
  });

  it("marks an overdue canonical deadline as a problem but a completed one as complete", () => {
    const tasks = tasksFromHodWorkspace(
      snapshot({
        context: {
          deadlines: [
            {
              id: "media",
              label: "Artist media",
              dueAt: "2026-09-28T18:00:00.000Z",
              completedAt: null,
              kind: "media",
              notes: null,
            },
            {
              id: "credits",
              label: "Credits",
              dueAt: "2026-09-27T18:00:00.000Z",
              completedAt: "2026-09-27T12:00:00.000Z",
              kind: "entry",
              notes: null,
            },
          ],
        },
      }),
      new Date("2026-09-29T18:00:00.000Z").getTime(),
    );

    expect(tasks.find((task) => task.id === "hod:deadline:media")).toMatchObject({
      state: "problem",
      actionRequired: true,
      blocking: true,
    });
    expect(tasks.find((task) => task.id === "hod:deadline:credits")).toMatchObject({
      state: "completed",
      actionRequired: false,
      blocking: false,
    });
  });

  it("keeps unresolved organizer review informational instead of blaming the participant", () => {
    const tasks = tasksFromHodWorkspace(
      snapshot({ context: { unresolvedOrganizerIssues: 2 } }),
    );

    expect(tasks.find((task) => task.id === "hod:organizer-review")).toMatchObject({
      state: "waiting",
      importance: "informational",
      actionRequired: false,
      blocking: false,
    });
  });
});
