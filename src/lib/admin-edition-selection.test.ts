import { describe, expect, it } from "vitest";

import { selectOrganizerEdition } from "./admin-edition-selection";

describe("Organizer edition selection", () => {
  const ssc17 = {
    id: "ssc17",
    edition_number: 17,
    hasCalculations: true,
  };
  const ssc22 = {
    id: "ssc22",
    edition_number: 22,
    hasCalculations: false,
  };

  it("keeps SSC22 selected even when SSC17 has calculations and SSC22 does not", () => {
    expect(selectOrganizerEdition([ssc17, ssc22], "ssc22")).toBe(ssc22);
  });

  it("does not silently choose another edition when the selected id is invalid", () => {
    expect(selectOrganizerEdition([ssc17, ssc22], "missing")).toBeNull();
  });

  it("does not invent an edition before Organizer has selected one", () => {
    expect(selectOrganizerEdition([ssc17, ssc22], null)).toBeNull();
  });
});
