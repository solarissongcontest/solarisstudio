import { describe, expect, it } from "vitest";

import type { Country } from "./data";
import { displayFromEntity, entityDisplayMap, type ContestEntityRow } from "./entities";

const country: Country = {
  id: "country-1",
  name: "Currentland",
  native_name: null,
  short_code: "CUR",
  flag_image: "current-flag.png",
  region: "Terra Solaris",
  accent_color: "#123456",
  description: null,
  first_participation: 1,
};

function entity(overrides: Partial<ContestEntityRow> = {}): ContestEntityRow {
  return {
    id: "entity-1",
    edition_id: "edition-1",
    entity_type: "global",
    country_id: country.id,
    display_name: country.name,
    abbreviation: country.short_code,
    flag_image: country.flag_image,
    region: country.region,
    historical_identity_override: false,
    ...overrides,
  };
}

describe("historical country identities", () => {
  it("changes only the edition display while keeping canonical voting identity", () => {
    const display = displayFromEntity(
      entity({
        display_name: "Oldland",
        flag_image: "old-flag.png",
        historical_identity_override: true,
      }),
      new Map([[country.id, country]]),
    );

    expect(display.name).toBe("Oldland");
    expect(display.flag_image).toBe("old-flag.png");
    expect(display.id).toBe(country.id);
    expect(display.countryId).toBe(country.id);
    expect(display.short_code).toBe(country.short_code);
  });

  it("keeps ordinary edition entities synced to the current country identity", () => {
    const display = displayFromEntity(
      entity({ display_name: "Stale snapshot", flag_image: "stale.png" }),
      new Map([[country.id, country]]),
    );

    expect(display.name).toBe(country.name);
    expect(display.flag_image).toBe(country.flag_image);
  });

  it("does not let one historical edition alias leak into archive-wide country lookups", () => {
    const displayMap = entityDisplayMap(
      [
        entity({
          id: "historical-entity",
          edition_id: "edition-1",
          display_name: "Oldland",
          flag_image: "old-flag.png",
          historical_identity_override: true,
        }),
        entity({ id: "current-entity", edition_id: "edition-2" }),
      ],
      [country],
    );

    expect(displayMap.get(country.id)?.name).toBe(country.name);
    expect(displayMap.get("historical-entity")?.name).toBe("Oldland");
  });

  it("uses the historical identity on a single edition scoreboard", () => {
    const displayMap = entityDisplayMap(
      [
        entity({
          id: "historical-entity",
          edition_id: "edition-1",
          display_name: "Oldland",
          flag_image: "old-flag.png",
          historical_identity_override: true,
        }),
      ],
      [country],
    );

    expect(displayMap.get(country.id)?.name).toBe("Oldland");
    expect(displayMap.get(country.id)?.flag_image).toBe("old-flag.png");
  });
});
