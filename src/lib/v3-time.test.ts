import { describe, expect, it } from "vitest";

import {
  createV3ServerClock,
  formatV3ContestTime,
  formatV3Countdown,
  projectV3Deadline,
  v3ServerNowMs,
} from "./v3-time";

describe("V3 time model", () => {
  it("anchors countdowns to server time rather than the configured device clock", () => {
    const fakeDeviceNow = Date.parse("2047-01-01T00:00:00.000Z");
    const clock = createV3ServerClock("2026-10-11T16:00:00.000Z", fakeDeviceNow);

    expect(v3ServerNowMs(clock, fakeDeviceNow + 30_000)).toBe(
      Date.parse("2026-10-11T16:00:30.000Z"),
    );
  });

  it("classifies deadline urgency from server-relative time", () => {
    const observed = Date.parse("2035-01-01T00:00:00.000Z");
    const clock = createV3ServerClock("2026-10-11T16:00:00.000Z", observed);

    expect(projectV3Deadline("2026-10-11T16:45:00.000Z", clock, observed).state).toBe(
      "immediate",
    );
    expect(projectV3Deadline("2026-10-11T18:00:00.000Z", clock, observed).state).toBe(
      "soon",
    );
    expect(projectV3Deadline("2026-10-11T22:00:00.000Z", clock, observed).state).toBe(
      "today",
    );
    expect(projectV3Deadline("2026-10-13T16:00:00.000Z", clock, observed).state).toBe(
      "future",
    );
  });

  it("marks a deadline expired when authoritative server time has passed it", () => {
    const observed = 1_000_000;
    const clock = createV3ServerClock("2026-10-11T20:00:00.000Z", observed);
    expect(projectV3Deadline("2026-10-11T19:59:59.000Z", clock, observed).state).toBe(
      "expired",
    );
  });

  it("returns an explicit invalid state for malformed deadlines", () => {
    const clock = createV3ServerClock("2026-10-11T20:00:00.000Z", 1_000_000);
    expect(projectV3Deadline("not-a-deadline", clock, 1_000_000)).toMatchObject({
      deadlineMs: null,
      remainingMs: null,
      state: "invalid",
    });
  });

  it("formats both official and user-local contest times when they differ", () => {
    const formatted = formatV3ContestTime(
      "2026-10-11T18:00:00.000Z",
      "Europe/Helsinki",
      "America/New_York",
      "en-GB",
    );

    expect(formatted.sameZone).toBe(false);
    expect(formatted.official).not.toBe(formatted.user);
    expect(formatted.official.length).toBeGreaterThan(0);
    expect(formatted.user?.length).toBeGreaterThan(0);
  });

  it("does not duplicate local time when the user's zone is the official zone", () => {
    expect(
      formatV3ContestTime(
        "2026-10-11T18:00:00.000Z",
        "Europe/Helsinki",
        "Europe/Helsinki",
      ),
    ).toMatchObject({ sameZone: true, user: null });
  });

  it("uses precise mm:ss only near the end of a countdown", () => {
    expect(formatV3Countdown(9 * 60_000 + 42_000)).toBe("09:42");
    expect(formatV3Countdown(42 * 60_000)).toBe("42m");
    expect(formatV3Countdown(3 * 60 * 60_000 + 12 * 60_000)).toBe("3h 12m");
    expect(formatV3Countdown(26 * 60 * 60_000)).toBe("1d 2h");
    expect(formatV3Countdown(0)).toBe("Closed");
  });

  it("fails fast on malformed server timestamps", () => {
    expect(() => createV3ServerClock("sometime-ish", Date.now())).toThrow("serverTime");
  });
});
