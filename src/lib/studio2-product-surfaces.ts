import type { SolarisFeatureFlag } from './feature-flags';

export type Studio2SurfaceState =
  | 'foundation'
  | 'integrated'
  | 'product_surface'
  | 'planned'
  | 'external_workstream';

export type Studio2Audience = 'system' | 'organizer' | 'delegation' | 'public';

export type Studio2ProductSurface = {
  key: SolarisFeatureFlag;
  label: string;
  state: Studio2SurfaceState;
  audience: Studio2Audience;
  description: string;
  route?: string;
  surfaceLabel?: string;
  dependsOn?: readonly SolarisFeatureFlag[];
};

export const STUDIO2_PRODUCT_SURFACES: Readonly<Record<SolarisFeatureFlag, Studio2ProductSurface>> = {
  edition_state_engine: {
    key: 'edition_state_engine',
    label: 'Edition State Engine',
    state: 'foundation',
    audience: 'system',
    description: 'Canonical edition lifecycle and legal transition graph used by operational surfaces.',
  },
  contest_event_engine: {
    key: 'contest_event_engine',
    label: 'Contest Event Engine',
    state: 'foundation',
    audience: 'system',
    description: 'Canonical event vocabulary and event-stream foundation for Studio 2 operations.',
  },
  permission_engine_v2: {
    key: 'permission_engine_v2',
    label: 'Permission Engine v2',
    state: 'foundation',
    audience: 'system',
    description: 'Capability-based authorization foundation for progressively replacing broad role checks.',
  },
  workflow_engine: {
    key: 'workflow_engine',
    label: 'Workflow Engine',
    state: 'integrated',
    audience: 'delegation',
    route: '/country-hub/readiness',
    surfaceLabel: 'Entry Readiness',
    dependsOn: ['hod_workspace_v2'],
    description: 'Dependency-aware workflow evaluation currently surfaced through Entry Readiness.',
  },
  official_communications: {
    key: 'official_communications',
    label: 'Official Communications',
    state: 'product_surface',
    audience: 'organizer',
    route: '/admin/communications',
    description: 'Organizer notice composer, history and acknowledgement tracking.',
  },
  hod_workspace_v2: {
    key: 'hod_workspace_v2',
    label: 'HOD Workspace v2',
    state: 'product_surface',
    audience: 'delegation',
    route: '/country-hub/hod',
    description: 'Delegation operations workspace for entry, jury and notice tasks.',
  },
  live_control_room: {
    key: 'live_control_room',
    label: 'Live Control Room',
    state: 'product_surface',
    audience: 'organizer',
    route: '/admin/control-room',
    dependsOn: ['edition_state_engine', 'contest_event_engine'],
    description: 'Persisted lifecycle state, incidents, event stream and guarded edition transitions.',
  },
  incident_command: {
    key: 'incident_command',
    label: 'Incident Command',
    state: 'integrated',
    audience: 'organizer',
    route: '/admin/control-room',
    surfaceLabel: 'Control Room',
    dependsOn: ['live_control_room'],
    description: 'Incident creation and lifecycle controls currently integrated into Control Room.',
  },
  broadcast_rundown: {
    key: 'broadcast_rundown',
    label: 'Broadcast Rundown',
    state: 'product_surface',
    audience: 'organizer',
    route: '/admin/broadcast-rundown',
    description: 'Persisted show rundown planner and timing/drift analysis.',
  },
  results_replay: {
    key: 'results_replay',
    label: 'Results Replay',
    state: 'product_surface',
    audience: 'organizer',
    route: '/admin/results-reveal',
    surfaceLabel: 'Reveal Director',
    description: 'Read-only reveal strategy comparison, suspense analysis and certainty timeline.',
  },
  voting_lab: {
    key: 'voting_lab',
    label: 'Voting Laboratory',
    state: 'product_surface',
    audience: 'organizer',
    route: '/admin/voting-lab',
    description: 'Privacy-safe simulation of alternate voting constraints over sanitized real ballots.',
  },
  edition_simulator: {
    key: 'edition_simulator',
    label: 'Edition Simulator',
    state: 'product_surface',
    audience: 'organizer',
    route: '/admin/edition-simulator',
    surfaceLabel: 'Simulator',
    dependsOn: ['edition_state_engine', 'live_control_room'],
    description: 'In-memory operational rehearsal using the current Control Room state as a starting point.',
  },
  rules_engine: {
    key: 'rules_engine',
    label: 'Rules Engine',
    state: 'external_workstream',
    audience: 'public',
    description: 'Owned by the separate Rules Hub + Trust & Integrity workstream and intentionally not rolled out here.',
  },
  public_encyclopedia: {
    key: 'public_encyclopedia',
    label: 'Public Encyclopedia',
    state: 'planned',
    audience: 'public',
    description: 'Planned public historical and statistical knowledge surface.',
  },
  country_voting_dna: {
    key: 'country_voting_dna',
    label: 'Country Voting DNA',
    state: 'planned',
    audience: 'public',
    description: 'Planned historical voting-pattern and country-profile analytics.',
  },
  prediction_league: {
    key: 'prediction_league',
    label: 'Prediction League',
    state: 'planned',
    audience: 'public',
    description: 'Planned prediction competition and leaderboard experience.',
  },
  fantasy_ssc: {
    key: 'fantasy_ssc',
    label: 'Fantasy SSC',
    state: 'planned',
    audience: 'public',
    description: 'Planned fantasy contest layer built only after operational systems are stable.',
  },
  time_machine: {
    key: 'time_machine',
    label: 'Time Machine',
    state: 'planned',
    audience: 'organizer',
    description: 'Planned historical edition-state and snapshot replay experience.',
  },
  solaris_command_assistant: {
    key: 'solaris_command_assistant',
    label: 'Solaris Command Assistant',
    state: 'planned',
    audience: 'organizer',
    description: 'Planned command layer over stable Studio 2 APIs and models.',
  },
};

export const STUDIO2_PRODUCT_SURFACE_LIST = Object.values(STUDIO2_PRODUCT_SURFACES);

export function studio2SurfaceFor(key: SolarisFeatureFlag): Studio2ProductSurface {
  return STUDIO2_PRODUCT_SURFACES[key];
}

export function studio2SurfaceStateLabel(state: Studio2SurfaceState): string {
  switch (state) {
    case 'product_surface':
      return 'Product surface';
    case 'integrated':
      return 'Integrated';
    case 'foundation':
      return 'Foundation';
    case 'external_workstream':
      return 'External workstream';
    case 'planned':
      return 'Planned';
  }
}
