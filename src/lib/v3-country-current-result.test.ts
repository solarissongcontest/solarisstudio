import { describe, expect, it } from "vitest";
import type { CountryIdentityModel } from "./country-semantic-model";
import {
  buildV3CountryExploreProjection,
  type V3CountryCurrentResult,
} from "./v3-explore-entities";

const country: CountryIdentityModel = {
  code: "OLA",
  name: "Oland",
  nativeName: "Oland",
  region: "North",
  description: null,
  flag: { src: null, alt: "Flag of Oland", aspectRatio: 1.5 },
  colors: { primary: null, accent: null },
  facts: [],
  statistics: [],
  currentEntry: null,
  history: [],
  geography: null,
  actions: {},
};

const currentResult: V3CountryCurrentResult = {
  editionId: "edition-22",
  editionLabel: "SSC 22 · Hanvør",
  editionHref: "/editions/ssc-22",
  showId: "final-22",
  showName: "Grand Final",
  showHref: "/shows/final-22?from=results",
  rank: 3,
  points: 247,
  juryPoints: 121,
  televotePoints: null,
};

describe("V3 Country current result projection", () => {
  it("defaults to no current result when no canonical Results context is supplied", () => {
    const projection = buildV3CountryExploreProjection(country);
    expect(projection.currentResult).toBeNull();
  });

  it("preserves only the supplied publication-safe result summary", () => {
    const projection = buildV3CountryExploreProjection(
      country,
      new Map([["edition-22", "/editions/ssc-22"]]),
      currentResult,
    );

    expect(projection.currentResult).toEqual(currentResult);
    expect(projection.currentResult?.televotePoints).toBeNull();
  });
});
