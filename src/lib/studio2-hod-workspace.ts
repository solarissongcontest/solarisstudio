import { supabase } from '@/integrations/supabase/client';

import {
  getCountryOperationalReadiness,
  type CountryOperationalReadiness,
  type CountryReadinessDeadline,
} from './country-operational-readiness';
import {
  evaluateEntryEligibility,
  type EligibilityCheck,
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
  // Media completeness is operational readiness, not entry-rule validity.
  // A missing performance link may require participant action, but it must not
  // label an otherwise valid entry as "blocked".
  requireVideo: false,
  // Legacy canonical entries do not yet carry a dedicated artwork field.
  // Do not manufacture a blocker for data the source system cannot represent.
  requireArtwork: false,
  // Organizer acceptance is a workflow/review state. Pending review must not
  // masquerade as a participant eligibility failure.
  requireBroadcasterApproval: false,
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

type CurrentEditionSummary = {
  id: string;
  name: string;
  edition_number: number | null;
  status: string;
};

/**
 * The HOD history RPC intentionally returns editions with an existing country
 * record. The active edition must still be available before a delegation has
 * submitted anything, so merge it into the archive list and keep it first.
 */
export function mergeStudio2HodEditions(
  current: CurrentEditionSummary | null,
  history: readonly Studio2HodEditionSummary[],
): Studio2HodEditionSummary[] {
  const currentSummary = current
    ? {
        id: current.id,
        name: current.name,
        editionNumber: current.edition_number,
        status: current.status,
      }
    : null;
  const byId = new Map<string, Studio2HodEditionSummary>();
  if (currentSummary) byId.set(currentSummary.id, currentSummary);
  for (const edition of history) if (!byId.has(edition.id)) byId.set(edition.id, edition);
  return [...byId.values()];
}

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
  /** Compatibility count. Solaris always has exactly one jury per country: the HOD. */
  juryMembersRequired: 1;
  juryMembersAssigned: 0 | 1;
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
  // The legacy RPC populated this field exclusively from admin_deadlines,
  // whose current contract is Organizer-only reminders. Those reminders must
  // never drive delegation readiness, even while the database migration is
  // still rolling out. Official participant windows come from PublicRound.
  const deadlines: Studio2HodDeadline[] = [];
  const reviewHistory = Array.isArray(row.reviewHistory) ? row.reviewHistory.map(mapReviewHistory) : [];
  const juryMembersRequired = expectNonNegativeInteger(
    row.juryMembersRequired,
    'jury members required',
  );
  const juryMembersAssigned = expectNonNegativeInteger(
    row.juryMembersAssigned,
    'jury members assigned',
  );

  if (juryMembersRequired !== 1) {
    throw new Error('Invalid jury members required: Solaris requires exactly one HOD jury');
  }
  if (juryMembersAssigned !== 0 && juryMembersAssigned !== 1) {
    throw new Error('Invalid jury members assigned: expected zero or one HOD');
  }
  if (juryMembers.length !== juryMembersAssigned || juryMembers.length > 1) {
    throw new Error('Invalid jury member projection: expected exactly the assigned HOD');
  }

  return {
    editionId: expectString(row.editionId, 'edition id'),
    editionName: expectString(row.editionName, 'edition name'),
    countryId: expectString(row.countryId, 'country id'),
    countryName: expectString(row.countryName, 'country name'),
    confirmationComplete: expectBoolean(row.confirmationComplete, 'confirmation status'),
    participantStatus: nullableString(row.participantStatus, 'participant status'),
    publicationStatus: nullableString(row.publicationStatus, 'publication status'),
    entry: mapEntry(row.entry),
    juryMembersRequired: 1,
    juryMembersAssigned: juryMembersAssigned as 0 | 1,
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

  // Confirmation-sourced pending rows are review placeholders. Production data
  // intentionally leaves artist/song/media null until the organizer accepts the
  // submission, so treating those nulls as participant failures makes every
  // pending submission look blocked. Represent the real state instead: the
  // delegation is confirmed and the submission is waiting on Solaris.
  const isPendingConfirmationPlaceholder =
    entry?.source === 'confirmations' &&
    entry.status === 'pending' &&
    !entry.artist?.trim() &&
    !entry.songTitle?.trim() &&
    !entry.songUrl?.trim();

  if (isPendingConfirmationPlaceholder) {
    const checks: EligibilityCheck[] = [
      {
        id: 'country-confirmed',
        label: 'Country eligibility',
        level: context.confirmationComplete ? 'pass' : 'blocked',
        message: context.confirmationComplete
          ? 'Country is confirmed for the edition.'
          : 'Country is not confirmed for the edition.',
      },
      {
        id: 'organizer-review',
        label: 'Organizer review',
        level: 'warning',
        message:
          'The submitted entry is waiting for organizer review. No participant eligibility failure is recorded.',
      },
    ];
    const blockers = checks.filter((check) => check.level === 'blocked');
    const warnings = checks.filter((check) => check.level === 'warning');
    return {
      status: blockers.length ? 'blocked' : 'warning',
      score: blockers.length ? 0 : 100,
      checks,
      blockers,
      warnings,
    };
  }

  return evaluateEntryEligibility(
    {
      countryConfirmed: context.confirmationComplete,
      artistName: entry?.artist,
      songTitle: entry?.songTitle,
      videoUrl: entry?.songUrl,
      artworkUrl: null,
      broadcasterApproved: entry?.status === 'confirmed',
      duplicateEntryDetected: undefined,
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
  const pendingConfirmationEntry =
    entry?.source === 'confirmations' && entry?.status === 'pending';
  const acceptedConfirmationEntry = entry?.source === 'confirmations' && confirmedEntry;
  const reviewed =
    acceptedConfirmationEntry || metadataBoolean(metadata, 'tsbc_reviewed', 'tsbcReviewed');
  const explicitlyLocked = metadataBoolean(metadata, 'entry_locked', 'entryLocked', 'locked');

  const statuses: WorkflowTemplateStatusMap = {
    // Pending confirmation rows are review placeholders: participant-submitted
    // details live in the confirmation until acceptance. Do not ask the user to
    // re-enter fields merely because the canonical entry projection is still null.
    'entry.song-info': completed(
      pendingConfirmationEntry || Boolean(entry?.songTitle?.trim()),
    ),
    'entry.artist-info': completed(
      pendingConfirmationEntry || Boolean(entry?.artist?.trim()),
    ),
    'entry.media': completed(
      pendingConfirmationEntry || Boolean(entry?.songUrl?.trim()),
    ),
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
