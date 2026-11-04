import { describe, expect, it } from "vitest";

import { formatSolarisStoryDate } from "./public-story-date";

describe("public Story chronology formatting", () => {
  it("uses Solaris time for a moment near a UTC midnight boundary", () => {
    // In Helsinki this already belongs to the next calendar day.
    expect(formatSolarisStoryDate("2026-11-03T23:30:00.000Z")).toBe("4 November 2026");
  });

  it("does not use the visitor's local timezone for a published moment", () => {
    const previous = process.env.TZ;
    try {
      process.env.TZ = "America/Los_Angeles";
      expect(formatSolarisStoryDate("2026-11-03T23:30:00.000Z")).toBe("4 November 2026");
      process.env.TZ = "Pacific/Auckland";
      expect(formatSolarisStoryDate("2026-11-03T23:30:00.000Z")).toBe("4 November 2026");
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });

  it("retains an invalid original value instead of fabricating a historical date", () => {
    expect(formatSolarisStoryDate("unparseable-date")).toBe("unparseable-date");
  });
});
