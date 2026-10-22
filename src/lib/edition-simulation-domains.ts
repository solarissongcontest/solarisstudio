export const ENTRY_REVIEW_SIMULATION_STATES = [
  'not_started',
  'collecting',
  'reviewing',
  'changes_requested',
  'accepted',
  'locked',
] as const;
export type EntryReviewSimulationState = (typeof ENTRY_REVIEW_SIMULATION_STATES)[number];

export const PUBLICATION_SIMULATION_STATES = [
  'not_started',
  'blocked',
  'ready',
  'scheduled',
  'published',
  'hidden',
] as const;
export type PublicationSimulationState = (typeof PUBLICATION_SIMULATION_STATES)[number];

export const PROGRESSION_SIMULATION_STATES = [
  'not_started',
  'blocked',
  'ready',
  'applied',
  'locked',
] as const;
export type ProgressionSimulationState = (typeof PROGRESSION_SIMULATION_STATES)[number];

export const LIVE_SIMULATION_STATES = [
  'planning',
  'rehearsal',
  'armed',
  'live',
  'held',
  'complete',
] as const;
export type LiveSimulationState = (typeof LIVE_SIMULATION_STATES)[number];

export type SimulationDomainBlocker = {
  id: string;
  label: string;
  active: boolean;
};

export type SimulationDomainState = {
  entries: {
    state: EntryReviewSimulationState;
    blockers: SimulationDomainBlocker[];
  };
  publication: {
    state: PublicationSimulationState;
    blockers: SimulationDomainBlocker[];
  };
  progression: {
    state: ProgressionSimulationState;
    blockers: SimulationDomainBlocker[];
    qualifiersExpected: number;
    qualifiersApplied: number;
  };
  live: {
    state: LiveSimulationState;
    blockers: SimulationDomainBlocker[];
  };
};

export type SimulationDomain = keyof SimulationDomainState;

export function defaultSimulationDomains(): SimulationDomainState {
  return {
    entries: { state: 'not_started', blockers: [] },
    publication: { state: 'not_started', blockers: [] },
    progression: {
      state: 'not_started',
      blockers: [],
      qualifiersExpected: 0,
      qualifiersApplied: 0,
    },
    live: { state: 'planning', blockers: [] },
  };
}

const ENTRY_TRANSITIONS: Record<EntryReviewSimulationState, readonly EntryReviewSimulationState[]> = {
  not_started: ['collecting'],
  collecting: ['reviewing', 'not_started'],
  reviewing: ['changes_requested', 'accepted', 'collecting'],
  changes_requested: ['collecting', 'reviewing'],
  accepted: ['locked', 'reviewing'],
  locked: ['reviewing'],
};

const PUBLICATION_TRANSITIONS: Record<PublicationSimulationState, readonly PublicationSimulationState[]> = {
  not_started: ['blocked', 'ready'],
  blocked: ['ready', 'not_started'],
  ready: ['blocked', 'scheduled', 'published'],
  scheduled: ['blocked', 'ready', 'published'],
  published: ['hidden'],
  hidden: ['ready', 'published'],
};

const PROGRESSION_TRANSITIONS: Record<ProgressionSimulationState, readonly ProgressionSimulationState[]> = {
  not_started: ['blocked', 'ready'],
  blocked: ['ready', 'not_started'],
  ready: ['blocked', 'applied'],
  applied: ['locked', 'ready'],
  locked: [],
};

const LIVE_TRANSITIONS: Record<LiveSimulationState, readonly LiveSimulationState[]> = {
  planning: ['rehearsal'],
  rehearsal: ['planning', 'armed'],
  armed: ['rehearsal', 'live'],
  live: ['held', 'complete'],
  held: ['live', 'complete'],
  complete: [],
};

export function simulationDomainTransitions<TDomain extends SimulationDomain>(
  domain: TDomain,
  current: SimulationDomainState[TDomain]['state'],
): readonly SimulationDomainState[TDomain]['state'][] {
  if (domain === 'entries') return ENTRY_TRANSITIONS[current as EntryReviewSimulationState] as never;
  if (domain === 'publication') return PUBLICATION_TRANSITIONS[current as PublicationSimulationState] as never;
  if (domain === 'progression') return PROGRESSION_TRANSITIONS[current as ProgressionSimulationState] as never;
  return LIVE_TRANSITIONS[current as LiveSimulationState] as never;
}

export function assertSimulationDomainTransition<TDomain extends SimulationDomain>(
  domain: TDomain,
  current: SimulationDomainState[TDomain]['state'],
  next: SimulationDomainState[TDomain]['state'],
) {
  const allowed = simulationDomainTransitions(domain, current);
  if (!(allowed as readonly string[]).includes(next as string)) {
    throw new Error(`Illegal ${domain} simulation transition: ${current} -> ${next}`);
  }
}

export function hasActiveSimulationBlockers(
  state: Pick<SimulationDomainState[SimulationDomain], 'blockers'>,
) {
  return state.blockers.some((blocker) => blocker.active);
}
