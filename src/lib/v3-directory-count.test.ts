import { describe, expect, it } from "vitest";
import { directoryCountLabel } from "./v3-directory-count";

describe("V3 directory result count semantics", () => {
  it("distinguishes rendered page, filtered matches and complete available collection", () => {
    expect(directoryCountLabel({ available: 67, matches: 67, rendered: 24, noun: "countries" }))
      .toBe("Showing 24 of 67 matches · 67 countries total");
    expect(directoryCountLabel({ available: 67, matches: 6, rendered: 6, noun: "countries" }))
      .toBe("Showing 6 of 6 matches · 67 countries total");
  });

  it("keeps empty and category-constrained results explicit", () => {
    expect(directoryCountLabel({ available: 12, matches: 0, rendered: 0, noun: "tools" }))
      .toBe("Showing 0 of 0 matches · 12 tools total");
    expect(directoryCountLabel({ available: 12, matches: 4, rendered: 4, noun: "tools" }))
      .toBe("Showing 4 of 4 matches · 12 tools total");
  });
});
