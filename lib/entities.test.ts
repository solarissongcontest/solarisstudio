import { describe, expect, it } from "vitest";
import {
  displayFromEntity,
  entityDisplayMap,
  entityKeyOf,
  isCustomEntity,
  isGlobalEntity,
  type ContestEntityRow,
} from "./entities";
import { matchVoterKey, type Country, type VoterOption } from "./data";

const country: Country = {
  id: "c1",
  name: "Aurelia",
  native_name: "Aurelië",
  short_code: "AUR",
  flag_image: "aur.png",
  region: "North",
  accent_color: "#ff0000",
  description: null,
  first_participation: 1,
};

const globalEntity: ContestEntityRow = {
  id: "e1",
  edition_id: "ed1",
  entity_type: "global",
  country_id: "c1",
  display_name: "Aurelia",
  abbreviation: "AUR",
  flag_image: null,
  region: null,
};

const customEntity: ContestEntityRow = {
  id: "e2",
  edition_id: "ed1",
  entity_type: "custom",
  country_id: null,
  display_name: "Novaria",
  abbreviation: "NVA",
  flag_image: "nva.png",
  region: "Outer Rim",
};

describe("contest entity identity", () => {
  it("classifies global and custom entities", () => {
    expect(isGlobalEntity(globalEntity)).toBe(true);
    expect(isCustomEntity(globalEntity)).toBe(false);
    expect(isCustomEntity(customEntity)).toBe(true);
    expect(isGlobalEntity(customEntity)).toBe(false);
  });

  it("prefers the entity id over the legacy country column", () => {
    expect(entityKeyOf({ contest_entity_id: "e2", country_id: null })).toBe("e2");
    expect(entityKeyOf({ contest_entity_id: "e1", country_id: "c1" })).toBe("e1");
    expect(entityKeyOf({ country_id: "c1" })).toBe("c1");
    expect(entityKeyOf({})).toBe("");
  });

  it("falls back to global country data for a global entity", () => {
    const d = displayFromEntity(globalEntity, new Map([["c1", country]]));
    expect(d.name).toBe("Aurelia");
    expect(d.flag_image).toBe("aur.png");
    expect(d.region).toBe("North");
    expect(d.countryId).toBe("c1");
  });

  it("uses the entity's own metadata for a custom nation", () => {
    const d = displayFromEntity(customEntity, new Map([["c1", country]]));
    expect(d.name).toBe("Novaria");
    expect(d.short_code).toBe("NVA");
    expect(d.flag_image).toBe("nva.png");
    expect(d.countryId).toBeNull();
    expect(d.entityType).toBe("custom");
  });

  it("indexes global entities by both entity id and country id", () => {
    const map = entityDisplayMap([globalEntity, customEntity], [country]);
    expect(map.get("e1")?.name).toBe("Aurelia");
    expect(map.get("c1")?.name).toBe("Aurelia");
    expect(map.get("e2")?.name).toBe("Novaria");
    // A custom nation must never be reachable through a global country key.
    expect(map.get("e2")?.countryId).toBeNull();
  });

  it("exposes the canonical contest key as the display id", () => {
    const map = entityDisplayMap([globalEntity, customEntity], [country]);
    // Global entities key on the country id — the same value stored rows normalise to.
    expect(map.get("e1")?.id).toBe("c1");
    expect(map.get("c1")?.id).toBe("c1");
    expect(map.get("e1")?.entityId).toBe("e1");
    // Custom nations have no country, so the entity id is the canonical key.
    expect(map.get("e2")?.id).toBe("e2");
  });

});

describe("matchVoterKey with custom nations", () => {
  const options: VoterOption[] = [
    {
      key: "c:c1",
      voterId: null,
      countryId: "c1",
      name: "Aurelia",
      short_code: "AUR",
      flag_image: null,
      accent_color: "#fff",
    },
    {
      key: "c:e2",
      voterId: null,
      countryId: "e2",
      name: "Novaria",
      short_code: "NVA",
      flag_image: null,
      accent_color: "#fff",
    },
  ];

  it("matches a custom nation's ballot through its entity id", () => {
    expect(matchVoterKey({ voter_entity_id: "e2", voter_country_id: null }, options)).toBe("c:e2");
  });

  it("still matches legacy country-only ballots", () => {
    expect(matchVoterKey({ voter_country_id: "c1" }, options)).toBe("c:c1");
  });
});
