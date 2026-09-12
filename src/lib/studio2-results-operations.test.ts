import { describe, expect, it } from 'vitest';

import {
  availableStudio2ResultActions,
  parseStudio2ResultOperationRow,
  resultActionLabel,
  resultLifecycleLabel,
  summarizeStudio2ResultsOperations,
  type Studio2ResultOperationRow,
} from './studio2-results-operations';

function row(overrides: Partial<Studio2ResultOperationRow> = {}): Studio2ResultOperationRow {
  return {
    showId: 'show-1',
    showName: 'Grand Final',
    showKind: 'grand-final',
    sortOrder: 1,
    lifecycle: 'calculation_ready',
    calculationVersion: 0,
    lastCalculatedAt: null,
    lastCalculatedBy: null,
    reviewedVersion: null,
    reviewedAt: null,
    reviewedBy: null,
    lockedVersion: null,
    lockedAt: null,
    lockedBy: null,
    revealReadyVersion: null,
    revealReadyAt: null,
    revealReadyBy: null,
    preconditions: {
      participantCount: 10,
      juryEnabled: true,
      juryRequiredPoints: 10,
      juryVoterCount: 10,
      juryVoteRows: 100,
      juryDnvCount: 0,
      juryIncompleteCount: 0,
      juryConflictCount: 0,
      juryReady: true,
      televoteEnabled: true,
      televoteVoteRows: 100,
      televoteReady: true,
      calculationReady: true,
      resultRowCount: 0,
      reconcileIssueCount: 0,
      resultReady: false,
      publishedResults: false,
    },
    ...overrides,
  };
}

describe('Studio 2 results operations model', () => {
  it('parses a valid snapshot row and rejects unknown lifecycle values', () => {
    const parsed = parseStudio2ResultOperationRow(row());
    expect(parsed.showName).toBe('Grand Final');
    expect(parsed.preconditions.juryReady).toBe(true);

    expect(() => parseStudio2ResultOperationRow({ ...row(), lifecycle: 'magic' })).toThrow('Invalid result lifecycle');
  });

  it('offers calculation only when canonical vote readiness is satisfied', () => {
    expect(availableStudio2ResultActions(row())).toContain('calculate');
    expect(availableStudio2ResultActions(row({
      preconditions: { ...row().preconditions, calculationReady: false },
    }))).not.toContain('calculate');
  });

  it('requires review before locking and lock before reveal readiness', () => {
    const calculated = row({
      lifecycle: 'calculated',
      calculationVersion: 2,
      preconditions: { ...row().preconditions, resultRowCount: 10, resultReady: true },
    });
    expect(availableStudio2ResultActions(calculated)).toContain('review');
    expect(availableStudio2ResultActions(calculated)).not.toContain('lock');

    const reviewed = row({ ...calculated, lifecycle: 'reviewed', reviewedVersion: 2 });
    expect(availableStudio2ResultActions(reviewed)).toContain('lock');

    const locked = row({ ...reviewed, lifecycle: 'locked', lockedVersion: 2 });
    expect(availableStudio2ResultActions(locked)).toContain('mark_reveal_ready');
    expect(availableStudio2ResultActions(locked)).toContain('unlock');
  });

  it('removes destructive lifecycle actions once canonical result publication is live', () => {
    const published = row({
      lifecycle: 'published',
      calculationVersion: 3,
      reviewedVersion: 3,
      lockedVersion: 3,
      revealReadyVersion: 3,
      preconditions: {
        ...row().preconditions,
        resultRowCount: 10,
        resultReady: true,
        publishedResults: true,
      },
    });
    const actions = availableStudio2ResultActions(published);
    expect(actions).not.toContain('calculate');
    expect(actions).not.toContain('unlock');
    expect(actions).not.toContain('clear_reveal_ready');
  });

  it('summarizes operational readiness without inventing a second scoring model', () => {
    const rows = [
      row(),
      row({ showId: 'show-2', lifecycle: 'locked', calculationVersion: 1, reviewedVersion: 1, lockedVersion: 1 }),
      row({
        showId: 'show-3',
        lifecycle: 'published',
        calculationVersion: 2,
        reviewedVersion: 2,
        lockedVersion: 2,
        revealReadyVersion: 2,
        preconditions: { ...row().preconditions, publishedResults: true },
      }),
    ];
    expect(summarizeStudio2ResultsOperations(rows)).toEqual({
      shows: 3,
      calculationReady: 3,
      blocking: 0,
      locked: 2,
      revealReady: 1,
      published: 1,
    });
    expect(resultLifecycleLabel('reveal_ready')).toBe('Reveal ready');
    expect(resultActionLabel('calculate', 4)).toBe('Recalculate results');
  });
});
