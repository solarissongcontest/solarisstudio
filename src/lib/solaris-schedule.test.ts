import { describe, expect, it } from "vitest";

import {
  confirmationDateToUtc,
  countdownParts,
  resolveScheduleState,
} from "./solaris-schedule";

describe("Solaris schedule state", () => {
  const now = new Date("2026-08-21T12:00:00.000Z").getTime();

  it("marks distant events as upcoming", () => {
    expect(resolveScheduleState({ opensAt: "2026-08-24T13:00:00.000Z" }, now)).toBe("upcoming");
  });

  it("marks events within 48 hours as opening soon", () => {
    expect(resolveScheduleState({ opensAt: "2026-08-22T13:00:00.000Z" }, now)).toBe(
      "opening-soon",
    );
  });

  it("marks a live window as open", () => {
    expect(
      resolveScheduleState(
        {
          status: "open",
          opensAt: "2026-08-20T12:00:00.000Z",
          closesAt: "2026-08-25T12:00:00.000Z",
        },
        now,
      ),
    ).toBe("open");
  });

  it("marks the last 48 hours as closing soon", () => {
    expect(
      resolveScheduleState(
        {
          status: "open",
          opensAt: "2026-08-20T12:00:00.000Z",
          closesAt: "2026-08-22T12:00:00.000Z",
        },
        now,
      ),
    ).toBe("closing-soon");
  });

  it("marks expired windows as closed", () => {
    expect(resolveScheduleState({ closesAt: "2026-08-21T11:59:59.000Z" }, now)).toBe("closed");
  });

  it("never resurrects an explicitly closed confirmation round without closes_at", () => {
    expect(
      resolveScheduleState(
        {
          status: "closed",
          opensAt: "2026-08-08T18:00:00.000Z",
          closesAt: null,
        },
        now,
      ),
    ).toBe("closed");
  });

  it("does not treat a draft with a stale opening timestamp as open", () => {
    expect(
      resolveScheduleState(
        {
          status: "draft",
          opensAt: "2026-08-08T18:00:00.000Z",
          closesAt: null,
        },
        now,
      ),
    ).toBe("upcoming");
  });
});

describe("entry reveal dates", () => {
  it("turns a confirmation date into midnight UTC", () => {
    expect(confirmationDateToUtc("2026-09-04")).toBe("2026-09-04T00:00:00.000Z");
  });

  it("rejects malformed dates", () => {
    expect(confirmationDateToUtc("September 4")).toBeNull();
  });

  it("builds stable countdown parts", () => {
    expect(countdownParts(((2 * 24 + 3) * 60 + 4) * 60 * 1000 + 5_000)).toEqual({
      days: 2,
      hours: 3,
      minutes: 4,
      seconds: 5,
    });
  });
});
