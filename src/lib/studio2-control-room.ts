import type { ContestEvent } from './contest-events';
import type { EditionState } from './edition-state';
import { summarizeIncidents, type IncidentStatus } from './incident-command';
import {
  studio2Persistence,
  type Studio2CreateIncidentRequest,
  type Studio2IncidentRecord,
  type Studio2RuntimeRecord,
  type Studio2TransitionEditionRequest,
} from './studio2-persistence';

export type Studio2ControlRoomSnapshot = {
  editionId: string;
  runtime: Studio2RuntimeRecord;
  recentEvents: ContestEvent[];
  incidents: Studio2IncidentRecord[];
  incidentSummary: ReturnType<typeof summarizeIncidents>;
};

export type Studio2ControlRoomDataSource = Pick<
  typeof studio2Persistence,
  | 'loadEditionRuntime'
  | 'listEditionEvents'
  | 'listActiveIncidents'
  | 'transitionEdition'
  | 'listTransitionApprovals'
  | 'requestTransitionApproval'
  | 'approveTransition'
  | 'createIncident'
  | 'transitionIncident'
>;

export async function loadStudio2ControlRoomSnapshot(
  editionId: string,
  source: Studio2ControlRoomDataSource = studio2Persistence,
  eventLimit = 50,
): Promise<Studio2ControlRoomSnapshot> {
  const [runtime, recentEvents, incidents] = await Promise.all([
    source.loadEditionRuntime(editionId),
    source.listEditionEvents(editionId, eventLimit),
    source.listActiveIncidents(editionId),
  ]);

  if (!runtime) {
    throw new Error(`Studio 2 runtime is unavailable for edition ${editionId}`);
  }

  return {
    editionId,
    runtime,
    recentEvents,
    incidents,
    incidentSummary: summarizeIncidents(incidents),
  };
}

export function createStudio2ControlRoom(source: Studio2ControlRoomDataSource = studio2Persistence) {
  return {
    loadSnapshot(editionId: string, eventLimit = 50) {
      return loadStudio2ControlRoomSnapshot(editionId, source, eventLimit);
    },

    transitionEdition(request: Studio2TransitionEditionRequest) {
      return source.transitionEdition(request);
    },

    listTransitionApprovals(editionId: string) {
      return source.listTransitionApprovals(editionId);
    },

    requestTransitionApproval(editionId: string, to: EditionState, reason: string) {
      return source.requestTransitionApproval(editionId, to, reason);
    },

    approveTransition(requestId: string) {
      return source.approveTransition(requestId);
    },

    createIncident(request: Studio2CreateIncidentRequest) {
      return source.createIncident(request);
    },

    transitionIncident(incidentId: string, to: IncidentStatus) {
      return source.transitionIncident(incidentId, to);
    },
  };
}

export const studio2ControlRoom = createStudio2ControlRoom();
