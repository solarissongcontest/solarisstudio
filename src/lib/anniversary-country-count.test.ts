import { describe, expect, it } from "vitest";

import { buildAnniversaryRecap } from "./anniversary";

describe("anniversary country headline", () => {
  it("counts custom contest entities as entries but not as countries", () => {
    const recap = buildAnniversaryRecap({
      anniversaryYear: 2026,
      editions: [
        {
          id: "edition",
          edition_number: 21,
          name: "SSC 21",
          year: 2026,
          event_date: "2026-06-14",
          slug: "ssc-21",
          description: null,
          host_country_id: null,
          host_city: null,
          logo: null,
          theme_id: null,
          status: "complete",
          published: true,
        },
      ] as any,
      shows: [],
      participants: [
        {
          id: "country-row",
          edition_id: "edition",
          show_id: null,
          country_id: "country-a",
          contest_entity_id: null,
          artist: null,
          song: null,
          running_order: null,
          semi_final: "",
          qualified: null,
          notes: null,
        },
        {
          id: "entity-row",
          edition_id: "edition",
          show_id: null,
          // useAllParticipants canonicalises a custom entity into country_id
          // while retaining contest_entity_id, so this mirrors runtime data.
          country_id: "entity-a",
          contest_entity_id: "entity-a",
          artist: null,
          song: null,
          running_order: null,
          semi_final: "",
          qualified: null,
          notes: null,
        },
      ],
      results: [],
      countries: [
        {
          id: "country-a",
          name: "Country A",
          native_name: null,
          short_code: "CTA",
          flag_image: null,
          region: "Test",
          accent_color: "#111111",
          description: null,
          first_participation: 1,
        },
      ],
    });

    expect(recap.entryCount).toBe(2);
    expect(recap.countryCount).toBe(1);
  });
});
