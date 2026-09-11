import type { EligibilityResult } from './eligibility-engine';

export type CountryReadinessState = 'ready' | 'attention_required' | 'blocked';
export type CountryReadinessSignalState = 'ready' | 'attention' | 'blocked';

export type CountryReadinessDeadline = {
  id: string;
  label: string;
  dueAt: string;
  completedAt: string | null;
};

export type CountryOperationalReadinessInput = {
  participationConfirmed: boolean;
  entryPresent: boolean;
  entryEligibility: Pick<EligibilityResult, 'status'>;
  entryApproved: boolean;
  mediaAvailable: boolean;
  juryComplete: boolean;
  deadlines: readonly CountryReadinessDeadline[];
  unresolvedOrganizerIssues: number;
  now?: Date;
};

export type CountryReadinessSignal = {
  id:
    | 'participation'
    | 'entry-validity'
    | 'entry-approval'
    | 'media'
    | 'jury'
    | 'deadlines'
    | 'organizer-issues';
  label: string;
  state: CountryReadinessSignalState;
  message: string;
};

export type CountryOperationalReadiness = {
  state: CountryReadinessState;
  score: number;
  signals: CountryReadinessSignal[];
  blockers: CountryReadinessSignal[];
  attention: CountryReadinessSignal[];
  overdueDeadlines: CountryReadinessDeadline[];
  upcomingDeadlines: CountryReadinessDeadline[];
};

function deadlineTime(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
}

export function getCountryOperationalReadiness(
  input: CountryOperationalReadinessInput,
): CountryOperationalReadiness {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const openDeadlines = input.deadlines.filter((deadline) => !deadline.completedAt);
  const overdueDeadlines = openDeadlines
    .filter((deadline) => deadlineTime(deadline.dueAt) < nowMs)
    .sort((a, b) => deadlineTime(a.dueAt) - deadlineTime(b.dueAt));
  const upcomingDeadlines = openDeadlines
    .filter((deadline) => deadlineTime(deadline.dueAt) >= nowMs)
    .sort((a, b) => deadlineTime(a.dueAt) - deadlineTime(b.dueAt));

  const signals: CountryReadinessSignal[] = [
    {
      id: 'participation',
      label: 'Participation',
      state: input.participationConfirmed ? 'ready' : 'blocked',
      message: input.participationConfirmed
        ? 'Participation is confirmed.'
        : 'Participation has not been confirmed.',
    },
    {
      id: 'entry-validity',
      label: 'Entry validity',
      state:
        !input.entryPresent || input.entryEligibility.status === 'blocked'
          ? 'blocked'
          : input.entryEligibility.status === 'warning'
            ? 'attention'
            : 'ready',
      message: !input.entryPresent
        ? 'No current entry is available.'
        : input.entryEligibility.status === 'blocked'
          ? 'The current entry has blocking eligibility requirements.'
          : input.entryEligibility.status === 'warning'
            ? 'The entry is usable but has eligibility warnings.'
            : 'The current entry passes eligibility checks.',
    },
    {
      id: 'entry-approval',
      label: 'Entry approval',
      state: input.entryApproved ? 'ready' : 'attention',
      message: input.entryApproved
        ? 'Organizer approval is recorded.'
        : 'Organizer approval is still pending.',
    },
    {
      id: 'media',
      label: 'Media',
      state: input.mediaAvailable ? 'ready' : 'attention',
      message: input.mediaAvailable
        ? 'Required entry media is available.'
        : 'Required entry media is still missing.',
    },
    {
      id: 'jury',
      label: 'Jury',
      state: input.juryComplete ? 'ready' : 'attention',
      message: input.juryComplete
        ? 'The delegation jury roster is complete.'
        : 'The delegation jury roster is incomplete.',
    },
    {
      id: 'deadlines',
      label: 'Deadlines',
      state: overdueDeadlines.length ? 'blocked' : upcomingDeadlines.length ? 'attention' : 'ready',
      message: overdueDeadlines.length
        ? `${overdueDeadlines.length} required deadline${overdueDeadlines.length === 1 ? ' is' : 's are'} overdue.`
        : upcomingDeadlines.length
          ? `${upcomingDeadlines.length} open deadline${upcomingDeadlines.length === 1 ? ' remains' : 's remain'}.`
          : 'No open delegation deadlines remain.',
    },
    {
      id: 'organizer-issues',
      label: 'Organizer issues',
      state: input.unresolvedOrganizerIssues > 0 ? 'attention' : 'ready',
      message:
        input.unresolvedOrganizerIssues > 0
          ? `${input.unresolvedOrganizerIssues} unresolved organizer issue${input.unresolvedOrganizerIssues === 1 ? ' needs' : 's need'} attention.`
          : 'No unresolved organizer issues are recorded.',
    },
  ];

  const blockers = signals.filter((signal) => signal.state === 'blocked');
  const attention = signals.filter((signal) => signal.state === 'attention');
  const readyCount = signals.filter((signal) => signal.state === 'ready').length;
  const attentionCount = attention.length;
  const score = Math.round(((readyCount + attentionCount * 0.5) / signals.length) * 100);
  const state: CountryReadinessState = blockers.length
    ? 'blocked'
    : attention.length
      ? 'attention_required'
      : 'ready';

  return {
    state,
    score,
    signals,
    blockers,
    attention,
    overdueDeadlines,
    upcomingDeadlines,
  };
}
