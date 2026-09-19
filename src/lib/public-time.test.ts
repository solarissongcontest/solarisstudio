import { describe, expect, it } from "vitest";

import {
  formatEventWallTime,
  shouldShowLocalEventTime,
  SOLARIS_TIME_ZONE,
} from "./public-time";

describe("public event time", () => {
  it("uses Helsinki as the canonical Solaris timezone", () => {
    expect(SOLARIS_TIME_ZONE).toBe("Europe/Helsinki");
  });

  it("keeps the same instant understandable in another timezone", () => {
    const value = "2026-09-27T18:00:00.000Z";
    const helsinki = formatEventWallTime(value, {
      timeZone: "Europe/Helsinki",
      locale: "en-GB",
    });
    const london = formatEventWallTime(value, {
      timeZone: "Europe/London",
      locale: "en-GB",
    });

    expect(helsinki).not.toBe(london);
    expect(
      shouldShowLocalEventTime(
        value,
        "Europe/Helsinki",
        "Europe/London",
        "en-GB",
      ),
    ).toBe(true);
  });

  it("does not duplicate local time when it matches the canonical timezone", () => {
    expect(
      shouldShowLocalEventTime(
        "2026-09-27T18:00:00.000Z",
        "Europe/Helsinki",
        "Europe/Helsinki",
        "en-GB",
      ),
    ).toBe(false);
  });
});
