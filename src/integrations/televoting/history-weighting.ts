export const DEFAULT_EDITION_DECAY = 0.88;
export const DEFAULT_LIFETIME_FLOOR = 0.15;
export const DEFAULT_RECENT_SHARE = 0.75;
export const DEFAULT_LIFETIME_SHARE = 0.25;

export function editionAge(currentEditionNumber: number | null | undefined, observedEditionNumber: number | null | undefined) {
  const current = Number(currentEditionNumber);
  const observed = Number(observedEditionNumber);
  if (!Number.isFinite(current) || !Number.isFinite(observed)) return 0;
  return Math.max(0, Math.trunc(current - observed));
}

export function recentEditionWeight(age: number, decay = DEFAULT_EDITION_DECAY) {
  const safeAge = Math.max(0, Number(age) || 0);
  const safeDecay = Math.max(0.01, Math.min(1, Number(decay) || DEFAULT_EDITION_DECAY));
  return Math.pow(safeDecay, safeAge);
}

export function lifetimeEditionWeight(
  age: number,
  decay = DEFAULT_EDITION_DECAY,
  floor = DEFAULT_LIFETIME_FLOOR,
) {
  const safeFloor = Math.max(0, Math.min(1, Number(floor) || 0));
  return Math.max(safeFloor, recentEditionWeight(age, decay));
}

export type WeightedValue = { value: number; weight: number };

export function weightedMean(values: WeightedValue[]) {
  const usable = values.filter((row) => Number.isFinite(row.value) && Number.isFinite(row.weight) && row.weight > 0);
  const totalWeight = usable.reduce((sum, row) => sum + row.weight, 0);
  return totalWeight > 0 ? usable.reduce((sum, row) => sum + row.value * row.weight, 0) / totalWeight : 0;
}

export function weightedVariance(values: WeightedValue[]) {
  const usable = values.filter((row) => Number.isFinite(row.value) && Number.isFinite(row.weight) && row.weight > 0);
  const totalWeight = usable.reduce((sum, row) => sum + row.weight, 0);
  if (totalWeight <= 0) return 0;
  const average = weightedMean(usable);
  return usable.reduce((sum, row) => sum + row.weight * (row.value - average) ** 2, 0) / totalWeight;
}

export function weightedSd(values: WeightedValue[]) {
  return Math.sqrt(Math.max(0, weightedVariance(values)));
}

export function effectiveHistoricalEvidence(weights: number[]) {
  return weights.reduce((sum, weight) => sum + Math.max(0, Number(weight) || 0), 0);
}

export function evidenceConfidence(effectiveEvidence: number, scale = 3) {
  const safeEvidence = Math.max(0, Number(effectiveEvidence) || 0);
  const safeScale = Math.max(0.1, Number(scale) || 3);
  return 1 - Math.exp(-safeEvidence / safeScale);
}

export function blendRecentAndLifetime(
  recent: number,
  lifetime: number,
  recentShare = DEFAULT_RECENT_SHARE,
  lifetimeShare = DEFAULT_LIFETIME_SHARE,
) {
  const recentWeight = Math.max(0, Number(recentShare) || 0);
  const lifetimeWeight = Math.max(0, Number(lifetimeShare) || 0);
  const total = recentWeight + lifetimeWeight;
  if (total <= 0) return 0;
  return (recent * recentWeight + lifetime * lifetimeWeight) / total;
}
