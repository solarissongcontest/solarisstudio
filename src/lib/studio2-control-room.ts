import type { ContestEvent } from './contest-events';
import type { EditionState } from './edition-state';
import { summarizeIncidents, type IncidentStatus } from './incident-command';
import { isStudio2FeatureEnabled } from './studio2-feature-flags';
import {
  studio2Persistence,
  type Studio2CreateIncidentRequest,
  type Studio2IncidentRecord,
  type Studio2RuntimeRecord,
  type Studio2TransitionEditionRequest,
} from './studio2-persistence';
import { transitionEditionV3 } from './v3-edition-transition-client';

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

type Studio2ReviewedTransitionRequest = Studio2TransitionEditionRequest & {
  expectedVersion?: number | null;
  operationId?: string | null;
  idempotencyKey?: string | null;
};

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

type Studio2FeatureGate = (key: 'live_control_room', editionId?: string | null) => Promise<boolean>;

export function createStudio2ControlRoom(
  source: Studio2ControlRoomDataSource = studio2Persistence,
  featureGate: Studio2FeatureGate = isStudio2FeatureEnabled,
) {
  // The version remembered here is the exact runtime snapshot handed to the
  // Control Room UI for review. Do not silently replace it with a fresher value
  // immediately before mutation: that would let CAS authorize state the
  // operator never reviewed. The server remains authoritative and rejects this
  // remembered version if another actor has advanced the runtime meanwhile.
  const reviewedRuntimeVersions = new Map<string, number>();

  async function requireEnabled(editionId: string) {
    if (!(await featureGate('live_control_room', editionId))) {
      throw new Error('Live Control Room v2 is disabled by the Studio 2 rollout flag.');
    }
  }

  return {
    async loadSnapshot(editionId: string, eventLimit = 50) {
      await requireEnabled(editionId);
      const snapshot = await loadStudio2ControlRoomSnapshot(editionId, source, eventLimit);
      reviewedRuntimeVersions.set(editionId, snapshot.runtime.version);
      return snapshot;
    },

    async transitionEdition(request: Studio2ReviewedTransitionRequest) {
      // Freeze the exact version that was reviewed before any awaited work can
      // allow a background snapshot refresh to replace the remembered value.
      const reviewedExpectedVersion =
        source === studio2Persistence
          ? request.expectedVersion ?? reviewedRuntimeVersions.get(request.editionId) ?? null
          : null;

      await requireEnabled(request.editionId);

      // Production Control Room traffic uses the single governed V3 command.
      // Bind it to the reviewed snapshot version. Optional explicit identity is
      // accepted so a future caller can keep the same operation across a UI
      // retry; today's default path already reconciles uncertain transport once.
      if (source === studio2Persistence) {
        const expectedVersion = reviewedExpectedVersion;
        if (
          typeof expectedVersion !== 'number' ||
          !Number.isInteger(expectedVersion) ||
          expectedVersion < 1
        ) {
          throw new Error('Refresh the Control Room before changing edition state.');
        }

        const operationId = request.operationId ?? crypto.randomUUID();
        return transitionEditionV3({
          ...request,
          expectedVersion,
          operationId,
          idempotencyKey: request.idempotencyKey ?? `edition-transition:${operationId}`,
        });
      }

      return source.transitionEdition(request);
    },

    async listTransitionApprovals(editionId: string) {
      await requireEnabled(editionId);
      return source.listTransitionApprovals(editionId);
    },

    async requestTransitionApproval(editionId: string, to: EditionState, reason: string) {
      await requireEnabled(editionId);
      return source.requestTransitionApproval(editionId, to, reason);
    },

    async approveTransition(requestId: string) {
      // The approval RPC itself resolves and authorizes the edition from the request.
      // A disabled flag still prevents reaching this from the default UI because the
      // approval list is gated by edition before any request id is exposed.
      return source.approveTransition(requestId);
    },

    async createIncident(request: Studio2CreateIncidentRequest) {
      if (request.editionId) await requireEnabled(request.editionId);
      return source.createIncident(request);
    },

    async transitionIncident(incidentId: string, to: IncidentStatus) {
      return source.transitionIncident(incidentId, to);
    },
  };
}

export const studio2ControlRoom = createStudio2ControlRoom();
