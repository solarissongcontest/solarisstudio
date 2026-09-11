import { supabase } from '@/integrations/supabase/client';

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
  artist: string | null;
  songTitle: string | null;
  songUrl: string | null;
  status: string | null;
  source: string | null;
  metadata: Record<string, unknown>;
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
};

export type Studio2HodWorkspaceSnapshot = {
  context: Studio2HodContext;
  eligibility: EligibilityResult;
  workflow: WorkflowSummary;
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
    artist: nullableString(row.artist, 'entry artist'),
    songTitle: nullableString(row.songTitle, 'entry song title'),
    songUrl: nullableString(row.songUrl, 'entry song URL'),
    status: nullableString(row.status, 'entry status'),
    source: nullableString(row.source, 'entry source'),
    metadata,
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

export async function assignStudio2JuryMember(
  editionId: string,
  countryId: string,
  displayName: string,
  client: SupabaseRpcClient = supabase as unknown as SupabaseRpcClient,
): Promise<void> {
  await runRpc(
    'studio2_assign_jury_member',
    {
      p_edition_id: editionId,
      p_country_id: countryId,
      p_display_name: displayName,
      p_member_user_id: null,
    },
    client,
  );
}

export async function removeStudio2JuryMember(
  memberId: string,
  client: SupabaseRpcClient = supabase as unknown as SupabaseRpcClient,
): Promise<void> {
  await runRpc('studio2_remove_jury_member', { p_member_id: memberId }, client);
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
  });

  return { context, eligibility, workflow, model };
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
