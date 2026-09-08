import { describe, expect, it } from "vitest";

import { getSolarisAnniversarySeason } from "./anniversary";

describe("Solaris anniversary season", () => {
  it("opens the countdown two weeks before 17 September", () => {
    const season = getSolarisAnniversarySeason(new Date("2026-09-03T12:00:00Z"));
    expect(season.phase).toBe("countdown");
    expect(season.daysUntil).toBe(14);
    expect(season.age).toBe(4);
  });

  it("keeps the countdown active through the final three days", () => {
    const season = getSolarisAnniversarySeason(new Date("2026-09-14T12:00:00Z"));
    expect(season.phase).toBe("countdown");
    expect(season.daysUntil).toBe(3);
  });

  it("does not start the countdown too early", () => {
    expect(getSolarisAnniversarySeason(new Date("2026-09-02T12:00:00Z")).phase).toBe("dormant");
  });

  it("switches to active Anniversary Day on 17 September", () => {
    const season = getSolarisAnniversarySeason(new Date("2026-09-17T12:00:00Z"));
    expect(season.phase).toBe("active");
    expect(season.active).toBe(true);
    expect(season.daysUntil).toBe(0);
  });

  it("keeps a three-day afterglow before returning to normal", () => {
    expect(getSolarisAnniversarySeason(new Date("2026-09-18T12:00:00Z")).phase).toBe("after");
    expect(getSolarisAnniversarySeason(new Date("2026-09-20T12:00:00Z")).phase).toBe("after");
    expect(getSolarisAnniversarySeason(new Date("2026-09-21T12:00:00Z")).phase).toBe("dormant");
  });
});
