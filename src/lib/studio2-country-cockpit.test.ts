import { describe, expect, it } from 'vitest';

import {
  sortStudio2CountryCockpitOperationally,
  type Studio2CountryCockpitRow,
} from './studio2-country-cockpit';

function row(input: {
  name: string;
  state: 'ready' | 'attention_required' | 'blocked';
  score: number;
  overdue?: number;
  issues?: number;
}) {
  return {
    context: {
      countryName: input.name,
      unresolvedOrganizerIssues: input.issues ?? 0,
    },
    operationalReadiness: {
      state: input.state,
      score: input.score,
      overdueDeadlines: Array.from({ length: input.overdue ?? 0 }, (_, index) => ({ id: String(index) })),
    },
  } as unknown as Studio2CountryCockpitRow;
}

describe('Organizer country cockpit ordering', () => {
  it('surfaces blocked and attention-required delegations before ready normality', () => {
    const ordered = sortStudio2CountryCockpitOperationally([
      row({ name: 'Readyland', state: 'ready', score: 100 }),
      row({ name: 'Attentionia', state: 'attention_required', score: 80 }),
      row({ name: 'Blockistan', state: 'blocked', score: 65 }),
    ]);

    expect(ordered.map((item) => item.context.countryName)).toEqual([
      'Blockistan',
      'Attentionia',
      'Readyland',
    ]);
  });

  it('prioritizes overdue deadlines and unresolved issues without changing readiness truth', () => {
    const overdue = row({
      name: 'Overdue',
      state: 'attention_required',
      score: 90,
      overdue: 2,
    });
    const issues = row({
      name: 'Issues',
      state: 'attention_required',
      score: 70,
      issues: 4,
    });
    const calm = row({
      name: 'Calm',
      state: 'attention_required',
      score: 60,
    });

    const ordered = sortStudio2CountryCockpitOperationally([calm, issues, overdue]);

    expect(ordered.map((item) => item.context.countryName)).toEqual([
      'Overdue',
      'Issues',
      'Calm',
    ]);
    expect(ordered[0]?.operationalReadiness.state).toBe('attention_required');
  });
});
