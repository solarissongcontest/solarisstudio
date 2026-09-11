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

const STRATEGY_PREFERENCE: RevealStrategy[] = [
  'jury_order',
  'final_rank_reverse',
  'televote_ascending',
];

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

  // Eurovision-style televote reveal: lowest jury score first, highest jury
  // score last. This is the operational default when suspense is tied.
  const juryOrder = [...valid]
    .sort((a, b) => a.jury_points - b.jury_points || a.identity.localeCompare(b.identity))
    .map<RevealAward>((row) => ({ countryId: row.identity, points: row.televote_points }));

  // Retrospective forensic comparison: reveal the worst final placing first.
  // Unranked rows belong after ranked rows rather than being promoted to the
  // front by a Number.MAX_SAFE_INTEGER sentinel.
  const finalRankReverse = [...valid]
    .sort((a, b) => {
      if (a.final_rank == null && b.final_rank == null) return a.identity.localeCompare(b.identity);
      if (a.final_rank == null) return 1;
      if (b.final_rank == null) return -1;
      return b.final_rank - a.final_rank || a.identity.localeCompare(b.identity);
    })
    .map<RevealAward>((row) => ({ countryId: row.identity, points: row.televote_points }));

  // Forensic comparison only: requires knowing the hidden televote result.
  const televoteAscending = [...valid]
    .sort((a, b) => a.televote_points - b.televote_points || a.identity.localeCompare(b.identity))
    .map<RevealAward>((row) => ({ countryId: row.identity, points: row.televote_points }));

  const strategies: Record<RevealStrategy, RevealAward[]> = {
    jury_order: juryOrder,
    final_rank_reverse: finalRankReverse,
    televote_ascending: televoteAscending,
  };

  const simulations = compareRevealOrders(baseScores, strategies) as Record<RevealStrategy, RevealSimulation>;
  const preference = new Map(STRATEGY_PREFERENCE.map((strategy, index) => [strategy, index]));
  const ranked = (Object.entries(simulations) as [RevealStrategy, RevealSimulation][])
    .sort((a, b) => {
      const suspense = b[1].suspenseRatio - a[1].suspenseRatio;
      if (suspense !== 0) return suspense;
      return (preference.get(a[0]) ?? Number.MAX_SAFE_INTEGER) - (preference.get(b[0]) ?? Number.MAX_SAFE_INTEGER);
    });

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
