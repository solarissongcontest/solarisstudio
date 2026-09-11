import { describe, expect, it } from 'vitest';

import type { ResultRow } from './data';
import { buildResultsRevealModel, simulateCustomRevealOrder } from './results-reveal-model';

function row(id: string, jury: number, televote: number, rank: number | null): ResultRow {
  return {
    id: `result-${id}`,
    edition_id: 'edition-1',
    show_id: 'show-1',
    country_id: id,
    contest_entity_id: null,
    jury_points: jury,
    televote_points: televote,
    total_points: jury + televote,
    final_rank: rank,
  };
}

describe('Results Reveal Director model', () => {
  const rows = [
    row('a', 100, 50, 2),
    row('b', 80, 100, 1),
    row('c', 40, 20, 3),
  ];

  it('builds reveal strategies directly from canonical result rows', () => {
    const model = buildResultsRevealModel(rows);
    expect(model.baseScores).toEqual([
      { countryId: 'a', points: 100 },
      { countryId: 'b', points: 80 },
      { countryId: 'c', points: 40 },
    ]);
    expect(model.strategies.jury_order.map((award) => award.countryId)).toEqual(['c', 'b', 'a']);
    expect(model.strategies.final_rank_reverse.map((award) => award.countryId)).toEqual(['c', 'a', 'b']);
    expect(model.strategies.televote_ascending.map((award) => award.countryId)).toEqual(['c', 'a', 'b']);
  });

  it('compares suspense and recommends one available strategy', () => {
    const model = buildResultsRevealModel(rows);
    expect(model.recommendedStrategy).not.toBeNull();
    expect(model.simulations[model.recommendedStrategy!].finalWinner).toBe('b');
    expect(model.simulations[model.recommendedStrategy!].suspenseRatio).toBeGreaterThan(0);
  });

  it('prefers the operational jury-order strategy when suspense is tied', () => {
    const tied = [
      row('a', 10, 0, 1),
      row('b', 0, 0, 2),
    ];
    const model = buildResultsRevealModel(tied);
    expect(model.recommendedStrategy).toBe('jury_order');
  });

  it('keeps unranked rows after ranked rows in reverse-rank forensics', () => {
    const model = buildResultsRevealModel([
      row('winner', 100, 100, 1),
      row('last', 10, 10, 20),
      row('unranked', 0, 0, null),
    ]);
    expect(model.strategies.final_rank_reverse.map((award) => award.countryId)).toEqual([
      'last',
      'winner',
      'unranked',
    ]);
  });

  it('can simulate a custom reveal order', () => {
    const simulation = simulateCustomRevealOrder(rows, ['a', 'c', 'b']);
    expect(simulation.steps).toHaveLength(3);
    expect(simulation.finalWinner).toBe('b');
  });
});
