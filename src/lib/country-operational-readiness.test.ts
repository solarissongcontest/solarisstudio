import { describe, expect, it } from 'vitest';
import { getCountryOperationalReadiness } from './country-operational-readiness';

const now = new Date('2026-09-11T18:00:00.000Z');

function readyInput() {
  return {
    participationConfirmed: true,
    entryPresent: true,
    entryEligibility: { status: 'ready' as const },
    entryApproved: true,
    mediaAvailable: true,
    juryComplete: true,
    deadlines: [],
    unresolvedOrganizerIssues: 0,
    now,
  };
}

describe('country operational readiness', () => {
  it('reports Ready only when every operational signal is clear', () => {
    const readiness = getCountryOperationalReadiness(readyInput());

    expect(readiness.state).toBe('ready');
    expect(readiness.score).toBe(100);
    expect(readiness.blockers).toEqual([]);
    expect(readiness.attention).toEqual([]);
  });

  it('blocks on unconfirmed participation, invalid entry or overdue deadlines', () => {
    const readiness = getCountryOperationalReadiness({
      ...readyInput(),
      participationConfirmed: false,
      entryEligibility: { status: 'blocked' as const },
      deadlines: [
        {
          id: 'deadline-1',
          label: 'Entry deadline',
          dueAt: '2026-09-10T18:00:00.000Z',
          completedAt: null,
        },
      ],
    });

    expect(readiness.state).toBe('blocked');
    expect(readiness.blockers.map((signal) => signal.id)).toEqual(
      expect.arrayContaining(['participation', 'entry-validity', 'deadlines']),
    );
    expect(readiness.overdueDeadlines).toHaveLength(1);
  });

  it('uses Attention required for incomplete but non-blocking operational work', () => {
    const readiness = getCountryOperationalReadiness({
      ...readyInput(),
      entryApproved: false,
      mediaAvailable: false,
      juryComplete: false,
      unresolvedOrganizerIssues: 2,
      deadlines: [
        {
          id: 'deadline-2',
          label: 'Jury deadline',
          dueAt: '2026-09-12T18:00:00.000Z',
          completedAt: null,
        },
      ],
    });

    expect(readiness.state).toBe('attention_required');
    expect(readiness.blockers).toEqual([]);
    expect(readiness.attention.map((signal) => signal.id)).toEqual(
      expect.arrayContaining(['entry-approval', 'media', 'jury', 'deadlines', 'organizer-issues']),
    );
    expect(readiness.upcomingDeadlines).toHaveLength(1);
  });

  it('does not treat completed deadlines as outstanding work', () => {
    const readiness = getCountryOperationalReadiness({
      ...readyInput(),
      deadlines: [
        {
          id: 'deadline-3',
          label: 'Completed deadline',
          dueAt: '2026-09-10T18:00:00.000Z',
          completedAt: '2026-09-10T17:00:00.000Z',
        },
      ],
    });

    expect(readiness.state).toBe('ready');
    expect(readiness.overdueDeadlines).toEqual([]);
    expect(readiness.upcomingDeadlines).toEqual([]);
  });
});
