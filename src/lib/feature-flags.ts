export const SOLARIS_FEATURE_FLAGS = [
  'edition_state_engine',
  'contest_event_engine',
  'permission_engine_v2',
  'workflow_engine',
  'official_communications',
  'hod_workspace_v2',
  'live_control_room',
  'incident_command',
  'broadcast_rundown',
  'results_replay',
  'voting_lab',
  'edition_simulator',
  'rules_engine',
  'public_encyclopedia',
  'country_voting_dna',
  'prediction_league',
  'fantasy_ssc',
  'time_machine',
  'solaris_command_assistant',
] as const;

export type SolarisFeatureFlag = (typeof SOLARIS_FEATURE_FLAGS)[number];

export type FeatureFlagContext = {
  userId?: string | null;
  editionId?: string | null;
  isAdmin?: boolean;
};

export type FeatureFlagRule = {
  enabled: boolean;
  adminsOnly?: boolean;
  userIds?: readonly string[];
  editionIds?: readonly string[];
};

export function evaluateFeatureFlag(rule: FeatureFlagRule | undefined, context: FeatureFlagContext): boolean {
  if (!rule?.enabled) return false;
  if (rule.adminsOnly && !context.isAdmin) return false;
  if (rule.userIds?.length && (!context.userId || !rule.userIds.includes(context.userId))) return false;
  if (rule.editionIds?.length && (!context.editionId || !rule.editionIds.includes(context.editionId))) return false;
  return true;
}
