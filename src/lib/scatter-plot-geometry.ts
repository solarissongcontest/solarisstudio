export type ScatterAxisBounds = { min: number; max: number };

/** Positive point scales retain a zero baseline; negative corrections stay visible. */
export function scatterAxisBounds(values: readonly number[]): ScatterAxisBounds {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return { min: 0, max: 1 };
  const min = Math.min(0, ...finite);
  const max = Math.max(0, ...finite);
  const span = Math.max(1, max - min);
  const padding = span * 0.06;
  return { min: min < 0 ? min - padding : 0, max: max + padding };
}

/** Mirrors the Recharts ZAxis visual area range of 70–280 px². */
export function scatterPointRadius(appearances: number, low: number, high: number): number {
  const ratio = high > low
    ? Math.min(1, Math.max(0, (appearances - low) / (high - low)))
    : 0.5;
  return Math.sqrt((70 + ratio * 210) / Math.PI);
}

export function scatterPlotCoordinate(
  value: number,
  domain: ScatterAxisBounds,
  origin: number,
  length: number,
  invert = false,
): number {
  const fraction = Math.min(1, Math.max(0, (value - domain.min) / (domain.max - domain.min || 1)));
  return origin + (invert ? 1 - fraction : fraction) * length;
}
