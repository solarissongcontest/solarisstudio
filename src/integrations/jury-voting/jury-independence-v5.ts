import { cosineSimilarity } from "@/integrations/televoting/ballot-similarity";

export const JURY_INDEPENDENCE_MODEL_VERSION = "jury-independence-v5";

export type JuryCurrentAllocation = {
  targetCode: string;
  score: number;
  maxScore: number;
};

export type JuryPeerBallot = {
  voterId: string;
  maxScore: number;
  allocations: Record<string, number>;
};

export type JuryDeviationTarget = {
  targetCode: string;
  currentNormalized: number;
  expectedNormalized: number;
  peerSd: number;
  deviation: number;
  zScore: number;
  risk: number;
  peerCount: number;
};

export type JuryDeviationResult = {
  risk: number;
  strongestTarget: string | null;
  targets: JuryDeviationTarget[];
  peerBallots: number;
};

export type JuryCoordinationFingerprint = {
  risk: number;
  matchedPeers: number;
  strongestSimilarity: number;
  baselineMean: number;
  baselineSd: number;
  threshold: number;
};

export type JuryEvidenceComponents = {
  history: number;
  deviation: number;
  reciprocity: number;
  coordination: number;
  network: number;
  crossChannel: number;
  persistence: number;
};

export type JuryIndependenceAggregateInput = {
  components: JuryEvidenceComponents;
  baseConfidence: number;
  peerBallots: number;
  deviationTargets: number;
  repeatedHistory: boolean;
};

export type JuryIndependenceAggregate = {
  risk: number;
  confidence: number;
  independenceScore: number;
  evidenceFamilyCount: number;
  strongEvidenceFamilies: string[];
  repeatedHistory: boolean;
  currentCoordinationEvidence: boolean;
  interventionLevel:
    | "none"
    | "notice"
    | "review"
    | "declaration"
    | "enhanced_declaration"
    | "provisional_review";
  recommendedSanctionLevel: 0 | 1 | 2 | 3 | 4 | 5;
};

const clamp = (value: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
const clamp01 = (value: number) => clamp(value, 0, 1);
const mean = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const sd = (values: number[]) => {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
};
const round = (value: number, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

function normalized(score: number, maxScore: number) {
  if (!Number.isFinite(maxScore) || maxScore <= 0) return 0;
  return clamp01((Number(score) || 0) / maxScore);
}

function zRisk(zScore: number) {
  if (!Number.isFinite(zScore) || zScore <= 0) return 0;
  return 100 * (1 - Math.exp(-Math.min(6, zScore) / 1.8));
}

export function calculateJuryDeviationRisk(options: {
  current: JuryCurrentAllocation[];
  peers: JuryPeerBallot[];
}): JuryDeviationResult {
  const evidenceFactor = Math.min(1, options.peers.length / 6);
  const targets = options.current
    .filter((row) => row.score > 0)
    .map((row): JuryDeviationTarget => {
      const currentNormalized = normalized(row.score, row.maxScore);
      const peerValues = options.peers.map((peer) =>
        normalized(peer.allocations[row.targetCode] ?? 0, peer.maxScore),
      );
      const expectedNormalized = mean(peerValues);
      const peerSd = sd(peerValues);
      const deviation = Math.max(0, currentNormalized - expectedNormalized);
      const zScore = options.peers.length >= 3
        ? deviation / Math.max(0.12, peerSd)
        : 0;
      const magnitudeRisk = clamp((deviation / 0.75) * 100);
      const popularityDampener = expectedNormalized >= 0.6
        ? 0.72
        : expectedNormalized >= 0.4
          ? 0.86
          : 1;
      const risk = clamp(
        (0.6 * zRisk(zScore) + 0.4 * magnitudeRisk) * evidenceFactor * popularityDampener,
      );
      return {
        targetCode: row.targetCode,
        currentNormalized: round(currentNormalized, 4),
        expectedNormalized: round(expectedNormalized, 4),
        peerSd: round(peerSd, 4),
        deviation: round(deviation, 4),
        zScore: round(zScore, 3),
        risk: Math.round(risk),
        peerCount: options.peers.length,
      };
    })
    .sort((a, b) => b.risk - a.risk || b.deviation - a.deviation || a.targetCode.localeCompare(b.targetCode));

  return {
    risk: targets[0]?.risk ?? 0,
    strongestTarget: targets[0]?.targetCode ?? null,
    targets,
    peerBallots: options.peers.length,
  };
}

export function calculateJuryCoordinationFingerprint(options: {
  current: JuryPeerBallot;
  peers: JuryPeerBallot[];
  participants: string[];
}): JuryCoordinationFingerprint {
  const vector = (ballot: JuryPeerBallot) =>
    options.participants.map((code) => Math.max(0, Number(ballot.allocations[code] ?? 0)));
  const currentVector = vector(options.current);
  const similarities = options.peers.map((peer) =>
    cosineSimilarity(currentVector, vector(peer)),
  );
  const baseline: number[] = [];
  for (let first = 0; first < options.peers.length; first += 1) {
    for (let second = first + 1; second < options.peers.length; second += 1) {
      baseline.push(cosineSimilarity(vector(options.peers[first]!), vector(options.peers[second]!)));
    }
  }
  const baselineMean = baseline.length ? mean(baseline) : mean(similarities);
  const baselineSd = baseline.length >= 2 ? sd(baseline) : Math.max(0.08, sd(similarities));
  const threshold = Math.min(0.98, Math.max(0.88, baselineMean + 1.5 * Math.max(0.05, baselineSd)));
  const matchedPeers = similarities.filter((value) => value >= threshold).length;
  const strongestSimilarity = Math.max(0, ...similarities);
  const evidenceFactor = Math.min(1, options.peers.length / 6);
  const excess = Math.max(0, strongestSimilarity - threshold);
  const risk = matchedPeers >= 2
    ? clamp((42 + matchedPeers * 12 + excess * 120) * evidenceFactor)
    : 0;

  return {
    risk: Math.round(risk),
    matchedPeers,
    strongestSimilarity: round(strongestSimilarity, 4),
    baselineMean: round(baselineMean, 4),
    baselineSd: round(baselineSd, 4),
    threshold: round(threshold, 4),
  };
}

export function resolveJuryIntegrityIntervention(options: {
  risk: number;
  confidence: number;
  evidenceFamilyCount: number;
  repeatedHistory: boolean;
  currentCoordinationEvidence: boolean;
}) {
  const risk = clamp(options.risk);
  const confidence = clamp(options.confidence);
  if (
    risk >= 90 &&
    confidence >= 75 &&
    options.evidenceFamilyCount >= 4 &&
    options.repeatedHistory &&
    options.currentCoordinationEvidence
  ) return "provisional_review" as const;
  if (risk >= 80 && confidence >= 55 && options.evidenceFamilyCount >= 3) {
    return "enhanced_declaration" as const;
  }
  if (risk >= 65 && confidence >= 40) return "declaration" as const;
  if (risk >= 50) return "review" as const;
  if (risk >= 30) return "notice" as const;
  return "none" as const;
}

export function aggregateJuryIndependenceRisk(
  input: JuryIndependenceAggregateInput,
): JuryIndependenceAggregate {
  const components: JuryEvidenceComponents = {
    history: clamp(input.components.history),
    deviation: clamp(input.components.deviation),
    reciprocity: clamp(input.components.reciprocity),
    coordination: clamp(input.components.coordination),
    network: clamp(input.components.network),
    crossChannel: clamp(input.components.crossChannel),
    persistence: clamp(input.components.persistence),
  };
  const weights: Array<[keyof JuryEvidenceComponents, number]> = [
    ["history", 0.30],
    ["deviation", 0.30],
    ["reciprocity", 0.15],
    ["coordination", 0.10],
    ["network", 0.05],
    ["crossChannel", 0.05],
    ["persistence", 0.05],
  ];
  const rawRisk = weights.reduce((sum, [key, weight]) => sum + components[key] * weight, 0);
  const strongEvidenceFamilies = (Object.entries(components) as Array<[keyof JuryEvidenceComponents, number]>)
    .filter(([, value]) => value >= 45)
    .map(([key]) => key);
  const evidenceFamilyCount = strongEvidenceFamilies.length;
  const currentCoordinationEvidence =
    components.coordination >= 80 || components.network >= 80 || components.reciprocity >= 85;

  let gatedRisk = rawRisk;
  if (gatedRisk > 49 && evidenceFamilyCount < 2) gatedRisk = 49;
  if (gatedRisk > 64 && !(input.repeatedHistory || currentCoordinationEvidence)) gatedRisk = 64;
  if (gatedRisk > 79 && !(evidenceFamilyCount >= 3 && input.repeatedHistory)) gatedRisk = 79;
  if (
    gatedRisk > 89 &&
    !(evidenceFamilyCount >= 4 && input.repeatedHistory && currentCoordinationEvidence)
  ) gatedRisk = 89;

  const comparisonConfidence = clamp(
    input.peerBallots * 8 + Math.min(20, input.deviationTargets * 3),
  );
  const confidence = Math.round(
    clamp(input.baseConfidence) * 0.7 + comparisonConfidence * 0.3,
  );
  const risk = Math.round(clamp(gatedRisk));
  const interventionLevel = resolveJuryIntegrityIntervention({
    risk,
    confidence,
    evidenceFamilyCount,
    repeatedHistory: input.repeatedHistory,
    currentCoordinationEvidence,
  });
  const recommendedSanctionLevel: 0 | 1 | 2 | 3 | 4 | 5 =
    risk >= 90 && confidence >= 75 && input.repeatedHistory
      ? 5
      : risk >= 80
        ? 4
        : risk >= 65
          ? 3
          : risk >= 50
            ? 2
            : risk >= 30
              ? 1
              : 0;

  return {
    risk,
    confidence,
    independenceScore: 100 - risk,
    evidenceFamilyCount,
    strongEvidenceFamilies,
    repeatedHistory: input.repeatedHistory,
    currentCoordinationEvidence,
    interventionLevel,
    recommendedSanctionLevel,
  };
}
