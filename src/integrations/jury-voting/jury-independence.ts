export const JURY_INDEPENDENCE_MODEL_VERSION = "jury-integrity-model-v5";

export type JuryIndependenceBallot = {
  voterId: string;
  allocations: Record<string, number>;
};

export type JuryDeviationTarget = {
  targetId: string;
  score: number;
  normalizedScore: number;
  expectedNormalizedScore: number;
  peerSd: number;
  positiveDeviation: number;
  zScore: number;
  risk: number;
};

export type JuryIndependenceResult = {
  risk: number;
  confidence: number;
  independenceScore: number;
  peerBallots: number;
  strongDeviationEvidence: boolean;
  targets: JuryDeviationTarget[];
};

export type JuryEvidenceGatesInput = {
  baseRisk: number;
  baseConfidence: number;
  relationshipRisk: number;
  deviation: JuryIndependenceResult;
  reasonCategories: string[];
  historicalEditions: number;
  crossChannelEditions: number;
  similarityRisk: number;
};

export type JuryEvidenceGatesResult = {
  risk: number;
  confidence: number;
  independenceScore: number;
  evidenceFamilies: string[];
  strongCurrentCoordinationEvidence: boolean;
};

const clamp = (value: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
const clamp01 = (value: number) => clamp(value, 0, 1);

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function sd(values: number[]) {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

function normalizedAllocations(ballot: JuryIndependenceBallot) {
  const max = Math.max(0, ...Object.values(ballot.allocations).map((value) => Number(value) || 0));
  if (max <= 0) return new Map<string, number>();
  return new Map(
    Object.entries(ballot.allocations).map(([targetId, value]) => [targetId, clamp01((Number(value) || 0) / max)]),
  );
}

function deviationRisk(positiveDeviation: number, zScore: number, normalizedScore: number) {
  if (positiveDeviation <= 0 || normalizedScore <= 0) return 0;
  const magnitude = 100 * (1 - Math.exp(-Math.max(0, positiveDeviation) * 3.4));
  const unusualness = 100 * (1 - Math.exp(-Math.max(0, zScore - 0.75) / 1.8));
  const maximumBonus = normalizedScore >= 0.99 ? 8 : normalizedScore >= 0.8 ? 4 : 0;
  return clamp(magnitude * 0.62 + unusualness * 0.38 + maximumBonus);
}

/**
 * Compares a jury ballot with the other already-submitted independent juries
 * in the same show. A large positive deviation is evidence, not proof. Missing
 * peer scores are treated as zero because jury point scales only store awarded
 * points.
 */
export function calculateJuryPeerDeviation(options: {
  current: JuryIndependenceBallot;
  others: JuryIndependenceBallot[];
  targetIds?: string[];
}): JuryIndependenceResult {
  const current = normalizedAllocations(options.current);
  const peers = options.others.map(normalizedAllocations);
  const targetIds = options.targetIds?.length
    ? [...new Set(options.targetIds)]
    : [...new Set([...current.keys(), ...peers.flatMap((ballot) => [...ballot.keys()])])];

  const targets = targetIds
    .map((targetId): JuryDeviationTarget => {
      const normalizedScore = current.get(targetId) ?? 0;
      const peerScores = peers.map((ballot) => ballot.get(targetId) ?? 0);
      const expectedNormalizedScore = mean(peerScores);
      const peerSd = sd(peerScores);
      const positiveDeviation = Math.max(0, normalizedScore - expectedNormalizedScore);
      const denominator = Math.max(0.12, peerSd);
      const zScore = positiveDeviation / denominator;
      return {
        targetId,
        score: Number(options.current.allocations[targetId] ?? 0),
        normalizedScore,
        expectedNormalizedScore,
        peerSd,
        positiveDeviation,
        zScore,
        risk: deviationRisk(positiveDeviation, zScore, normalizedScore),
      };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.risk - a.risk || b.positiveDeviation - a.positiveDeviation);

  const top = targets[0]?.risk ?? 0;
  const second = targets[1]?.risk ?? 0;
  const third = targets[2]?.risk ?? 0;
  const risk = clamp(top * 0.76 + second * 0.16 + third * 0.08);
  const peerBallots = options.others.length;
  const coverageConfidence = peerBallots <= 1 ? 0 : Math.min(100, 18 + peerBallots * 8);
  const confidence = clamp(coverageConfidence);

  return {
    risk: Math.round(risk),
    confidence: Math.round(confidence),
    independenceScore: Math.round(100 - risk),
    peerBallots,
    strongDeviationEvidence: peerBallots >= 4 && risk >= 70,
    targets,
  };
}

/**
 * Jury evidence gates intentionally prevent one strange 12-point score from
 * becoming a misconduct-grade risk by itself. High scores require multiple
 * evidence families and repeated history, unless current coordination evidence
 * is exceptionally strong.
 */
export function applyJuryEvidenceGates(input: JuryEvidenceGatesInput): JuryEvidenceGatesResult {
  const evidenceFamilies = new Set<string>();
  if (input.relationshipRisk >= 30) evidenceFamilies.add("historical_relationship");
  if (input.deviation.risk >= 45) evidenceFamilies.add("peer_deviation");
  if (input.reasonCategories.includes("reciprocal_pattern")) evidenceFamilies.add("reciprocity");
  if (input.reasonCategories.includes("unusual_similarity") || input.similarityRisk >= 45) evidenceFamilies.add("ballot_similarity");
  if (input.reasonCategories.includes("persistent_recent_pattern")) evidenceFamilies.add("continuity");
  if (input.crossChannelEditions > 0) evidenceFamilies.add("cross_channel");

  const strongCurrentCoordinationEvidence =
    input.deviation.strongDeviationEvidence &&
    (input.similarityRisk >= 60 || input.reasonCategories.includes("reciprocal_pattern"));

  const rawRisk = clamp(Math.max(
    input.baseRisk,
    input.baseRisk * 0.66 + input.deviation.risk * 0.54,
  ));
  let risk = rawRisk;

  if (evidenceFamilies.size < 2) risk = Math.min(risk, 49);

  const enoughHistoryForStrong = input.historicalEditions >= 3;
  if (risk >= 65 && !enoughHistoryForStrong && !strongCurrentCoordinationEvidence) {
    risk = Math.min(risk, 64);
  }

  const enoughHistoryForHigh = input.historicalEditions >= 2 && evidenceFamilies.size >= 3;
  if (risk >= 80 && !enoughHistoryForHigh && !strongCurrentCoordinationEvidence) {
    risk = Math.min(risk, 79);
  }

  if (risk >= 90 && !(evidenceFamilies.size >= 3 && input.historicalEditions >= 3 && strongCurrentCoordinationEvidence)) {
    risk = Math.min(risk, 89);
  }

  const alignedConfidence = input.deviation.risk >= 45 && input.relationshipRisk >= 30
    ? Math.min(100, Math.max(input.baseConfidence, input.deviation.confidence) + 8)
    : Math.max(input.baseConfidence, Math.round(input.deviation.confidence * 0.75));

  return {
    risk: Math.round(clamp(risk)),
    confidence: Math.round(clamp(alignedConfidence)),
    independenceScore: Math.round(100 - clamp(risk)),
    evidenceFamilies: [...evidenceFamilies],
    strongCurrentCoordinationEvidence,
  };
}

export function resolveJuryIntervention(input: {
  risk: number;
  confidence: number;
  strongCurrentCoordinationEvidence: boolean;
}) {
  const risk = clamp(input.risk);
  const confidence = clamp(input.confidence);
  if (risk >= 90 && confidence >= 75 && input.strongCurrentCoordinationEvidence) return "provisional_review" as const;
  if (risk >= 80 && confidence >= 60) return "enhanced_declaration" as const;
  if (risk >= 65 && confidence >= 40) return "declaration" as const;
  if (risk >= 50) return "review" as const;
  if (risk >= 30) return "notice" as const;
  return "none" as const;
}

export function jurySeverity(risk: number) {
  if (risk >= 90) return "critical" as const;
  if (risk >= 80) return "high" as const;
  if (risk >= 65) return "strong" as const;
  if (risk >= 50) return "review" as const;
  if (risk >= 30) return "notable" as const;
  return "none" as const;
}
