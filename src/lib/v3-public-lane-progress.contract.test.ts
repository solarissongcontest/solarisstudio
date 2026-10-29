import { describe, expect, it } from "vitest";

import { projectV3Participate } from "./v3-participate";

describe("Public lane progress smoke", () => {
  it("keeps an empty canonical Participate projection calm", () => {
    const projection = projectV3Participate({ actions: [], journey: [] });
    expect(projection.focus).toEqual({ state: "clear", action: null });
    expect(projection.optionalNow).toEqual([]);
    expect(projection.completed).toEqual([]);
  });
});
