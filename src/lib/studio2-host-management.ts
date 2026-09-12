import { supabase } from '@/integrations/supabase/client';

export const HOST_BID_STATUSES = [
  'draft',
  'submitted',
  'eligible',
  'shortlisted',
  'selected',
  'rejected',
  'withdrawn',
  'superseded',
] as const;

export const HOST_EVALUATION_CRITERIA = [
  'technical',
  'venue',
  'transport',
  'accommodation',
  'security',
  'cost',
  'broadcaster',
  'accessibility',
  'sustainability',
] as const;

export const HOST_READINESS_KEYS = [
  'venueConfirmed',
  'contractsReady',
  'stageAccessReady',
  'technicalReady',
  'accreditationReady',
  'hotelsReady',
  'transportReady',
  'securityReady',
  'rehearsalsReady',
  'pressCentreReady',
  'accessibilityReady',
  'ceremoniesReady',
] as const;

export const HOST_OPERATION_ACTIONS = [
  'create_bid',
  'update_bid',
  'submit_bid',
  'mark_eligible',
  'shortlist_bid',
  'reject_bid',
  'withdraw_bid',
  'select_bid',
  'evaluate_bid',
  'update_operations',
  'set_show_host',
  'sync_show_hosts',
] as const;

export type HostBidStatus = (typeof HOST_BID_STATUSES)[number];
export type HostEvaluationCriterion = (typeof HOST_EVALUATION_CRITERIA)[number];
export type HostReadinessKey = (typeof HOST_READINESS_KEYS)[number];
export type HostOperationAction = (typeof HOST_OPERATION_ACTIONS)[number];

export type HostBidEvaluation = {
  criterion: HostEvaluationCriterion;
  score: number;
  comment: string | null;
  evaluatorUserId: string;
  updatedAt: string;
};

export type HostBid = {
  id: string;
  editionId: string;
  countryId: string;
  countryName: string;
  city: string;
  venueName: string;
  venueCapacity: number | null;
  venueAddress: string | null;
  airportSummary: string | null;
  transportSummary: string | null;
  accommodationBeds: number | null;
  productionSummary: string | null;
  sustainabilitySummary: string | null;
  accessibilitySummary: string | null;
  localBroadcaster: string | null;
  timezone: string | null;
  latitude: number | null;
  longitude: number | null;
  supportingLinks: string[];
  status: HostBidStatus;
  revision: number;
  submittedAt: string | null;
  selectedAt: string | null;
  createdAt: string;
  updatedAt: string;
  evaluationCount: number;
  averageScore: number | null;
  evaluations: HostBidEvaluation[];
};

export type HostOperationsReadiness = Record<HostReadinessKey, boolean>;

export type HostOperations = {
  editionId: string;
  selectedBidId: string;
  revision: number;
  readiness: HostOperationsReadiness;
  notes: string | null;
  updatedAt: string;
};

export type HostShowAssignment = {
  showId: string;
  showName: string;
  showKind: string;
  sortOrder: number;
  hostCountryId: string | null;
  hostCountryName: string | null;
  hostCity: string | null;
  effectiveCountryId: string | null;
  effectiveCity: string | null;
};

export type HostManagementSnapshot = {
  edition: {
    id: string;
    name: string;
    slug: string;
    hostCountryId: string | null;
    hostCity: string | null;
  };
  bids: HostBid[];
  operations: HostOperations | null;
  shows: HostShowAssignment[];
};

export type HostOperationExecution = {
  executionId: string;
  editionId: string;
  bidId: string | null;
  action: HostOperationAction;
  reason: string;
  bidRevision: number | null;
  operationsRevision: number | null;
  idempotentReplay: boolean;
};

export type HostBidInput = {
  countryId: string;
  city: string;
  venueName: string;
  venueCapacity?: number | null;
  venueAddress?: string | null;
  airportSummary?: string | null;
  transportSummary?: string | null;
  accommodationBeds?: number | null;
  productionSummary?: string | null;
  sustainabilitySummary?: string | null;
  accessibilitySummary?: string | null;
  localBroadcaster?: string | null;
  timezone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  supportingLinks?: string[];
};

type RpcClient = {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

const rpcClient = supabase as unknown as RpcClient;

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${label}`);
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`Invalid ${label}`);
  return value;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function numberValue(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid ${label}`);
  return parsed;
}

function nullableNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function boolValue(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`Invalid ${label}`);
  return value;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && Boolean(item));
}

function parseEvaluation(value: unknown): HostBidEvaluation {
  const row = object(value, 'host bid evaluation');
  if (!HOST_EVALUATION_CRITERIA.includes(row.criterion as HostEvaluationCriterion)) {
    throw new Error('Invalid host evaluation criterion');
  }
  return {
    criterion: row.criterion as HostEvaluationCriterion,
    score: numberValue(row.score, 'host evaluation score'),
    comment: nullableString(row.comment),
    evaluatorUserId: stringValue(row.evaluatorUserId, 'host evaluator user id'),
    updatedAt: stringValue(row.updatedAt, 'host evaluation updated at'),
  };
}

export function parseHostBid(value: unknown): HostBid {
  const row = object(value, 'host bid');
  if (!HOST_BID_STATUSES.includes(row.status as HostBidStatus)) throw new Error('Invalid host bid status');
  return {
    id: stringValue(row.id, 'host bid id'),
    editionId: stringValue(row.editionId, 'host bid edition id'),
    countryId: stringValue(row.countryId, 'host bid country id'),
    countryName: stringValue(row.countryName, 'host bid country name'),
    city: stringValue(row.city, 'host bid city'),
    venueName: stringValue(row.venueName, 'host bid venue name'),
    venueCapacity: nullableNumber(row.venueCapacity),
    venueAddress: nullableString(row.venueAddress),
    airportSummary: nullableString(row.airportSummary),
    transportSummary: nullableString(row.transportSummary),
    accommodationBeds: nullableNumber(row.accommodationBeds),
    productionSummary: nullableString(row.productionSummary),
    sustainabilitySummary: nullableString(row.sustainabilitySummary),
    accessibilitySummary: nullableString(row.accessibilitySummary),
    localBroadcaster: nullableString(row.localBroadcaster),
    timezone: nullableString(row.timezone),
    latitude: nullableNumber(row.latitude),
    longitude: nullableNumber(row.longitude),
    supportingLinks: stringArray(row.supportingLinks),
    status: row.status as HostBidStatus,
    revision: numberValue(row.revision, 'host bid revision'),
    submittedAt: nullableString(row.submittedAt),
    selectedAt: nullableString(row.selectedAt),
    createdAt: stringValue(row.createdAt, 'host bid created at'),
    updatedAt: stringValue(row.updatedAt, 'host bid updated at'),
    evaluationCount: numberValue(row.evaluationCount ?? 0, 'host bid evaluation count'),
    averageScore: nullableNumber(row.averageScore),
    evaluations: Array.isArray(row.evaluations) ? row.evaluations.map(parseEvaluation) : [],
  };
}

function parseReadiness(value: unknown): HostOperationsReadiness {
  const row = object(value, 'host readiness');
  return HOST_READINESS_KEYS.reduce((acc, key) => {
    acc[key] = boolValue(row[key], `host readiness ${key}`);
    return acc;
  }, {} as HostOperationsReadiness);
}

function parseOperations(value: unknown): HostOperations {
  const row = object(value, 'host operations');
  return {
    editionId: stringValue(row.editionId, 'host operations edition id'),
    selectedBidId: stringValue(row.selectedBidId, 'selected host bid id'),
    revision: numberValue(row.revision, 'host operations revision'),
    readiness: parseReadiness(row.readiness),
    notes: nullableString(row.notes),
    updatedAt: stringValue(row.updatedAt, 'host operations updated at'),
  };
}

function parseShowAssignment(value: unknown): HostShowAssignment {
  const row = object(value, 'host show assignment');
  return {
    showId: stringValue(row.showId, 'host show id'),
    showName: stringValue(row.showName, 'host show name'),
    showKind: stringValue(row.showKind, 'host show kind'),
    sortOrder: numberValue(row.sortOrder, 'host show sort order'),
    hostCountryId: nullableString(row.hostCountryId),
    hostCountryName: nullableString(row.hostCountryName),
    hostCity: nullableString(row.hostCity),
    effectiveCountryId: nullableString(row.effectiveCountryId),
    effectiveCity: nullableString(row.effectiveCity),
  };
}

export function parseHostManagementSnapshot(value: unknown): HostManagementSnapshot {
  const root = object(value, 'host management snapshot');
  const edition = object(root.edition, 'host management edition');
  return {
    edition: {
      id: stringValue(edition.id, 'host edition id'),
      name: stringValue(edition.name, 'host edition name'),
      slug: stringValue(edition.slug, 'host edition slug'),
      hostCountryId: nullableString(edition.hostCountryId),
      hostCity: nullableString(edition.hostCity),
    },
    bids: Array.isArray(root.bids) ? root.bids.map(parseHostBid) : [],
    operations: root.operations ? parseOperations(root.operations) : null,
    shows: Array.isArray(root.shows) ? root.shows.map(parseShowAssignment) : [],
  };
}

function parseExecution(value: unknown): HostOperationExecution {
  const row = object(value, 'host operation execution');
  if (!HOST_OPERATION_ACTIONS.includes(row.action as HostOperationAction)) throw new Error('Invalid host operation action');
  return {
    executionId: stringValue(row.executionId, 'host execution id'),
    editionId: stringValue(row.editionId, 'host execution edition id'),
    bidId: nullableString(row.bidId),
    action: row.action as HostOperationAction,
    reason: stringValue(row.reason, 'host execution reason'),
    bidRevision: nullableNumber(row.bidRevision),
    operationsRevision: nullableNumber(row.operationsRevision),
    idempotentReplay: boolValue(row.idempotentReplay, 'host execution replay state'),
  };
}

async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await rpcClient.rpc(name, args);
  if (error) throw error;
  return data;
}

export async function loadStudio2HostManagement(editionId: string): Promise<HostManagementSnapshot> {
  if (!editionId) throw new Error('Edition is required.');
  const data = await rpc('studio2_host_management_snapshot', { p_edition_id: editionId });
  return parseHostManagementSnapshot(data);
}

export async function executeStudio2HostOperation(input: {
  editionId: string;
  action: HostOperationAction;
  reason: string;
  executionId: string;
  bidId?: string | null;
  expectedRevision?: number | null;
  payload?: Record<string, unknown>;
}): Promise<HostOperationExecution> {
  const reason = input.reason.trim();
  if (!input.editionId) throw new Error('Edition is required.');
  if (!HOST_OPERATION_ACTIONS.includes(input.action)) throw new Error('Unsupported host operation.');
  if (reason.length < 5) throw new Error('An audit reason of at least 5 characters is required.');
  if (!input.executionId) throw new Error('Execution id is required.');
  if (input.expectedRevision != null && (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1)) {
    throw new Error('Expected host revision is invalid.');
  }

  const data = await rpc('studio2_execute_host_operation', {
    p_edition_id: input.editionId,
    p_action: input.action,
    p_reason: reason,
    p_execution_id: input.executionId,
    p_bid_id: input.bidId ?? null,
    p_expected_revision: input.expectedRevision ?? null,
    p_payload: input.payload ?? {},
  });
  return parseExecution(data);
}

export function hostBidStatusLabel(status: HostBidStatus): string {
  switch (status) {
    case 'draft': return 'Draft';
    case 'submitted': return 'Submitted';
    case 'eligible': return 'Eligible';
    case 'shortlisted': return 'Shortlisted';
    case 'selected': return 'Selected host';
    case 'rejected': return 'Rejected';
    case 'withdrawn': return 'Withdrawn';
    case 'superseded': return 'Superseded';
  }
}

export function hostBidStatusTone(status: HostBidStatus): 'neutral' | 'info' | 'attention' | 'ready' | 'blocked' {
  switch (status) {
    case 'draft': return 'neutral';
    case 'submitted': return 'info';
    case 'eligible': return 'ready';
    case 'shortlisted': return 'ready';
    case 'selected': return 'ready';
    case 'rejected': return 'blocked';
    case 'withdrawn': return 'neutral';
    case 'superseded': return 'neutral';
  }
}

export function hostOperationLabel(action: HostOperationAction): string {
  switch (action) {
    case 'create_bid': return 'Create host bid';
    case 'update_bid': return 'Save host bid';
    case 'submit_bid': return 'Submit bid';
    case 'mark_eligible': return 'Mark eligible';
    case 'shortlist_bid': return 'Shortlist bid';
    case 'reject_bid': return 'Reject bid';
    case 'withdraw_bid': return 'Withdraw bid';
    case 'select_bid': return 'Select host';
    case 'evaluate_bid': return 'Save evaluation';
    case 'update_operations': return 'Update host readiness';
    case 'set_show_host': return 'Update show host';
    case 'sync_show_hosts': return 'Use selected host for every show';
  }
}

export function availableHostBidActions(bid: HostBid): HostOperationAction[] {
  switch (bid.status) {
    case 'draft': return ['update_bid', 'submit_bid', 'withdraw_bid'];
    case 'submitted': return ['update_bid', 'evaluate_bid', 'mark_eligible', 'reject_bid', 'withdraw_bid'];
    case 'eligible': return ['update_bid', 'evaluate_bid', 'shortlist_bid', 'select_bid', 'reject_bid', 'withdraw_bid'];
    case 'shortlisted': return ['update_bid', 'evaluate_bid', 'select_bid', 'reject_bid', 'withdraw_bid'];
    case 'selected':
    case 'rejected':
    case 'withdrawn':
    case 'superseded':
      return [];
  }
}

export function hostReadinessProgress(operations: HostOperations | null): { ready: number; total: number; percent: number } {
  const total = HOST_READINESS_KEYS.length;
  if (!operations) return { ready: 0, total, percent: 0 };
  const ready = HOST_READINESS_KEYS.filter((key) => operations.readiness[key]).length;
  return { ready, total, percent: Math.round((ready / total) * 100) };
}

export function summarizeStudio2HostManagement(snapshot: HostManagementSnapshot) {
  return {
    bids: snapshot.bids.length,
    submitted: snapshot.bids.filter((bid) => ['submitted', 'eligible', 'shortlisted', 'selected'].includes(bid.status)).length,
    eligible: snapshot.bids.filter((bid) => ['eligible', 'shortlisted', 'selected'].includes(bid.status)).length,
    shortlisted: snapshot.bids.filter((bid) => bid.status === 'shortlisted').length,
    selected: snapshot.bids.find((bid) => bid.status === 'selected') ?? null,
    readiness: hostReadinessProgress(snapshot.operations),
  };
}
