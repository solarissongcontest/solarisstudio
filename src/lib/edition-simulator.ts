import { assertEditionTransition, type EditionRuntimeState, type EditionState, type EditionSubsystem, type SubsystemState } from './edition-state';
import {
  assertSimulationDomainTransition,
  defaultSimulationDomains,
  hasActiveSimulationBlockers,
  type EntryReviewSimulationState,
  type LiveSimulationState,
  type ProgressionSimulationState,
  type PublicationSimulationState,
  type SimulationDomain,
  type SimulationDomainState,
} from './edition-simulation-domains';
import type { IncidentSeverity } from './incident-command';

export type SimulationIncident = {
  id: string;
  title: string;
  severity: IncidentSeverity;
  active: boolean;
};

export type EditionSimulationState = {
  clock: string;
  runtime: EditionRuntimeState;
  domains: SimulationDomainState;
  incidents: SimulationIncident[];
  log: SimulationLogEntry[];
};

export type SimulationAction =
  | { type: 'advance_time'; seconds: number }
  | { type: 'transition_edition'; to: EditionState }
  | { type: 'set_subsystem'; subsystem: EditionSubsystem; state: SubsystemState }
  | { type: 'transition_entries'; to: EntryReviewSimulationState }
  | { type: 'transition_publication'; to: PublicationSimulationState }
  | { type: 'transition_progression'; to: ProgressionSimulationState }
  | { type: 'transition_live'; to: LiveSimulationState }
  | { type: 'set_domain_blocker'; domain: SimulationDomain; id: string; label: string; active: boolean }
  | { type: 'set_progression_counts'; qualifiersExpected: number; qualifiersApplied: number }
  | { type: 'create_incident'; id: string; title: string; severity: IncidentSeverity }
  | { type: 'resolve_incident'; id: string };

export type SimulationLogEntry = {
  index: number;
  at: string;
  action: SimulationAction;
  summary: string;
};

function plusSeconds(timestamp: string, seconds: number) {
  return new Date(new Date(timestamp).getTime() + seconds * 1000).toISOString();
}

function log(state: EditionSimulationState, action: SimulationAction, summary: string): EditionSimulationState {
  return {
    ...state,
    log: [
      ...state.log,
      {
        index: state.log.length,
        at: state.clock,
        action,
        summary,
      },
    ],
  };
}

export function createEditionSimulation(input: {
  startsAt: string;
  runtime: EditionRuntimeState;
  domains?: SimulationDomainState;
}): EditionSimulationState {
  const start = new Date(input.startsAt);
  if (!Number.isFinite(start.getTime())) throw new Error('Simulation requires a valid start time');

  return {
    clock: start.toISOString(),
    runtime: structuredClone(input.runtime),
    domains: structuredClone(input.domains ?? defaultSimulationDomains()),
    incidents: [],
    log: [],
  };
}

function transitionDomain<TDomain extends SimulationDomain>(
  current: EditionSimulationState,
  action: SimulationAction,
  domain: TDomain,
  next: SimulationDomainState[TDomain]['state'],
): EditionSimulationState {
  const previous = current.domains[domain].state;
  assertSimulationDomainTransition(domain, previous, next);

  if (
    (domain === 'publication' || domain === 'progression' || domain === 'live') &&
    hasActiveSimulationBlockers(current.domains[domain]) &&
    !['blocked', 'held'].includes(next as string)
  ) {
    throw new Error(`${domain} simulation has active blockers`);
  }

  if (domain === 'progression' && next === 'locked') {
    const progression = current.domains.progression;
    if (progression.qualifiersApplied !== progression.qualifiersExpected) {
      throw new Error('Progression cannot lock until the expected qualifier set is applied');
    }
  }

  const state = {
    ...current,
    domains: {
      ...current.domains,
      [domain]: {
        ...current.domains[domain],
        state: next,
      },
    },
  } as EditionSimulationState;

  return log(state, action, `${domain} ${previous} -> ${next}`);
}

export function applySimulationAction(
  current: EditionSimulationState,
  action: SimulationAction,
): EditionSimulationState {
  switch (action.type) {
    case 'advance_time': {
      if (!Number.isInteger(action.seconds) || action.seconds < 0) {
        throw new Error('Simulation time advance must be a non-negative integer');
      }
      const state = { ...current, clock: plusSeconds(current.clock, action.seconds) };
      return log(state, action, `Advanced simulation by ${action.seconds}s`);
    }

    case 'transition_edition': {
      assertEditionTransition(current.runtime.edition, action.to);
      const from = current.runtime.edition;
      const state = {
        ...current,
        runtime: { ...current.runtime, edition: action.to },
      };
      return log(state, action, `Edition state ${from} -> ${action.to}`);
    }

    case 'set_subsystem': {
      const previous = current.runtime.subsystems[action.subsystem];
      const state = {
        ...current,
        runtime: {
          ...current.runtime,
          subsystems: {
            ...current.runtime.subsystems,
            [action.subsystem]: action.state,
          },
        },
      };
      return log(state, action, `${action.subsystem} ${previous} -> ${action.state}`);
    }

    case 'transition_entries':
      return transitionDomain(current, action, 'entries', action.to);

    case 'transition_publication':
      return transitionDomain(current, action, 'publication', action.to);

    case 'transition_progression':
      return transitionDomain(current, action, 'progression', action.to);

    case 'transition_live':
      return transitionDomain(current, action, 'live', action.to);

    case 'set_domain_blocker': {
      const currentDomain = current.domains[action.domain];
      const existing = currentDomain.blockers.find((blocker) => blocker.id === action.id);
      const blockers = existing
        ? currentDomain.blockers.map((blocker) =>
            blocker.id === action.id
              ? { ...blocker, label: action.label, active: action.active }
              : blocker,
          )
        : [...currentDomain.blockers, { id: action.id, label: action.label, active: action.active }];
      const state = {
        ...current,
        domains: {
          ...current.domains,
          [action.domain]: { ...currentDomain, blockers },
        },
      } as EditionSimulationState;
      return log(
        state,
        action,
        `${action.domain} blocker ${action.id} ${action.active ? 'activated' : 'cleared'}`,
      );
    }

    case 'set_progression_counts': {
      if (
        !Number.isInteger(action.qualifiersExpected) ||
        !Number.isInteger(action.qualifiersApplied) ||
        action.qualifiersExpected < 0 ||
        action.qualifiersApplied < 0 ||
        action.qualifiersApplied > action.qualifiersExpected
      ) {
        throw new Error('Progression counts must be non-negative integers with applied <= expected');
      }
      const state = {
        ...current,
        domains: {
          ...current.domains,
          progression: {
            ...current.domains.progression,
            qualifiersExpected: action.qualifiersExpected,
            qualifiersApplied: action.qualifiersApplied,
          },
        },
      };
      return log(
        state,
        action,
        `Progression qualifiers ${action.qualifiersApplied}/${action.qualifiersExpected}`,
      );
    }

    case 'create_incident': {
      if (current.incidents.some((incident) => incident.id === action.id)) {
        throw new Error(`Duplicate simulation incident id: ${action.id}`);
      }
      const state = {
        ...current,
        incidents: [
          ...current.incidents,
          { id: action.id, title: action.title, severity: action.severity, active: true },
        ],
      };
      return log(state, action, `Created ${action.severity.toUpperCase()} incident: ${action.title}`);
    }

    case 'resolve_incident': {
      const incident = current.incidents.find((item) => item.id === action.id);
      if (!incident) throw new Error(`Unknown simulation incident: ${action.id}`);
      const state = {
        ...current,
        incidents: current.incidents.map((item) =>
          item.id === action.id ? { ...item, active: false } : item,
        ),
      };
      return log(state, action, `Resolved incident: ${incident.title}`);
    }
  }
}

export function runEditionSimulation(
  initial: EditionSimulationState,
  actions: readonly SimulationAction[],
): EditionSimulationState {
  return actions.reduce(applySimulationAction, initial);
}
