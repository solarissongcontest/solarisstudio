import { describe, expect, it } from "vitest";

import { clampFlagCrop } from "./flag-crop";

describe("canonical country flag crops", () => {
  it("accepts persisted Postgres NUMERIC values and preserves focal points", () => {
    expect(clampFlagCrop({ x: "73.00", y: "21.00", zoom: "1.25" } as unknown as Parameters<typeof clampFlagCrop>[0]))
      .toEqual({ x: 73, y: 21, zoom: 1.25 });
  });

  it("limits translation and uses one uniform zoom", () => {
    expect(clampFlagCrop({ x: -30, y: 130, zoom: 3 })).toEqual({ x: 0, y: 100, zoom: 2 });
    expect(clampFlagCrop({ x: Number.NaN, y: Number.NaN, zoom: Number.NaN })).toEqual({ x: 50, y: 50, zoom: 1 });
  });
});
