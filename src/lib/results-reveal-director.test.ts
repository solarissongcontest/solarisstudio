import { describe, expect, it } from 'vitest';
import { compareRevealOrders, simulateResultsReveal } from './results-reveal-director';

describe('results reveal director', () => {
  it('finds the step where the winner becomes mathematically certain', () => {
    const result = simulateResultsReveal(
      [
        { countryId: 'oland', points: 100 },
        { countryId: 'vendia', points: 95 },
        { countryId: 'aotea', points: 90 },
      ],
      [
        { countryId: 'aotea', points: 20 },
        { countryId: 'vendia', points: 30 },
        { countryId: 'oland', points: 80 },
      ],
    );

    expect(result.finalWinner).toBe('oland');
    expect(result.certaintyStep).toBe(3);
    expect(result.suspenseRatio).toBe(1);
    expect(result.steps[2].winnerCertain).toBe(true);
  });

  it('can compare alternative reveal orders using the same final points', () => {
    const base = [
      { countryId: 'oland', points: 100 },
      { countryId: 'vendia', points: 95 },
      { countryId: 'aotea', points: 20 },
    ];
    const comparison = compareRevealOrders(base, {
      winnerEarly: [
        { countryId: 'oland', points: 100 },
        { countryId: 'aotea', points: 10 },
        { countryId: 'vendia', points: 20 },
      ],
      winnerLast: [
        { countryId: 'aotea', points: 10 },
        { countryId: 'vendia', points: 20 },
        { countryId: 'oland', points: 100 },
      ],
    });

    expect(comparison.winnerEarly.finalWinner).toBe('oland');
    expect(comparison.winnerLast.finalWinner).toBe('oland');
    expect(comparison.winnerLast.suspenseRatio).toBeGreaterThanOrEqual(comparison.winnerEarly.suspenseRatio);
  });
});
