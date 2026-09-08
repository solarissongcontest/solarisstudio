import { describe, expect, it } from "vitest";

import { buildAnniversaryRecap } from "./anniversary";

const edition = (id: string, number: number, eventDate: string | null) => ({
  id,
  edition_number: number,
  name: `SSC ${number}`,
  year: eventDate ? Number(eventDate.slice(0, 4)) : null,
  slug: `ssc-${number}`,
  description: null,
  host_country_id: null,
  host_city: null,
  logo: null,
  theme_id: null,
  status: "completed",
  published: true,
  event_date: eventDate,
});

describe("anniversary recap exact edition dates", () => {
  it("includes the previous anniversary through the day before the current anniversary", () => {
    const recap = buildAnniversaryRecap({
      anniversaryYear: 2026,
      editions: [
        edition("previous-day", 17, "2025-09-16"),
        edition("previous-anniversary", 18, "2025-09-17"),
        edition("inside", 19, "2025-09-18"),
        edition("middle", 20, "2026-05-01"),
        edition("current-anniversary", 21, "2026-09-17"),
        edition("after", 22, "2026-09-18"),
      ] as any,
      shows: [],
      participants: [],
      results: [],
      countries: [],
    });

    expect(recap.editionCount).toBe(3);
    expect(recap.periodStart).toBe("2025-09-17");
    expect(recap.periodEndExclusive).toBe("2026-09-17");
  });

  it("does not guess from year or edition number when event_date is missing", () => {
    const recap = buildAnniversaryRecap({
      anniversaryYear: 2026,
      editions: [edition("undated", 99, null)] as any,
      shows: [],
      participants: [],
      results: [],
      countries: [],
    });

    expect(recap.editionCount).toBe(0);
    expect(recap.undatedPublishedEditionCount).toBe(1);
    expect(recap.stories[0]?.headline).toContain("dates are still being completed");
  });
});
