export const EDITION_STATES = [
  'draft',
  'planning',
  'host_selection',
  'confirmations',
  'submissions',
  'pre_show',
  'rehearsals',
  'jury_voting',
  'live_show',
  'televoting',
  'vote_verification',
  'results',
  'post_edition',
  'archived',
] as const;

export type EditionState = (typeof EDITION_STATES)[number];

export const SUBSYSTEM_STATES = ['not_started', 'open', 'paused', 'closed', 'locked', 'verified', 'published'] as const;
export type SubsystemState = (typeof SUBSYSTEM_STATES)[number];

export type EditionSubsystem =
  | 'confirmations'
  | 'submissions'
  | 'juryVoting'
  | 'televoting'
  | 'results'
  | 'predictions';

export type EditionSubsystemStates = Record<EditionSubsystem, SubsystemState>;

export type EditionRuntimeState = {
  edition: EditionState;
  subsystems: EditionSubsystemStates;
};

export type TransitionRisk = 'normal' | 'elevated' | 'critical';

export type EditionTransition = {
  from: EditionState;
  to: EditionState;
  risk: TransitionRisk;
};

const NEXT_STATES: Record<EditionState, readonly EditionState[]> = {
  draft: ['planning'],
  planning: ['host_selection', 'confirmations'],
  host_selection: ['confirmations', 'planning'],
  confirmations: ['submissions', 'planning'],
  submissions: ['pre_show', 'confirmations'],
  pre_show: ['rehearsals', 'submissions'],
  rehearsals: ['jury_voting', 'pre_show'],
  jury_voting: ['live_show', 'rehearsals'],
  live_show: ['televoting', 'jury_voting'],
  televoting: ['vote_verification', 'live_show'],
  vote_verification: ['results', 'televoting'],
  results: ['post_edition', 'vote_verification'],
  post_edition: ['archived', 'results'],
  archived: [],
};

const CRITICAL_TRANSITIONS = new Set<string>([
  'vote_verification->televoting',
  'results->vote_verification',
  'post_edition->results',
]);

const ELEVATED_TRANSITIONS = new Set<string>([
  'host_selection->planning',
  'confirmations->planning',
  'submissions->confirmations',
  'pre_show->submissions',
  'rehearsals->pre_show',
  'jury_voting->rehearsals',
  'live_show->jury_voting',
  'televoting->live_show',
]);

export function canTransitionEdition(from: EditionState, to: EditionState): boolean {
  return NEXT_STATES[from].includes(to);
}

export function getEditionTransition(from: EditionState, to: EditionState): EditionTransition | null {
  if (!canTransitionEdition(from, to)) return null;

  const key = `${from}->${to}`;
  const risk: TransitionRisk = CRITICAL_TRANSITIONS.has(key)
    ? 'critical'
    : ELEVATED_TRANSITIONS.has(key)
      ? 'elevated'
      : 'normal';

  return { from, to, risk };
}

export function assertEditionTransition(from: EditionState, to: EditionState): EditionTransition {
  const transition = getEditionTransition(from, to);
  if (!transition) {
    throw new Error(`Illegal edition state transition: ${from} -> ${to}`);
  }
  return transition;
}

/**
 * Transitional compatibility for the current database. This lets the new state
 * engine coexist with legacy edition statuses while migrations and UIs are
 * introduced incrementally.
 */
export function normalizeLegacyEditionStatus(status: string | null | undefined): EditionState {
  const normalized = status?.trim().toLowerCase();

  switch (normalized) {
    case 'draft':
      return 'draft';
    case 'planning':
      return 'planning';
    case 'active':
    case 'ongoing':
    case 'open':
      return 'submissions';
    case 'voting':
      return 'televoting';
    case 'results':
      return 'results';
    case 'completed':
    case 'complete':
    case 'finished':
      return 'post_edition';
    case 'archived':
      return 'archived';
    default:
      return 'planning';
  }
}

export function defaultSubsystemStatesForEdition(state: EditionState): EditionSubsystemStates {
  const defaults: EditionSubsystemStates = {
    confirmations: 'not_started',
    submissions: 'not_started',
    juryVoting: 'not_started',
    televoting: 'not_started',
    results: 'not_started',
    predictions: 'not_started',
  };

  const set = (key: EditionSubsystem, value: SubsystemState) => {
    defaults[key] = value;
  };

  if (state === 'confirmations') set('confirmations', 'open');
  if (EDITION_STATES.indexOf(state) > EDITION_STATES.indexOf('confirmations')) set('confirmations', 'locked');

  if (state === 'submissions') set('submissions', 'open');
  if (EDITION_STATES.indexOf(state) > EDITION_STATES.indexOf('submissions')) set('submissions', 'locked');

  if (state === 'jury_voting') set('juryVoting', 'open');
  if (EDITION_STATES.indexOf(state) > EDITION_STATES.indexOf('jury_voting')) set('juryVoting', 'locked');

  if (state === 'televoting') set('televoting', 'open');
  if (EDITION_STATES.indexOf(state) > EDITION_STATES.indexOf('televoting')) set('televoting', 'locked');

  if (state === 'results') set('results', 'published');
  if (EDITION_STATES.indexOf(state) > EDITION_STATES.indexOf('results')) set('results', 'published');

  if (['confirmations', 'submissions', 'pre_show', 'rehearsals'].includes(state)) set('predictions', 'open');
  if (EDITION_STATES.indexOf(state) >= EDITION_STATES.indexOf('jury_voting')) set('predictions', 'locked');

  return defaults;
}
