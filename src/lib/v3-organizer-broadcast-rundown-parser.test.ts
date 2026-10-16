import { describe, expect, it } from "vitest";

import {
  parseStudio2BroadcastRundown,
  STUDIO2_RUNDOWN_CONFIG_KEY,
} from "./studio2-broadcast-rundown";

function config(segments: unknown[]) {
  return {
    [STUDIO2_RUNDOWN_CONFIG_KEY]: {
      version: 2,
      revision: 3,
      startAt: "2026-10-16T18:00:00.000Z",
      segments,
      lockedAt: null,
      lockedBy: null,
      lockReason: null,
      updatedAt: "2026-10-16T17:00:00.000Z",
      updatedBy: "organizer-1",
    },
  };
}

const opening = {
  id: "opening",
  label: "Opening sequence",
  status: "ready",
  plannedDurationSeconds: 180,
};

describe("V3 Organizer Broadcast canonical rundown parsing", () => {
  it("accepts a structurally valid canonical rundown", () => {
    const parsed = parseStudio2BroadcastRundown(config([opening]));
    expect(parsed?.revision).toBe(3);
    expect(parsed?.segments).toHaveLength(1);
    expect(parsed?.segments[0]?.id).toBe("opening");
  });

  it("rejects the whole rundown when any canonical segment is malformed", () => {
    expect(
      parseStudio2BroadcastRundown(
        config([
          opening,
          {
            id: "voting",
            label: "Voting",
            status: "planned",
            plannedDurationSeconds: 0,
          },
        ]),
      ),
    ).toBeNull();
  });

  it("rejects duplicate segment identities instead of silently accepting ambiguous Live state", () => {
    expect(
      parseStudio2BroadcastRundown(
        config([
          opening,
          { ...opening, label: "Duplicate opening" },
        ]),
      ),
    ).toBeNull();
  });

  it("rejects impossible snapshots with more than one live segment", () => {
    expect(
      parseStudio2BroadcastRundown(
        config([
          { ...opening, status: "live" },
          {
            id: "performances",
            label: "Performances",
            status: "live",
            plannedDurationSeconds: 3600,
          },
        ]),
      ),
    ).toBeNull();
  });
});
