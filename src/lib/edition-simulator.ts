import { assertEditionTransition, type EditionRuntimeState, type EditionState, type EditionSubsystem, type SubsystemState } from './edition-state';
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
  incidents: SimulationIncident[];
  log: SimulationLogEntry[];
};

export type SimulationAction =
  | { type: 'advance_time'; seconds: number }
  | { type: 'transition_edition'; to: EditionState }
  | { type: 'set_subsystem'; subsystem: EditionSubsystem; state: SubsystemState }
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
}): EditionSimulationState {
  const start = new Date(input.startsAt);
  if (!Number.isFinite(start.getTime())) throw new Error('Simulation requires a valid start time');

  return {
    clock: start.toISOString(),
    runtime: structuredClone(input.runtime),
    incidents: [],
    log: [],
  };
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
