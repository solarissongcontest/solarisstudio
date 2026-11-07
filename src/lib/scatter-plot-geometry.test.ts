import { describe, expect, it } from "vitest";
import {
  scatterAxisBounds,
  scatterPlotCoordinate,
  scatterPointRadius,
} from "./scatter-plot-geometry";

describe("native Jury vs Televote scatter plot geometry", () => {
  it("keeps zero in positive domains and handles negatives or zero-only data", () => {
    expect(scatterAxisBounds([2, 5, 10]).min).toBe(0);
    expect(scatterAxisBounds([-2, 3]).min).toBeLessThan(-2);
    expect(scatterAxisBounds([0, 0]).max).toBeGreaterThan(0);
    expect(scatterAxisBounds([])).toEqual({ min: 0, max: 1 });
  });

  it("scales appearances to the existing 70–280 square-pixel dot-area range", () => {
    expect(scatterPointRadius(1, 1, 5)).toBeCloseTo(Math.sqrt(70 / Math.PI));
    expect(scatterPointRadius(5, 1, 5)).toBeCloseTo(Math.sqrt(280 / Math.PI));
    expect(scatterPointRadius(3, 1, 5)).toBeGreaterThan(scatterPointRadius(1, 1, 5));
    expect(Number.isFinite(scatterPointRadius(3, 3, 3))).toBe(true);
  });

  it("places points inside the plot bounds and reverses the vertical axis", () => {
    const bounds = { min: 0, max: 100 };
    expect(scatterPlotCoordinate(0, bounds, 60, 400)).toBe(60);
    expect(scatterPlotCoordinate(100, bounds, 60, 400)).toBe(460);
    expect(scatterPlotCoordinate(75, bounds, 10, 200, true)).toBe(60);
    expect(scatterPlotCoordinate(-200, bounds, 60, 400)).toBe(60);
    expect(scatterPlotCoordinate(200, bounds, 60, 400)).toBe(460);
  });
});
