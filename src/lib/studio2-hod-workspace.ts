import { supabase } from '@/integrations/supabase/client';

import {
  getCountryOperationalReadiness,
  type CountryOperationalReadiness,
  type CountryReadinessDeadline,
} from './country-operational-readiness';
import {
  evaluateEntryEligibility,
  type EligibilityConfig,
  type EligibilityResult,
} from './eligibility-engine';
import {
  buildHodWorkspaceModel,
  type HodWorkspaceModel,
  type HodWorkspaceNotice,
} from './hod-workspace-model';
import { NOTICE_SEVERITIES, type NoticeSeverity } from './official-communications';
import { evaluateWorkflow, type WorkflowSummary, type WorkflowTaskStatus } from './workflow-engine';
import { entrySubmissionWorkflow, type WorkflowTemplateStatusMap } from './workflow-templates';

const HOD_ELIGIBILITY_CONFIG: EligibilityConfig = {
  requireVideo: true,
  // Legacy canonical entries do not yet carry a dedicated artwork field.
  // Do not manufacture a blocker for data the source system cannot represent.
  requireArtwork: false,
  requireBroadcasterApproval: true,
  maxDurationSeconds: null,
  blockDuplicates: true,
};

const NOTICE_SEVERITY_SET = new Set<string>(NOTICE_SEVERITIES);

export type Studio2HodEditionSummary = {
  id: string;
  name: string;
  editionNumber: number | null;
  status: string;
};

export type Studio2HodJuryMember = {
  id: string;
  displayName: string;
  memberUserId: string | null;
  createdAt: string;
};

export type Studio2HodEntryContext = {
  id: string;
  artist: string | null;
  songTitle: string | null;
  songUrl: string | null;
  status: string | null;
  source: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type Studio2HodDeadline = CountryReadinessDeadline & {
  kind: string;
  notes: string | null;
};

export type Studio2HodReviewHistoryItem = {
  id: string;
  action: string;
  targetType: string;
  artist: string | null;
  songTitle: string | null;
  reason: string | null;
  createdAt: string;
};

export type Studio2HodContext = {
  editionId: string;
  editionName: string;
  countryId: string;
  countryName: string;
  confirmationComplete: boolean;
  participantStatus: string | null;
  publicationStatus: string | null;
  entry: Studio2HodEntryContext | null;
  juryMembersRequired: number;
  juryMembersAssigned: number;
  juryMembers: Studio2HodJuryMember[];
  juryBallotSubmitted: boolean;
  notices: HodWorkspaceNotice[];
  deadlines: Studio2HodDeadline[];
  reviewHistory: Studio2HodReviewHistoryItem[];
  unresolvedOrganizerIssues: number;
};

export type Studio2HodWorkspaceSnapshot = {
  context: Studio2HodContext;
  eligibility: EligibilityResult;
  workflow: WorkflowSummary;
  operationalReadiness: CountryOperationalReadiness;
  model: HodWorkspaceModel;
};

export type Studio2HodWorkspaceSource = {
  loadContext(editionId: string, countryId: string): Promise<Studio2HodContext>;
};

type SupabaseRpcClient = {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

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

function nullableString(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  return expectString(value, label);
}

function expectBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`Invalid ${label}: expected a boolean`);
  return value;
}

function expectNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid ${label}: expected a non-negative integer`);
  }
  return value;
}

function nullableInteger(value: unknown, label: string): number | null {
  if (value === null || value === undefined) return null;
  return expectNonNegativeInteger(value, label);
}

function mapEntry(value: unknown): Studio2HodEntryContext | null {
  if (value === null || value === undefined) return null;
  const row = expectObject(value, 'HOD entry context');
  const metadata = row.metadata == null ? {} : expectObject(row.metadata, 'HOD entry metadata');
  return {
    id: expectString(row.id, 'entry id'),
    artist: nullableString(row.artist, 'entry artist'),
    songTitle: nullableString(row.songTitle, 'entry song title'),
    songUrl: nullableString(row.songUrl, 'entry song URL'),
    status: nullableString(row.status, 'entry status'),
    source: nullableString(row.source, 'entry source'),
    metadata,
    createdAt: expectString(row.createdAt, 'entry created_at'),
    updatedAt: expectString(row.updatedAt, 'entry updated_at'),
  };
}

function mapNotice(value: unknown): HodWorkspaceNotice {
  const row = expectObject(value, 'HOD notice');
  const severity = expectString(row.severity, 'notice severity');
  if (!NOTICE_SEVERITY_SET.has(severity)) throw new Error(`Unknown notice severity: ${severity}`);

  return {
    id: expectString(row.id, 'notice id'),
    title: expectString(row.title, 'notice title'),
    severity: severity as NoticeSeverity,
    acknowledgementRequired: expectBoolean(
      row.acknowledgementRequired,
      'notice acknowledgement requirement',
    ),
    acknowledged: expectBoolean(row.acknowledged, 'notice acknowledgement state'),
  };
}

function mapJuryMember(value: unknown): Studio2HodJuryMember {
  const row = expectObject(value, 'HOD jury member');
  return {
    id: expectString(row.id, 'jury member id'),
    displayName: expectString(row.displayName, 'jury member display name'),
    memberUserId: nullableString(row.memberUserId, 'jury member user id'),
    createdAt: expectString(row.createdAt, 'jury member created_at'),
  };
}

function mapDeadline(value: unknown): Studio2HodDeadline {
  const row = expectObject(value, 'HOD deadline');
  return {
    id: expectString(row.id, 'deadline id'),
    kind: expectString(row.kind, 'deadline kind'),
    label: expectString(row.label, 'deadline label'),
    dueAt: expectString(row.dueAt, 'deadline due_at'),
    completedAt: nullableString(row.completedAt, 'deadline completed_at'),
    notes: nullableString(row.notes, 'deadline notes'),
  };
}

function mapReviewHistory(value: unknown): Studio2HodReviewHistoryItem {
  const row = expectObject(value, 'HOD review history item');
  return {
    id: expectString(row.id, 'review history id'),
    action: expectString(row.action, 'review action'),
    targetType: expectString(row.targetType, 'review target type'),
    artist: nullableString(row.artist, 'review artist'),
    songTitle: nullableString(row.songTitle, 'review song title'),
    reason: nullableString(row.reason, 'review reason'),
    createdAt: expectString(row.createdAt, 'review created_at'),
  };
}

function mapEditionSummary(value: unknown): Studio2HodEditionSummary {
  const row = expectObject(value, 'HOD edition summary');
  return {
    id: expectString(row.id, 'edition id'),
    name: expectString(row.name, 'edition name'),
    editionNumber: nullableInteger(row.editionNumber, 'edition number'),
    status: expectString(row.status, 'edition status'),
  };
}

export function mapStudio2HodContext(value: unknown): Studio2HodContext {
  const row = expectObject(value, 'Studio 2 HOD context');
  const notices = Array.isArray(row.notices) ? row.notices.map(mapNotice) : [];
  const juryMembers = Array.isArray(row.juryMembers) ? row.juryMembers.map(mapJuryMember) : [];
  const deadlines = Array.isArray(row.deadlines) ? row.deadlines.map(mapDeadline) : [];
  const reviewHistory = Array.isArray(row.reviewHistory) ? row.reviewHistory.map(mapReviewHistory) : [];
  const juryMembersRequired = expectNonNegativeInteger(
    row.juryMembersRequired,
    'jury members required',
  );

  if (juryMembersRequired < 1) throw new Error('Invalid jury members required: expected at least one');

  return {
    editionId: expectString(row.editionId, 'edition id'),
    editionName: expectString(row.editionName, 'edition name'),
    countryId: expectString(row.countryId, 'country id'),
    countryName: expectString(row.countryName, 'country name'),
    confirmationComplete: expectBoolean(row.confirmationComplete, 'confirmation status'),
    participantStatus: nullableString(row.participantStatus, 'participant status'),
    publicationStatus: nullableString(row.publicationStatus, 'publication status'),
    entry: mapEntry(row.entry),
    juryMembersRequired,
    juryMembersAssigned: expectNonNegativeInteger(row.juryMembersAssigned, 'jury members assigned'),
    juryMembers,
    juryBallotSubmitted: expectBoolean(row.juryBallotSubmitted, 'jury ballot state'),
    notices,
    deadlines,
    reviewHistory,
    unresolvedOrganizerIssues: expectNonNegativeInteger(
      row.unresolvedOrganizerIssues,
      'unresolved organizer issues',
    ),
  };
}

export function createStudio2HodWorkspaceSource(client: SupabaseRpcClient): Studio2HodWorkspaceSource {
  return {
    async loadContext(editionId: string, countryId: string): Promise<Studio2HodContext> {
      const { data, error } = await client.rpc('studio2_hod_context', {
        p_edition_id: editionId,
        p_country_id: countryId,
      });
      if (error) throw error;
      return mapStudio2HodContext(data);
    },
  };
}

async function runRpc(
  name: string,
  args: Record<string, unknown>,
  client: SupabaseRpcClient = supabase as unknown as SupabaseRpcClient,
): Promise<unknown> {
  const { data, error } = await client.rpc(name, args);
  if (error) throw error;
  return data;
}

export async function listStudio2HodEditions(
  countryId: string,
  client: SupabaseRpcClient = supabase as unknown as SupabaseRpcClient,
): Promise<Studio2HodEditionSummary[]> {
  const data = await runRpc('studio2_hod_editions', { p_country_id: countryId }, client);
  return Array.isArray(data) ? data.map(mapEditionSummary) : [];
}

export async function acknowledgeStudio2Notice(
  noticeId: string,
  client: SupabaseRpcClient = supabase as unknown as SupabaseRpcClient,
): Promise<void> {
  await runRpc('studio2_acknowledge_notice', { p_notice_id: noticeId }, client);
}

function completed(condition: boolean): WorkflowTaskStatus {
  return condition ? 'completed' : 'pending';
}

function metadataBoolean(metadata: Record<string, unknown>, ...keys: string[]): boolean {
  return keys.some((key) => metadata[key] === true);
}

export function deriveHodEligibility(context: Studio2HodContext): EligibilityResult {
  const entry = context.entry;
  return evaluateEntryEligibility(
    {
      countryConfirmed: context.confirmationComplete,
      artistName: entry?.artist,
      songTitle: entry?.songTitle,
      videoUrl: entry?.songUrl,
      artworkUrl: null,
      broadcasterApproved: entry?.status === 'confirmed',
      duplicateEntryDetected: false,
      // Operational deadlines are evaluated once by the shared country readiness
      // model below; eligibility must not invent a second deadline algorithm.
      deadlinePassed: false,
      editingExceptionGranted: false,
    },
    HOD_ELIGIBILITY_CONFIG,
  );
}

export function deriveHodEntryWorkflow(
  context: Studio2HodContext,
  eligibility = deriveHodEligibility(context),
): WorkflowSummary {
  const entry = context.entry;
  const metadata = entry?.metadata ?? {};
  const confirmedEntry = entry?.status === 'confirmed';
  const acceptedConfirmationEntry = entry?.source === 'confirmations' && confirmedEntry;
  const reviewed =
    acceptedConfirmationEntry || metadataBoolean(metadata, 'tsbc_reviewed', 'tsbcReviewed');
  const explicitlyLocked = metadataBoolean(metadata, 'entry_locked', 'entryLocked', 'locked');

  const statuses: WorkflowTemplateStatusMap = {
    'entry.song-info': completed(Boolean(entry?.songTitle?.trim())),
    'entry.artist-info': completed(Boolean(entry?.artist?.trim())),
    'entry.media': completed(Boolean(entry?.songUrl?.trim())),
    'entry.eligibility': completed(eligibility.status !== 'blocked'),
    'entry.broadcaster-approval': completed(confirmedEntry),
    'entry.tsbc-review': completed(reviewed),
    // Legacy confirmation sync has no independent lock column. Prefer an
    // explicit metadata marker, but treat a reviewed confirmed entry that has
    // already been published as effectively locked for compatibility.
    'entry.lock': completed(
      explicitlyLocked || (reviewed && context.publicationStatus === 'published'),
    ),
  };

  return evaluateWorkflow(entrySubmissionWorkflow(statuses));
}

export function buildStudio2HodWorkspaceSnapshot(context: Studio2HodContext): Studio2HodWorkspaceSnapshot {
  const eligibility = deriveHodEligibility(context);
  const workflow = deriveHodEntryWorkflow(context, eligibility);
  const operationalReadiness = getCountryOperationalReadiness({
    participationConfirmed: context.confirmationComplete,
    entryPresent: Boolean(context.entry),
    entryEligibility: eligibility,
    entryApproved: context.entry?.status === 'confirmed',
    mediaAvailable: Boolean(context.entry?.songUrl?.trim()),
    juryComplete: context.juryMembersAssigned >= context.juryMembersRequired,
    deadlines: context.deadlines,
    unresolvedOrganizerIssues: context.unresolvedOrganizerIssues,
  });
  const model = buildHodWorkspaceModel({
    editionId: context.editionId,
    editionName: context.editionName,
    countryId: context.countryId,
    countryName: context.countryName,
    confirmationComplete: context.confirmationComplete,
    entryEligibility: eligibility,
    entryWorkflow: workflow,
    juryMembersRequired: context.juryMembersRequired,
    juryMembersAssigned: context.juryMembersAssigned,
    juryBallotSubmitted: context.juryBallotSubmitted,
    notices: context.notices,
    operationalReadiness,
  });

  return { context, eligibility, workflow, operationalReadiness, model };
}

export async function loadStudio2HodWorkspace(
  editionId: string,
  countryId: string,
  source: Studio2HodWorkspaceSource = studio2HodWorkspaceSource,
): Promise<Studio2HodWorkspaceSnapshot> {
  const context = await source.loadContext(editionId, countryId);
  return buildStudio2HodWorkspaceSnapshot(context);
}

export const studio2HodWorkspaceSource = createStudio2HodWorkspaceSource(
  supabase as unknown as SupabaseRpcClient,
);
