import type { ResultRow } from './data';
import {
  compareRevealOrders,
  simulateResultsReveal,
  type RevealAward,
  type RevealBaseScore,
  type RevealSimulation,
} from './results-reveal-director';

export type RevealStrategy = 'jury_order' | 'final_rank_reverse' | 'televote_ascending';

export type ResultsRevealModel = {
  baseScores: RevealBaseScore[];
  strategies: Record<RevealStrategy, RevealAward[]>;
  simulations: Record<RevealStrategy, RevealSimulation>;
  recommendedStrategy: RevealStrategy | null;
};

function identity(row: ResultRow) {
  return row.contest_entity_id ?? row.country_id;
}

export function buildResultsRevealModel(rows: readonly ResultRow[]): ResultsRevealModel {
  const valid = rows
    .filter((row) => identity(row) && Number.isFinite(row.jury_points) && Number.isFinite(row.televote_points))
    .map((row) => ({ ...row, identity: identity(row) }));

  const baseScores: RevealBaseScore[] = valid.map((row) => ({
    countryId: row.identity,
    points: row.jury_points,
  }));

  const juryOrder = [...valid]
    .sort((a, b) => a.jury_points - b.jury_points || a.identity.localeCompare(b.identity))
    .map<RevealAward>((row) => ({ countryId: row.identity, points: row.televote_points }));

  const finalRankReverse = [...valid]
    .sort((a, b) => {
      const aRank = a.final_rank ?? Number.MAX_SAFE_INTEGER;
      const bRank = b.final_rank ?? Number.MAX_SAFE_INTEGER;
      return bRank - aRank || a.identity.localeCompare(b.identity);
    })
    .map<RevealAward>((row) => ({ countryId: row.identity, points: row.televote_points }));

  const televoteAscending = [...valid]
    .sort((a, b) => a.televote_points - b.televote_points || a.identity.localeCompare(b.identity))
    .map<RevealAward>((row) => ({ countryId: row.identity, points: row.televote_points }));

  const strategies: Record<RevealStrategy, RevealAward[]> = {
    jury_order: juryOrder,
    final_rank_reverse: finalRankReverse,
    televote_ascending: televoteAscending,
  };

  const simulations = compareRevealOrders(baseScores, strategies) as Record<RevealStrategy, RevealSimulation>;
  const ranked = (Object.entries(simulations) as [RevealStrategy, RevealSimulation][])
    .sort((a, b) => b[1].suspenseRatio - a[1].suspenseRatio || a[0].localeCompare(b[0]));

  return {
    baseScores,
    strategies,
    simulations,
    recommendedStrategy: ranked[0]?.[0] ?? null,
  };
}

export function simulateCustomRevealOrder(rows: readonly ResultRow[], countryIds: readonly string[]) {
  const byId = new Map(rows.map((row) => [identity(row), row]));
  const baseScores: RevealBaseScore[] = rows.map((row) => ({ countryId: identity(row), points: row.jury_points }));
  const revealOrder: RevealAward[] = countryIds.map((countryId) => {
    const row = byId.get(countryId);
    if (!row) throw new Error(`Unknown result identity in reveal order: ${countryId}`);
    return { countryId, points: row.televote_points };
  });
  return simulateResultsReveal(baseScores, revealOrder);
}
