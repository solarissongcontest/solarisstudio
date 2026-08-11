import { describe, expect, it } from "vitest";

import { buildCountryCharacter, buildCountryFunFacts } from "./country-wiki";

const country = {
  id: "country-1",
  name: "Asteria",
  native_name: "Asteria",
  short_code: "AST",
  flag_image: null,
  accent_color: "#334455",
  region: "North Terra Solaris",
  description: "A northern country.",
} as any;

const profile = {
  country_id: "country-1",
  capital: "Nova",
  government_type: "Kingdom",
  leader_name: "Mira",
  leader_title: "Queen",
  demonym: "Asterian",
  official_languages: "Asterian and Solari",
  currency: "Crown",
  motto: "Together toward tomorrow",
  population: "4.2 million",
  established: "1842",
  summary: "A maritime kingdom.",
  updated_at: "2026-08-11T00:00:00Z",
};

describe("country wiki generation", () => {
  it("derives character from government and voting history", () => {
    const character = buildCountryCharacter({
      country,
      profile,
      stats: { participations: 8, wins: 1 },
      form: { juryTelevoteLean: 14 },
      sections: [],
    });

    expect(character.tags).toContain("Monarchical");
    expect(character.tags).toContain("Jury-friendly");
    expect(character.tags).toContain("SSC veteran");
    expect(character.tags).toContain("Champion");
    expect(character.summary).toContain("Asteria is a kingdom");
  });

  it("creates fun facts only from known profile and contest information", () => {
    const facts = buildCountryFunFacts({
      country,
      profile,
      stats: { participations: 8, wins: 1, qualificationPct: 87 },
      form: { juryTelevoteLean: 14 },
      sections: [],
      mediaCount: 0,
    });

    expect(facts.some((fact) => fact.includes("Nova"))).toBe(true);
    expect(facts.some((fact) => fact.includes("Asterian"))).toBe(true);
    expect(facts.some((fact) => fact.includes("SSC-winning"))).toBe(true);
    expect(facts.some((fact) => fact.includes("jury support"))).toBe(true);
  });

  it("speaks about established country information as fact", () => {
    const character = buildCountryCharacter({
      country,
      profile,
      stats: { participations: 3, wins: 0 },
      form: { juryTelevoteLean: 0 },
      sections: [],
    });
    const facts = buildCountryFunFacts({
      country,
      profile,
      stats: { participations: 3, wins: 0, qualificationPct: 100 },
      form: { juryTelevoteLean: 0 },
      sections: [],
      mediaCount: 0,
    });

    const copy = [character.summary, ...facts].join(" ").toLowerCase();
    expect(copy).not.toContain("submitted");
    expect(copy).not.toContain("listed as");
    expect(copy).not.toContain("described as");
    expect(copy).not.toContain("presents itself as");
    expect(copy).toContain("nova is the capital of asteria");
    expect(copy).toContain("asteria is a kingdom led by queen mira");
  });

  it("does not invent profile facts when fields are empty", () => {
    const facts = buildCountryFunFacts({
      country,
      profile: null,
      stats: { participations: 0, wins: 0 },
      form: null,
      sections: [],
      mediaCount: 0,
    });

    expect(facts).toEqual([]);
  });
});
