import type { ResultRow } from "./data";

export type PredictionType =
  | "winner"
  | "top_three"
  | "top_ten"
  | "qualifier"
  | "jury_winner"
  | "televote_winner"
  | "full_ranking";

export type PredictionItem = {
  countryId: string;
  type: PredictionType;
  rank?: number | null;
  confidence?: number | null;
};

export type PredictionScore = {
  total: number;
  qualifierScore: number | null;
  headlineScore: number | null;
  rankingScore: number | null;
  confidenceScore: number | null;
  explanation: string[];
  scoringVersion: "v1";
};

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

function actualCountryAtRank(results: ResultRow[], rank: number) {
  return results.find((result) => result.final_rank === rank)?.country_id ?? null;
}

function pointWinners(results: ResultRow[], field: "jury_points" | "televote_points") {
  const best = Math.max(...results.map((result) => result[field]));
  return new Set(
    results.filter((result) => result[field] === best).map((result) => result.country_id),
  );
}

export function qualifierAccuracy(predicted: string[], actual: string[]) {
  const predictedSet = new Set(predicted);
  const actualSet = new Set(actual);
  const hits = [...predictedSet].filter((id) => actualSet.has(id)).length;
  const precision = predictedSet.size ? hits / predictedSet.size : 0;
  const recall = actualSet.size ? hits / actualSet.size : 0;
  return precision + recall ? (2 * precision * recall * 100) / (precision + recall) : 0;
}

export function rankingAccuracy(predicted: string[], actual: string[]) {
  const actualPosition = new Map(actual.map((id, index) => [id, index + 1]));
  const common = predicted.filter((id) => actualPosition.has(id));
  const size = Math.max(predicted.length, actual.length);
  if (size < 2 || !common.length) return common.length ? 100 : 0;

  const missingPosition = size + 1;
  const distance = predicted.reduce(
    (total, id, index) => total + Math.abs(index + 1 - (actualPosition.get(id) ?? missingPosition)),
    0,
  );
  const maxDistance = Math.floor((size * size) / 2);
  return clamp((1 - distance / Math.max(1, maxDistance)) * 100);
}

export function brierAccuracy(predictions: Array<{ confidence: number; happened: boolean }>) {
  if (!predictions.length) return null;
  const meanError =
    predictions.reduce(
      (total, prediction) =>
        total + (clamp(prediction.confidence, 0, 1) - (prediction.happened ? 1 : 0)) ** 2,
      0,
    ) / predictions.length;
  return clamp((1 - meanError) * 100);
}

export function scorePrediction(
  items: PredictionItem[],
  results: ResultRow[],
  qualifiedCountryIds: string[] = [],
): PredictionScore {
  const rankedResults = results
    .filter((result) => result.final_rank != null)
    .sort((a, b) => (a.final_rank ?? 999) - (b.final_rank ?? 999));
  const actualRanking = rankedResults.map((result) => result.country_id);

  const qualifierItems = items.filter((item) => item.type === "qualifier");
  const qualifierScore = qualifierItems.length
    ? qualifierAccuracy(
        qualifierItems.map((item) => item.countryId),
        qualifiedCountryIds,
      )
    : null;

  const headlineWeights: Record<
    Extract<PredictionType, "winner" | "jury_winner" | "televote_winner">,
    number
  > = {
    winner: 1,
    jury_winner: 0.75,
    televote_winner: 0.75,
  };
  const headlineItems = items.filter(
    (
      item,
    ): item is PredictionItem & {
      type: keyof typeof headlineWeights;
    } => item.type in headlineWeights,
  );
  const juryWinners = pointWinners(rankedResults, "jury_points");
  const televoteWinners = pointWinners(rankedResults, "televote_points");
  const headlineHits = headlineItems.reduce((total, item) => {
    const hit =
      item.type === "winner"
        ? actualCountryAtRank(rankedResults, 1) === item.countryId
        : item.type === "jury_winner"
          ? juryWinners.has(item.countryId)
          : televoteWinners.has(item.countryId);
    return total + (hit ? headlineWeights[item.type] : 0);
  }, 0);
  const headlineWeight = headlineItems.reduce(
    (total, item) => total + headlineWeights[item.type],
    0,
  );
  const headlineScore = headlineWeight ? (headlineHits / headlineWeight) * 100 : null;

  const rankingType = (["full_ranking", "top_ten", "top_three"] as const).find((type) =>
    items.some((item) => item.type === type),
  );
  const rankingItems = items
    .filter((item) => item.type === rankingType && item.rank != null)
    .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
  const rankingScore = rankingItems.length
    ? rankingAccuracy(
        rankingItems.map((item) => item.countryId),
        actualRanking.slice(0, rankingItems.length),
      )
    : null;

  const confidencePredictions = items
    .filter((item) => item.confidence != null)
    .map((item) => ({
      confidence: clamp(item.confidence ?? 0, 0, 1),
      happened:
        item.type === "qualifier"
          ? qualifiedCountryIds.includes(item.countryId)
          : item.type === "winner"
            ? actualCountryAtRank(rankedResults, 1) === item.countryId
            : item.type === "jury_winner"
              ? juryWinners.has(item.countryId)
              : item.type === "televote_winner"
                ? televoteWinners.has(item.countryId)
                : item.rank != null
                  ? actualRanking[item.rank - 1] === item.countryId
                  : false,
    }));
  const confidenceScore = brierAccuracy(confidencePredictions);

  const components = [qualifierScore, headlineScore, rankingScore].filter(
    (score): score is number => score != null,
  );
  const base = components.length
    ? components.reduce((total, score) => total + score, 0) / components.length
    : 0;
  const total = clamp(confidenceScore == null ? base : base * 0.9 + confidenceScore * 0.1);

  const explanation: string[] = [];
  if (headlineScore === 100) explanation.push("You identified every headline winner.");
  if (qualifierScore != null) {
    explanation.push(`Qualifier accuracy: ${qualifierScore.toFixed(0)}%.`);
  }
  if (rankingScore != null) {
    explanation.push(`Ranking similarity: ${rankingScore.toFixed(0)}%.`);
  }

  return {
    total,
    qualifierScore,
    headlineScore,
    rankingScore,
    confidenceScore,
    explanation,
    scoringVersion: "v1",
  };
}
