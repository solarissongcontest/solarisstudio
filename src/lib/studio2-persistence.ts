import { supabase } from '@/integrations/supabase/client';

import {
  CONTEST_EVENT_TYPES,
  isContestEventType,
  type ContestEvent,
  type ContestEventType,
} from './contest-events';
import {
  EDITION_STATES,
  SUBSYSTEM_STATES,
  type EditionRuntimeState,
  type EditionState,
  type EditionSubsystemStates,
  type SubsystemState,
} from './edition-state';
import {
  INCIDENT_CATEGORIES,
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
  type Incident,
  type IncidentCategory,
  type IncidentSeverity,
  type IncidentStatus,
} from './incident-command';
import { SOLARIS_CAPABILITIES, type SolarisCapability } from './permissions-v2';

export type Studio2RuntimeRecord = {
  editionId: string;
  runtime: EditionRuntimeState;
  version: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
};

export type Studio2CapabilityGrantRecord = {
  id: string;
  userId: string;
  capability: SolarisCapability;
  editionId: string | null;
  expiresAt: string | null;
  grantedBy: string | null;
  createdAt: string;
};

export type Studio2IncidentRecord = Incident & {
  category: IncidentCategory;
  affectedSystems: string[];
  description: string;
  commanderId: string | null;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  resolution: string | null;
  postmortem: string | null;
  crisisDeclaredAt: string | null;
  crisisDeclaredBy: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Studio2TransitionApprovalRecord = {
  id: string;
  editionId: string;
  from: EditionState;
  to: EditionState;
  reason: string;
  requestedBy: string;
  requestedAt: string;
  expiresAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  canApprove: boolean;
  canApply: boolean;
};

export type Studio2TransitionEditionRequest = {
  editionId: string;
  to: EditionState;
  reason?: string | null;
  approvalRequestId?: string | null;
};

export type Studio2CreateIncidentRequest = {
  editionId: string | null;
  title: string;
  severity: IncidentSeverity;
};

export type Studio2CreateIncidentFullRequest = Studio2CreateIncidentRequest & {
  category: IncidentCategory;
  description: string;
  affectedSystems: string[];
};

export type Studio2UpdateIncidentRequest = {
  id: string;
  title?: string | null;
  severity?: IncidentSeverity | null;
  category?: IncidentCategory | null;
  description?: string | null;
  affectedSystems?: string[] | null;
  commanderId?: string | null;
  setCommander?: boolean;
  resolution?: string | null;
  postmortem?: string | null;
};

export type Studio2GrantCapabilityRequest = {
  userId: string;
  capability: SolarisCapability;
  editionId?: string | null;
  expiresAt?: string | null;
};

type SupabaseResult<T> = PromiseLike<{ data: T; error: unknown }>;

type Studio2QueryBuilder = {
  select(columns?: string): Studio2QueryBuilder;
  eq(column: string, value: unknown): Studio2QueryBuilder;
  is(column: string, value: null): Studio2QueryBuilder;
  order(column: string, options?: { ascending?: boolean }): Studio2QueryBuilder;
  limit(count: number): Studio2QueryBuilder;
  maybeSingle(): SupabaseResult<unknown>;
  then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2>;
};

export type Studio2SupabaseClient = {
  from(table: string): Studio2QueryBuilder;
  rpc(name: string, args?: Record<string, unknown>): SupabaseResult<unknown>;
};

const EDITION_STATE_SET = new Set<string>(EDITION_STATES);
const SUBSYSTEM_STATE_SET = new Set<string>(SUBSYSTEM_STATES);
const INCIDENT_SEVERITY_SET = new Set<string>(INCIDENT_SEVERITIES);
const INCIDENT_CATEGORY_SET = new Set<string>(INCIDENT_CATEGORIES);
const INCIDENT_STATUS_SET = new Set<string>(INCIDENT_STATUSES);
const CONTEST_EVENT_TYPE_SET = new Set<string>(CONTEST_EVENT_TYPES);
const SOLARIS_CAPABILITY_SET = new Set<string>(SOLARIS_CAPABILITIES);

function expectObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ${label}: expected an object`);
  }
  return value as Record<string, unknown>;
}

function expectString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`Invalid ${label}: expected a string`);
  return value;
}

function expectNullableString(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  return expectString(value, label);
}

function expectStringArray(value: unknown, label: string): string[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`Invalid ${label}: expected a string array`);
  }
  return value as string[];
}

function expectBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`Invalid ${label}: expected a boolean`);
  return value;
}

function expectNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid ${label}: expected a finite number`);
  }
  return value;
}

function expectEditionState(value: unknown): EditionState {
  const state = expectString(value, 'edition state');
  if (!EDITION_STATE_SET.has(state)) throw new Error(`Unknown Studio 2 edition state: ${state}`);
  return state as EditionState;
}

function expectSubsystemState(value: unknown, key: keyof EditionSubsystemStates): SubsystemState {
  const state = expectString(value, `${key} subsystem state`);
  if (!SUBSYSTEM_STATE_SET.has(state)) throw new Error(`Unknown subsystem state for ${key}: ${state}`);
  return state as SubsystemState;
}

function expectSolarisCapability(value: unknown): SolarisCapability {
  const capability = expectString(value, 'capability');
  if (!SOLARIS_CAPABILITY_SET.has(capability)) {
    throw new Error(`Unknown Solaris capability: ${capability}`);
  }
  return capability as SolarisCapability;
}

function mapSubsystems(value: unknown): EditionSubsystemStates {
  const row = expectObject(value, 'edition subsystems');
  return {
    confirmations: expectSubsystemState(row.confirmations, 'confirmations'),
    submissions: expectSubsystemState(row.submissions, 'submissions'),
    juryVoting: expectSubsystemState(row.juryVoting, 'juryVoting'),
    televoting: expectSubsystemState(row.televoting, 'televoting'),
    results: expectSubsystemState(row.results, 'results'),
    predictions: expectSubsystemState(row.predictions, 'predictions'),
  };
}

export function mapStudio2RuntimeRow(value: unknown): Studio2RuntimeRecord {
  const row = expectObject(value, 'Studio 2 runtime row');
  return {
    editionId: expectString(row.edition_id, 'runtime edition id'),
    runtime: {
      edition: expectEditionState(row.state),
      subsystems: mapSubsystems(row.subsystems),
    },
    version: expectNumber(row.version, 'runtime version'),
    createdAt: expectString(row.created_at, 'runtime created_at'),
    updatedAt: expectString(row.updated_at, 'runtime updated_at'),
    updatedBy: expectNullableString(row.updated_by, 'runtime updated_by'),
  };
}

export function mapStudio2EventRow(value: unknown): ContestEvent {
  const row = expectObject(value, 'Studio 2 event row');
  const type = expectString(row.type, 'event type');
  if (!CONTEST_EVENT_TYPE_SET.has(type) || !isContestEventType(type)) {
    throw new Error(`Unknown contest event type: ${type}`);
  }

  return {
    id: expectString(row.id, 'event id'),
    editionId: expectString(row.edition_id, 'event edition id'),
    type: type as ContestEventType,
    occurredAt: expectString(row.occurred_at, 'event occurred_at'),
    actorUserId: expectNullableString(row.actor_user_id, 'event actor user id'),
    entityType: expectNullableString(row.entity_type, 'event entity type'),
    entityId: expectNullableString(row.entity_id, 'event entity id'),
    payload: expectObject(row.payload, 'event payload'),
  };
}

export function mapStudio2IncidentRow(value: unknown): Studio2IncidentRecord {
  const row = expectObject(value, 'Studio 2 incident row');
  const severity = expectString(row.severity, 'incident severity');
  const status = expectString(row.status, 'incident status');
  const category = row.category === undefined ? 'other' : expectString(row.category, 'incident category');

  if (!INCIDENT_SEVERITY_SET.has(severity)) throw new Error(`Unknown incident severity: ${severity}`);
  if (!INCIDENT_STATUS_SET.has(status)) throw new Error(`Unknown incident status: ${status}`);
  if (!INCIDENT_CATEGORY_SET.has(category)) throw new Error(`Unknown incident category: ${category}`);

  return {
    id: expectString(row.id, 'incident id'),
    editionId: expectNullableString(row.edition_id, 'incident edition id'),
    title: expectString(row.title, 'incident title'),
    severity: severity as IncidentSeverity,
    category: category as IncidentCategory,
    status: status as IncidentStatus,
    affectedSystems: expectStringArray(row.affected_systems, 'incident affected systems'),
    description: row.description === undefined ? '' : String(row.description ?? ''),
    commanderId: expectNullableString(row.commander_id, 'incident commander id'),
    acknowledgedAt: expectNullableString(row.acknowledged_at, 'incident acknowledged_at'),
    acknowledgedBy: expectNullableString(row.acknowledged_by, 'incident acknowledged_by'),
    resolution: expectNullableString(row.resolution, 'incident resolution'),
    postmortem: expectNullableString(row.postmortem, 'incident postmortem'),
    crisisDeclaredAt: expectNullableString(row.crisis_declared_at, 'incident crisis_declared_at'),
    crisisDeclaredBy: expectNullableString(row.crisis_declared_by, 'incident crisis_declared_by'),
    startedAt: expectString(row.started_at, 'incident started_at'),
    resolvedAt: expectNullableString(row.resolved_at, 'incident resolved_at'),
    createdBy: expectNullableString(row.created_by, 'incident created_by'),
    updatedBy: expectNullableString(row.updated_by, 'incident updated_by'),
    createdAt: expectString(row.created_at, 'incident created_at'),
    updatedAt: expectString(row.updated_at, 'incident updated_at'),
  };
}

export function mapStudio2CapabilityGrantRow(value: unknown): Studio2CapabilityGrantRecord {
  const row = expectObject(value, 'Studio 2 capability grant row');
  return {
    id: expectString(row.id, 'capability grant id'),
    userId: expectString(row.user_id, 'capability grant user id'),
    capability: expectSolarisCapability(row.capability),
    editionId: expectNullableString(row.edition_id, 'capability grant edition id'),
    expiresAt: expectNullableString(row.expires_at, 'capability grant expires_at'),
    grantedBy: expectNullableString(row.granted_by, 'capability grant granted_by'),
    createdAt: expectString(row.created_at, 'capability grant created_at'),
  };
}

export function mapStudio2TransitionApproval(value: unknown): Studio2TransitionApprovalRecord {
  const row = expectObject(value, 'Studio 2 transition approval');
  return {
    id: expectString(row.id, 'transition approval id'),
    editionId: expectString(row.editionId, 'transition approval edition id'),
    from: expectEditionState(row.from),
    to: expectEditionState(row.to),
    reason: expectString(row.reason, 'transition approval reason'),
    requestedBy: expectString(row.requestedBy, 'transition approval requester'),
    requestedAt: expectString(row.requestedAt, 'transition approval requested_at'),
    expiresAt: expectString(row.expiresAt, 'transition approval expires_at'),
    approvedBy: expectNullableString(row.approvedBy, 'transition approval approver'),
    approvedAt: expectNullableString(row.approvedAt, 'transition approval approved_at'),
    canApprove: expectBoolean(row.canApprove, 'transition approval canApprove'),
    canApply: expectBoolean(row.canApply, 'transition approval canApply'),
  };
}

function throwIfError(error: unknown): void {
  if (error) throw error;
}

export function createStudio2Persistence(client: Studio2SupabaseClient) {
  return {
    async loadEditionRuntime(editionId: string): Promise<Studio2RuntimeRecord | null> {
      const { data, error } = await client
        .from('studio2_edition_runtime')
        .select('*')
        .eq('edition_id', editionId)
        .maybeSingle();
      throwIfError(error);
      return data ? mapStudio2RuntimeRow(data) : null;
    },

    async transitionEdition(request: Studio2TransitionEditionRequest): Promise<Studio2RuntimeRecord> {
      const { data, error } = await client.rpc('studio2_transition_edition_v2', {
        p_edition_id: request.editionId,
        p_to: request.to,
        p_reason: request.reason ?? null,
        p_approval_request_id: request.approvalRequestId ?? null,
      });
      throwIfError(error);
      return mapStudio2RuntimeRow(data);
    },

    async listTransitionApprovals(editionId: string): Promise<Studio2TransitionApprovalRecord[]> {
      const { data, error } = await client.rpc('studio2_list_transition_approvals', {
        p_edition_id: editionId,
      });
      throwIfError(error);
      return Array.isArray(data) ? data.map(mapStudio2TransitionApproval) : [];
    },

    async requestTransitionApproval(editionId: string, to: EditionState, reason: string): Promise<void> {
      const { error } = await client.rpc('studio2_request_transition_approval', {
        p_edition_id: editionId,
        p_to: to,
        p_reason: reason,
      });
      throwIfError(error);
    },

    async approveTransition(requestId: string): Promise<void> {
      const { error } = await client.rpc('studio2_approve_transition', {
        p_request_id: requestId,
      });
      throwIfError(error);
    },

    async listEditionEvents(editionId: string, limit = 50): Promise<ContestEvent[]> {
      const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
      const { data, error } = await client
        .from('studio2_contest_events')
        .select('*')
        .eq('edition_id', editionId)
        .order('occurred_at', { ascending: false })
        .limit(safeLimit);
      throwIfError(error);
      return Array.isArray(data) ? data.map(mapStudio2EventRow) : [];
    },

    async listIncidents(editionId?: string | null): Promise<Studio2IncidentRecord[]> {
      let query = client.from('studio2_incidents').select('*');
      if (editionId) query = query.eq('edition_id', editionId);
      else if (editionId === null) query = query.is('edition_id', null);
      const { data, error } = await query.order('started_at', { ascending: false });
      throwIfError(error);
      return Array.isArray(data) ? data.map(mapStudio2IncidentRow) : [];
    },

    async listActiveIncidents(editionId?: string | null): Promise<Studio2IncidentRecord[]> {
      const incidents = await this.listIncidents(editionId);
      return incidents.filter((incident) => incident.status !== 'resolved');
    },

    async createIncident(request: Studio2CreateIncidentRequest): Promise<Studio2IncidentRecord> {
      const { data, error } = await client.rpc('studio2_create_incident', {
        p_edition_id: request.editionId,
        p_title: request.title,
        p_severity: request.severity,
      });
      throwIfError(error);
      return mapStudio2IncidentRow(data);
    },

    async createIncidentFull(request: Studio2CreateIncidentFullRequest): Promise<Studio2IncidentRecord> {
      const { data, error } = await client.rpc('studio2_create_incident_v2', {
        p_edition_id: request.editionId,
        p_title: request.title,
        p_severity: request.severity,
        p_category: request.category,
        p_description: request.description,
        p_affected_systems: request.affectedSystems,
      });
      throwIfError(error);
      return mapStudio2IncidentRow(data);
    },

    async updateIncident(request: Studio2UpdateIncidentRequest): Promise<Studio2IncidentRecord> {
      const { data, error } = await client.rpc('studio2_update_incident', {
        p_incident_id: request.id,
        p_title: request.title ?? null,
        p_severity: request.severity ?? null,
        p_category: request.category ?? null,
        p_description: request.description ?? null,
        p_affected_systems: request.affectedSystems ?? null,
        p_commander_id: request.commanderId ?? null,
        p_set_commander: request.setCommander ?? false,
        p_resolution: request.resolution ?? null,
        p_postmortem: request.postmortem ?? null,
      });
      throwIfError(error);
      return mapStudio2IncidentRow(data);
    },

    async acknowledgeIncident(id: string): Promise<Studio2IncidentRecord> {
      const { data, error } = await client.rpc('studio2_acknowledge_incident', { p_incident_id: id });
      throwIfError(error);
      return mapStudio2IncidentRow(data);
    },

    async declareIncidentCrisis(id: string): Promise<Studio2IncidentRecord> {
      const { data, error } = await client.rpc('studio2_declare_incident_crisis', { p_incident_id: id });
      throwIfError(error);
      return mapStudio2IncidentRow(data);
    },

    async addIncidentTimelineEvent(id: string, message: string): Promise<void> {
      const { error } = await client.rpc('studio2_add_incident_timeline_event', {
        p_incident_id: id,
        p_message: message,
      });
      throwIfError(error);
    },

    async transitionIncident(id: string, to: IncidentStatus): Promise<Studio2IncidentRecord> {
      const { data, error } = await client.rpc('studio2_transition_incident', {
        p_incident_id: id,
        p_to: to,
      });
      throwIfError(error);
      return mapStudio2IncidentRow(data);
    },

    async listMyCapabilityGrants(editionId?: string | null): Promise<Studio2CapabilityGrantRecord[]> {
      let query = client.from('studio2_capability_grants').select('*');
      if (editionId) query = query.eq('edition_id', editionId);
      else if (editionId === null) query = query.is('edition_id', null);
      const { data, error } = await query.order('created_at', { ascending: false });
      throwIfError(error);
      return Array.isArray(data) ? data.map(mapStudio2CapabilityGrantRow) : [];
    },

    async grantCapability(request: Studio2GrantCapabilityRequest): Promise<Studio2CapabilityGrantRecord> {
      const { data, error } = await client.rpc('studio2_grant_capability', {
        p_user_id: request.userId,
        p_capability: request.capability,
        p_edition_id: request.editionId ?? null,
        p_expires_at: request.expiresAt ?? null,
      });
      throwIfError(error);
      return mapStudio2CapabilityGrantRow(data);
    },

    async revokeCapability(
      userId: string,
      capability: SolarisCapability,
      editionId?: string | null,
    ): Promise<boolean> {
      const { data, error } = await client.rpc('studio2_revoke_capability', {
        p_user_id: userId,
        p_capability: capability,
        p_edition_id: editionId ?? null,
      });
      throwIfError(error);
      return data === true;
    },
  };
}

export const studio2Persistence = createStudio2Persistence(
  supabase as unknown as Studio2SupabaseClient,
);
