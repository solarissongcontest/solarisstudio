import type { ContestEvent, ContestEventType } from './contest-events';
import type { EditionRuntimeState, EditionState, EditionSubsystem, SubsystemState } from './edition-state';
import type { FeatureFlagRule, SolarisFeatureFlag } from './feature-flags';
import type { SolarisCapability } from './permissions-v2';

export type EditionRuntimeStateRow = {
  edition_id: string;
  state: EditionState;
  revision: number;
  changed_by: string | null;
  changed_at: string;
};

export type EditionSubsystemStateRow = {
  edition_id: string;
  subsystem: EditionSubsystem;
  state: SubsystemState;
  revision: number;
  changed_by: string | null;
  changed_at: string;
};

export type ContestEventRow = {
  id: string;
  edition_id: string;
  event_type: ContestEventType;
  occurred_at: string;
  actor_user_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  payload: Record<string, unknown>;
};

export type FeatureFlagRuleRow = {
  key: SolarisFeatureFlag;
  enabled: boolean;
  admins_only: boolean;
  user_ids: string[];
  edition_ids: string[];
  updated_by: string | null;
  updated_at: string;
};

export type CapabilityGrantRow = {
  id: string;
  user_id: string;
  capability: SolarisCapability;
  edition_id: string | null;
  expires_at: string | null;
  granted_by: string | null;
  created_at: string;
};

export function runtimeStateFromRows(
  runtime: EditionRuntimeStateRow,
  subsystemRows: readonly EditionSubsystemStateRow[],
): EditionRuntimeState {
  const expected: EditionSubsystem[] = [
    'confirmations',
    'submissions',
    'juryVoting',
    'televoting',
    'results',
    'predictions',
  ];

  const states = Object.fromEntries(
    expected.map((subsystem) => {
      const row = subsystemRows.find((item) => item.subsystem === subsystem);
      if (!row) throw new Error(`Missing persisted subsystem state: ${subsystem}`);
      return [subsystem, row.state];
    }),
  ) as EditionRuntimeState['subsystems'];

  return {
    edition: runtime.state,
    subsystems: states,
  };
}

export function contestEventFromRow(row: ContestEventRow): ContestEvent {
  return {
    id: row.id,
    editionId: row.edition_id,
    type: row.event_type,
    occurredAt: row.occurred_at,
    actorUserId: row.actor_user_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    payload: row.payload,
  };
}

export function featureFlagRuleFromRow(row: FeatureFlagRuleRow): FeatureFlagRule {
  return {
    enabled: row.enabled,
    adminsOnly: row.admins_only,
    userIds: row.user_ids,
    editionIds: row.edition_ids,
  };
}
