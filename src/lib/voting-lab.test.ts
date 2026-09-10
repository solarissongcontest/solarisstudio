import { describe, expect, it } from 'vitest';
import { compareVotingSystems, simulateVotingSystem, type VotingLabBallot } from './voting-lab';

const ballots: VotingLabBallot[] = [
  { id: 'b1', voterId: 'u1', awards: [{ countryId: 'oland', points: 10 }, { countryId: 'vendia', points: 6 }] },
  { id: 'b2', voterId: 'u2', awards: [{ countryId: 'oland', points: 9 }, { countryId: 'aotea', points: 8 }] },
  { id: 'b3', voterId: 'u3', awards: [{ countryId: 'vendia', points: 10 }, { countryId: 'aotea', points: 7 }] },
];

describe('voting laboratory', () => {
  it('simulates results without using production voting code', () => {
    const result = simulateVotingSystem(ballots, {
      maxPerCountry: 10,
      ballotBudget: 20,
      minimumCountries: 2,
      invalidBallotPolicy: 'reject',
    });

    expect(result.acceptedBallots).toBe(3);
    expect(result.winner).toBe('oland');
    expect(result.results.find((row) => row.countryId === 'oland')?.points).toBe(19);
  });

  it('can compare stricter allocation caps against the same ballots', () => {
    const comparison = compareVotingSystems(ballots, {
      current: {
        maxPerCountry: 10,
        ballotBudget: 20,
        minimumCountries: 2,
        invalidBallotPolicy: 'reject',
      },
      capped7: {
        maxPerCountry: 7,
        ballotBudget: 20,
        minimumCountries: 2,
        invalidBallotPolicy: 'cap',
      },
    });

    expect(comparison.current.winner).toBe('oland');
    expect(comparison.capped7.adjustedBallots).toEqual(expect.arrayContaining(['b1', 'b2', 'b3']));
    expect(comparison.capped7.results.find((row) => row.countryId === 'oland')?.points).toBe(14);
  });

  it('rejects ballots that do not satisfy the configured minimum country count', () => {
    const result = simulateVotingSystem(
      [{ id: 'single', voterId: 'u1', awards: [{ countryId: 'oland', points: 10 }] }],
      {
        maxPerCountry: 10,
        ballotBudget: 20,
        minimumCountries: 2,
        invalidBallotPolicy: 'reject',
      },
    );

    expect(result.acceptedBallots).toBe(0);
    expect(result.rejectedBallots).toEqual(['single']);
  });
});
