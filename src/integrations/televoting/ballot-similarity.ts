export type SimilarityBallot = {
  voterId: string;
  allocations: Record<string, number>;
};

export type BallotSimilarityResult = {
  risk: number;
  strongestSimilarity: number;
  baselineMean: number;
  baselineSd: number;
  zScore: number;
  matchedVoterId: string | null;
  coordinationThreshold: number;
  matchedPeerCount: number;
  currentCoordinationEvidence: boolean;
};

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function vector(ballot: SimilarityBallot, participants: string[]) {
  return participants.map((code) => Math.max(0, Number(ballot.allocations[code] ?? 0)));
}

export function cosineSimilarity(a: number[], b: number[]) {
  const length = Math.max(a.length, b.length);
  let dot = 0;
  let a2 = 0;
  let b2 = 0;
  for (let index = 0; index < length; index += 1) {
    const av = Number(a[index] ?? 0);
    const bv = Number(b[index] ?? 0);
    dot += av * bv;
    a2 += av * av;
    b2 += bv * bv;
  }
  if (a2 <= 0 || b2 <= 0) return 0;
  return clamp(dot / Math.sqrt(a2 * b2));
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function sd(values: number[]) {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

function riskFromZ(z: number) {
  if (!Number.isFinite(z) || z <= 0) return 0;
  return 100 * (1 - Math.exp(-Math.min(6, z) / 1.8));
}

export function calculateBallotSimilarityRisk(options: {
  current: SimilarityBallot;
  others: SimilarityBallot[];
  participants: string[];
}): BallotSimilarityResult {
  const currentVector = vector(options.current, options.participants);
  const comparisons = options.others.map((ballot) => ({
    voterId: ballot.voterId,
    similarity: cosineSimilarity(currentVector, vector(ballot, options.participants)),
  }));
  const strongest = [...comparisons].sort((a, b) => b.similarity - a.similarity || a.voterId.localeCompare(b.voterId))[0];

  const baseline: number[] = [];
  for (let a = 0; a < options.others.length; a += 1) {
    for (let b = a + 1; b < options.others.length; b += 1) {
      baseline.push(cosineSimilarity(
        vector(options.others[a]!, options.participants),
        vector(options.others[b]!, options.participants),
      ));
    }
  }

  const baselineMean = baseline.length ? mean(baseline) : mean(comparisons.map((row) => row.similarity));
  const baselineSd = baseline.length >= 2 ? sd(baseline) : Math.max(0.08, sd(comparisons.map((row) => row.similarity)));
  const strongestSimilarity = strongest?.similarity ?? 0;
  const zScore = options.others.length >= 3
    ? Math.max(0, (strongestSimilarity - baselineMean) / Math.max(0.05, baselineSd))
    : 0;
  const evidenceFactor = Math.min(1, options.others.length / 6);
  const risk = clamp(riskFromZ(zScore) / 100 * evidenceFactor) * 100;

  // Treat an unusually similar ballot as coordination-grade evidence only when
  // the pattern is shared with more than one independent peer. This prevents a
  // single coincidentally similar ballot from becoming the decisive current-
  // coordination signal while keeping the raw similarity risk available for
  // lower-level review and historical corroboration.
  const coordinationThreshold = Math.min(0.98, Math.max(0.88, baselineMean + baselineSd * 1.5));
  const matchedPeerCount = comparisons.filter((row) => row.similarity >= coordinationThreshold).length;

  return {
    risk: Math.round(risk),
    strongestSimilarity,
    baselineMean,
    baselineSd,
    zScore,
    matchedVoterId: strongest?.voterId ?? null,
    coordinationThreshold,
    matchedPeerCount,
    currentCoordinationEvidence:
      risk >= 90 && strongestSimilarity >= 0.95 && options.others.length >= 5 && matchedPeerCount >= 2,
  };
}
