import type { EditionRuntimeState, EditionState, SubsystemState } from './edition-state';
import { defaultSubsystemStatesForEdition, normalizeLegacyEditionStatus } from './edition-state';

export type ControlRoomHealth = 'healthy' | 'attention' | 'critical';
export type ControlRoomActionRisk = 'normal' | 'elevated' | 'critical';

export type ControlRoomAction = {
  id: string;
  label: string;
  description: string;
  risk: ControlRoomActionRisk;
  enabled: boolean;
};

export type ControlRoomInput = {
  editionId: string;
  editionName: string;
  legacyEditionStatus?: string | null;
  runtimeState?: EditionRuntimeState | null;
  healthStatus?: 'ready' | 'needs-attention' | 'blocked' | null;
  healthIssues?: number;
  criticalIssues?: number;
  activeIncidents?: number;
  criticalIncidents?: number;
  currentSegment?: string | null;
  nextSegment?: string | null;
  ballotsReceived?: number | null;
  ballotsExpected?: number | null;
};

export type ControlRoomModel = {
  editionId: string;
  editionName: string;
  editionState: EditionState;
  overallHealth: ControlRoomHealth;
  subsystems: EditionRuntimeState['subsystems'];
  currentSegment: string | null;
  nextSegment: string | null;
  ballots: {
    received: number | null;
    expected: number | null;
    completion: number | null;
  };
  issues: {
    total: number;
    critical: number;
    incidents: number;
    criticalIncidents: number;
  };
  actions: ControlRoomAction[];
};

function deriveHealth(input: ControlRoomInput): ControlRoomHealth {
  if ((input.criticalIncidents ?? 0) > 0 || (input.criticalIssues ?? 0) > 0 || input.healthStatus === 'blocked') {
    return 'critical';
  }
  if ((input.activeIncidents ?? 0) > 0 || (input.healthIssues ?? 0) > 0 || input.healthStatus === 'needs-attention') {
    return 'attention';
  }
  return 'healthy';
}

function completion(received?: number | null, expected?: number | null): number | null {
  if (received == null || expected == null || expected <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((received / expected) * 100)));
}

function action(
  id: string,
  label: string,
  description: string,
  risk: ControlRoomActionRisk,
  enabled = true,
): ControlRoomAction {
  return { id, label, description, risk, enabled };
}

function buildActions(state: EditionState, subsystemState: SubsystemState): ControlRoomAction[] {
  switch (state) {
    case 'confirmations':
      return [
        action('close-confirmations', 'Close confirmations', 'Lock confirmation changes and advance the edition workflow.', 'elevated'),
      ];
    case 'submissions':
      return [
        action('lock-submissions', 'Lock submissions', 'Stop normal entry edits before pre-show preparation.', 'elevated'),
      ];
    case 'jury_voting':
      return [
        action('close-jury', 'Close jury voting', 'Stop jury ballot intake and prepare the live-show state.', 'elevated'),
      ];
    case 'live_show':
      return [
        action('open-televote', 'Open televoting', 'Start the public televoting window.', 'critical', subsystemState !== 'open'),
      ];
    case 'televoting':
      return [
        action('close-televote', 'Close televoting', 'Stop accepting public ballots and begin verification.', 'critical', subsystemState === 'open'),
      ];
    case 'vote_verification':
      return [
        action('verify-results', 'Verify results', 'Confirm the calculated result package is ready for publication.', 'critical'),
        action('reopen-televote', 'Reopen televoting', 'Return the voting subsystem to an open state after verification began.', 'critical'),
      ];
    case 'results':
      return [
        action('publish-results', 'Publish results', 'Release the verified result package to public surfaces.', 'critical'),
      ];
    case 'post_edition':
      return [
        action('archive-edition', 'Archive edition', 'Freeze the canonical edition record and close operational workflows.', 'critical'),
      ];
    default:
      return [];
  }
}

export function buildControlRoomModel(input: ControlRoomInput): ControlRoomModel {
  const editionState = input.runtimeState?.edition ?? normalizeLegacyEditionStatus(input.legacyEditionStatus);
  const subsystems = input.runtimeState?.subsystems ?? defaultSubsystemStatesForEdition(editionState);

  return {
    editionId: input.editionId,
    editionName: input.editionName,
    editionState,
    overallHealth: deriveHealth(input),
    subsystems,
    currentSegment: input.currentSegment ?? null,
    nextSegment: input.nextSegment ?? null,
    ballots: {
      received: input.ballotsReceived ?? null,
      expected: input.ballotsExpected ?? null,
      completion: completion(input.ballotsReceived, input.ballotsExpected),
    },
    issues: {
      total: Math.max(0, input.healthIssues ?? 0),
      critical: Math.max(0, input.criticalIssues ?? 0),
      incidents: Math.max(0, input.activeIncidents ?? 0),
      criticalIncidents: Math.max(0, input.criticalIncidents ?? 0),
    },
    actions: buildActions(editionState, subsystems.televoting),
  };
}
