import { supabase } from '@/integrations/supabase/client';
import {
  summarizeNoticeReceipts,
  validateOfficialNotice,
  validateOperationalNotice,
  noticeInboxState,
  type NoticeAudience,
  type NoticeDisplaySurface,
  type NoticeEditionGroup,
  type NoticeInboxState,
  type NoticeReceipt,
  type NoticeRevision,
  type NoticeSeverity,
  type NoticeState,
  type NoticeType,
  type OfficialNotice,
  type OperationalNotice,
} from './official-communications';
import { isStudio2FeatureEnabled } from './studio2-feature-flags';

type SupabaseResult = PromiseLike<{ data: unknown; error: unknown }>;
type QueryBuilder = {
  select(columns: string): QueryBuilder;
  eq(column: string, value: unknown): QueryBuilder;
  in(column: string, values: readonly unknown[]): QueryBuilder;
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): QueryBuilder;
  then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2>;
};
type CommunicationsClient = {
  from(table: string): QueryBuilder;
  rpc(name: string, args?: Record<string, unknown>): SupabaseResult;
};

const client = supabase as unknown as CommunicationsClient;

type NoticeRow = {
  id: string;
  edition_id: string | null;
  notice_type?: NoticeType | null;
  title: string;
  body: string;
  severity: NoticeSeverity;
  audience: NoticeAudience;
  audience_group?: NoticeEditionGroup | null;
  country_ids: string[] | null;
  acknowledgement_required: boolean;
  display_surfaces?: NoticeDisplaySurface[] | null;
  status?: NoticeState | null;
  scheduled_at?: string | null;
  sent_at: string | null;
  cancelled_at?: string | null;
  archived_at?: string | null;
  superseded_by_id?: string | null;
  revision?: number | null;
  created_at: string;
};

type ReceiptRow = {
  notice_id: string;
  recipient_user_id: string;
  delivered_at: string | null;
  opened_at: string | null;
  acknowledged_at: string | null;
  archived_at?: string | null;
};

type InboxRow = NoticeRow & {
  recipient_user_id: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  acknowledged_at: string | null;
  receipt_archived_at: string | null;
};

type RevisionRow = {
  notice_id: string;
  revision: number;
  notice_type: NoticeType;
  title: string;
  body: string;
  severity: NoticeSeverity;
  audience: NoticeAudience;
  audience_group: NoticeEditionGroup | null;
  country_ids: string[] | null;
  acknowledgement_required: boolean;
  display_surfaces?: NoticeDisplaySurface[] | null;
  status: NoticeState;
  scheduled_at: string | null;
  sent_at: string | null;
  archived_at?: string | null;
  changed_by: string | null;
  changed_at: string;
};

export type Studio2NoticeSummary = {
  notice: OperationalNotice;
  createdAt: string;
  receipts: ReturnType<typeof summarizeNoticeReceipts>;
};

export type Studio2NoticeInboxItem = {
  notice: OperationalNotice;
  receipt: NoticeReceipt | null;
  inboxState: NoticeInboxState;
};

export type SendStudio2NoticeInput = {
  editionId: string | null;
  title: string;
  body: string;
  severity: NoticeSeverity;
  audience: NoticeAudience;
  countryIds: string[];
  acknowledgementRequired: boolean;
};

export type SaveStudio2NoticeInput = SendStudio2NoticeInput & {
  noticeType: NoticeType;
  audienceGroup: NoticeEditionGroup | null;
  displaySurfaces: NoticeDisplaySurface[];
};

function asRows<T>(value: unknown, label = 'communications payload'): T[] {
  if (!Array.isArray(value)) throw new Error(`Invalid ${label}: expected an array.`);
  return value as T[];
}

function mapNotice(row: NoticeRow): OperationalNotice {
  const notice: OperationalNotice = {
    id: row.id,
    editionId: row.edition_id,
    noticeType: row.notice_type ?? 'official_notice',
    title: row.title,
    body: row.body,
    severity: row.severity,
    audience: row.audience,
    audienceGroup: row.audience_group ?? null,
    countryIds: row.country_ids ?? [],
    acknowledgementRequired: row.acknowledgement_required,
    displaySurfaces: row.display_surfaces ?? ['delegation_inbox'],
    state: row.status ?? (row.sent_at ? 'published' : 'draft'),
    scheduledAt: row.scheduled_at ?? null,
    sentAt: row.sent_at,
    cancelledAt: row.cancelled_at ?? null,
    archivedAt: row.archived_at ?? null,
    supersededById: row.superseded_by_id ?? null,
    revision: row.revision ?? 1,
  };
  if (typeof notice.id !== 'string' || !notice.id.trim()) {
    throw new Error('Official Communications returned a notice without an id.');
  }
  validateOperationalNotice(notice);
  return notice;
}

export function validateStudio2NoticeResponse(
  notice: OperationalNotice,
  expected: { noticeId?: string | null; editionId?: string | null } = {},
): OperationalNotice {
  validateOperationalNotice(notice);
  if (expected.noticeId && notice.id !== expected.noticeId) {
    throw new Error('Official Communications returned a different notice than the requested operation.');
  }
  if (expected.editionId && notice.editionId !== expected.editionId) {
    throw new Error('Official Communications returned data outside the requested edition scope.');
  }
  return notice;
}

function mapReceipt(row: ReceiptRow): NoticeReceipt {
  return {
    noticeId: row.notice_id,
    recipientUserId: row.recipient_user_id,
    deliveredAt: row.delivered_at,
    openedAt: row.opened_at,
    acknowledgedAt: row.acknowledged_at,
    archivedAt: row.archived_at ?? null,
  };
}

function mapInboxReceipt(row: InboxRow): NoticeReceipt | null {
  if (!row.recipient_user_id) return null;
  return {
    noticeId: row.id,
    recipientUserId: row.recipient_user_id,
    deliveredAt: row.delivered_at,
    openedAt: row.opened_at,
    acknowledgedAt: row.acknowledged_at,
    archivedAt: row.receipt_archived_at,
  };
}

function mapRevision(row: RevisionRow): NoticeRevision {
  return {
    noticeId: row.notice_id,
    revision: row.revision,
    noticeType: row.notice_type,
    title: row.title,
    body: row.body,
    severity: row.severity,
    audience: row.audience,
    audienceGroup: row.audience_group,
    countryIds: row.country_ids ?? [],
    acknowledgementRequired: row.acknowledgement_required,
    displaySurfaces: row.display_surfaces ?? ['delegation_inbox'],
    state: row.status,
    scheduledAt: row.scheduled_at,
    sentAt: row.sent_at,
    archivedAt: row.archived_at ?? null,
    changedAt: row.changed_at,
    changedBy: row.changed_by,
  };
}

async function requireEnabled() {
  if (!(await isStudio2FeatureEnabled('official_communications'))) {
    throw new Error('Official Communications is disabled by the Studio 2 rollout flag.');
  }
}

function requireEditionId(editionId: string | null | undefined): string {
  const normalized = editionId?.trim() ?? '';
  if (!normalized) {
    throw new Error('Official Communications requires an explicit edition scope.');
  }
  return normalized;
}

async function assertNoticeInEdition(noticeId: string, editionId: string): Promise<void> {
  await requireEnabled();
  const { data, error } = await client
    .from('studio2_official_notices')
    .select('id,edition_id')
    .eq('id', noticeId)
    .eq('edition_id', editionId);
  if (error) throw error;
  const matches = asRows<{ id: string; edition_id: string | null }>(data, 'notice edition check');
  if (matches.length !== 1) {
    throw Object.assign(
      new Error('The selected communication is outside the current edition scope.'),
      { status: 409 },
    );
  }
}

const NOTICE_COLUMNS = [
  'id', 'edition_id', 'notice_type', 'title', 'body', 'severity', 'audience',
  'audience_group', 'country_ids', 'acknowledgement_required', 'display_surfaces', 'status',
  'scheduled_at', 'sent_at', 'cancelled_at', 'archived_at', 'superseded_by_id', 'revision', 'created_at',
].join(',');

const RECEIPT_COLUMNS = 'notice_id,recipient_user_id,delivered_at,opened_at,acknowledged_at,archived_at';

export async function loadStudio2Notices(editionId?: string | null): Promise<Studio2NoticeSummary[]> {
  await requireEnabled();
  const scopedEditionId = requireEditionId(editionId);

  const noticeQuery = client
    .from('studio2_official_notices')
    .select(NOTICE_COLUMNS)
    .eq('edition_id', scopedEditionId)
    .order('created_at', { ascending: false });

  const { data: noticeData, error: noticeError } = await noticeQuery;
  if (noticeError) throw noticeError;

  const noticeRows = asRows<NoticeRow>(noticeData, 'Official Communications notice list');
  if (!noticeRows.length) return [];
  if (noticeRows.some((row) => row.edition_id !== scopedEditionId)) {
    throw new Error('Official Communications returned data outside the selected edition scope.');
  }
  const noticeIds = noticeRows.map((row) => row.id);
  if (new Set(noticeIds).size !== noticeIds.length) {
    throw new Error('Official Communications returned duplicate notice rows.');
  }

  const { data: receiptData, error: receiptError } = await client
    .from('studio2_notice_receipts')
    .select(RECEIPT_COLUMNS)
    .in('notice_id', noticeIds);

  if (receiptError) throw receiptError;
  const receiptRows = asRows<ReceiptRow>(receiptData, 'Official Communications receipt list');
  const receiptKeys = receiptRows.map((row) => `${row.notice_id}:${row.recipient_user_id}`);
  if (new Set(receiptKeys).size !== receiptKeys.length) {
    throw new Error('Official Communications returned duplicate recipient receipts.');
  }
  const receipts = receiptRows.map(mapReceipt);

  return noticeRows.map((row) => {
    const notice = mapNotice(row);
    return {
      notice,
      createdAt: row.created_at,
      receipts: summarizeNoticeReceipts(notice, receipts),
    };
  });
}

export async function loadStudio2NoticeInbox(editionId?: string | null): Promise<Studio2NoticeInboxItem[]> {
  await requireEnabled();

  const { data, error } = await client.rpc('studio2_my_notice_inbox', {
    p_edition_id: editionId ?? null,
  });
  if (error) throw error;

  return asRows<InboxRow>(data, 'Official Communications inbox').map((row) => {
    const notice = mapNotice(row);
    const receipt = mapInboxReceipt(row);
    return { notice, receipt, inboxState: noticeInboxState(notice, receipt) };
  });
}

function draftCandidate(input: SaveStudio2NoticeInput): OperationalNotice {
  return {
    id: 'pending',
    editionId: input.editionId,
    noticeType: input.noticeType,
    title: input.title,
    body: input.body,
    severity: input.severity,
    audience: input.audience,
    audienceGroup: input.audienceGroup,
    countryIds: input.countryIds,
    acknowledgementRequired: input.acknowledgementRequired,
    displaySurfaces: input.displaySurfaces,
    state: 'draft',
    scheduledAt: null,
    sentAt: null,
    cancelledAt: null,
    archivedAt: null,
    supersededById: null,
    revision: 1,
  };
}

function saveArgs(input: SaveStudio2NoticeInput) {
  const editionId = requireEditionId(input.editionId);
  const candidate = draftCandidate({ ...input, editionId });
  validateOperationalNotice(candidate);
  return {
    p_edition_id: editionId,
    p_notice_type: input.noticeType,
    p_title: input.title.trim(),
    p_body: input.body.trim(),
    p_severity: input.severity,
    p_audience: input.audience,
    p_audience_group: input.audienceGroup,
    p_country_ids: input.countryIds,
    p_acknowledgement_required: input.acknowledgementRequired,
    p_display_surfaces: input.displaySurfaces,
  };
}

async function noticeRpc(name: string, args: Record<string, unknown>): Promise<OperationalNotice> {
  await requireEnabled();
  const { data, error } = await client.rpc(name, args);
  if (error) throw error;
  return mapNotice(data as NoticeRow);
}

export async function createStudio2NoticeDraft(
  input: SaveStudio2NoticeInput,
  supersedesId: string | null = null,
): Promise<OperationalNotice> {
  const editionId = requireEditionId(input.editionId);
  const notice = await noticeRpc('studio2_create_notice_draft_v2', {
    ...saveArgs({ ...input, editionId }),
    p_supersedes_id: supersedesId,
  });
  return validateStudio2NoticeResponse(notice, { editionId });
}

export async function updateStudio2NoticeDraft(
  noticeId: string,
  input: SaveStudio2NoticeInput,
): Promise<OperationalNotice> {
  const { p_edition_id, ...args } = saveArgs(input);
  const editionId = String(p_edition_id);
  await assertNoticeInEdition(noticeId, editionId);
  const notice = await noticeRpc('studio2_update_notice_draft_v2', {
    p_notice_id: noticeId,
    ...args,
  });
  return validateStudio2NoticeResponse(notice, { noticeId, editionId });
}

export async function scheduleStudio2Notice(noticeId: string, scheduledAt: string): Promise<OperationalNotice> {
  const notice = await noticeRpc('studio2_schedule_notice', { p_notice_id: noticeId, p_scheduled_at: scheduledAt });
  return validateStudio2NoticeResponse(notice, { noticeId });
}

export async function publishStudio2Notice(noticeId: string): Promise<OperationalNotice> {
  const notice = await noticeRpc('studio2_publish_notice', { p_notice_id: noticeId });
  return validateStudio2NoticeResponse(notice, { noticeId });
}

export async function cancelStudio2Notice(noticeId: string, reason: string): Promise<OperationalNotice> {
  const notice = await noticeRpc('studio2_cancel_notice', { p_notice_id: noticeId, p_reason: reason.trim() || null });
  return validateStudio2NoticeResponse(notice, { noticeId });
}

export async function createSupersedingStudio2NoticeDraft(noticeId: string): Promise<OperationalNotice> {
  return noticeRpc('studio2_create_superseding_notice_draft', { p_notice_id: noticeId });
}

export async function archiveStudio2Communication(
  noticeId: string,
  reason: string,
): Promise<OperationalNotice> {
  const notice = await noticeRpc('studio2_archive_communication', {
    p_notice_id: noticeId,
    p_reason: reason.trim() || null,
  });
  return validateStudio2NoticeResponse(notice, { noticeId });
}

export async function restoreStudio2Communication(noticeId: string): Promise<OperationalNotice> {
  const notice = await noticeRpc('studio2_restore_communication', { p_notice_id: noticeId });
  return validateStudio2NoticeResponse(notice, { noticeId });
}

export async function deleteStudio2Communication(noticeId: string, reason: string): Promise<void> {
  await requireEnabled();
  const { error } = await client.rpc('studio2_delete_communication', {
    p_notice_id: noticeId,
    p_reason: reason.trim(),
  });
  if (error) throw error;
}

export async function loadStudio2NoticeRevisions(noticeId: string): Promise<NoticeRevision[]> {
  await requireEnabled();
  const { data, error } = await client
    .from('studio2_notice_versions')
    .select('notice_id,revision,notice_type,title,body,severity,audience,audience_group,country_ids,acknowledgement_required,display_surfaces,status,scheduled_at,sent_at,archived_at,changed_by,changed_at')
    .eq('notice_id', noticeId)
    .order('revision', { ascending: false });
  if (error) throw error;
  return asRows<RevisionRow>(data, 'Official Communications revision history').map(mapRevision);
}

export async function markStudio2NoticeOpened(noticeId: string): Promise<void> {
  await requireEnabled();
  const { error } = await client.rpc('studio2_mark_notice_opened', { p_notice_id: noticeId });
  if (error) throw error;
}

export async function archiveStudio2Notice(noticeId: string, archived = true): Promise<void> {
  await requireEnabled();
  const { error } = await client.rpc('studio2_archive_notice', { p_notice_id: noticeId, p_archived: archived });
  if (error) throw error;
}

export async function acknowledgeStudio2InboxNotice(noticeId: string): Promise<void> {
  await requireEnabled();
  const { error } = await client.rpc('studio2_acknowledge_notice', { p_notice_id: noticeId });
  if (error) throw error;
}

export async function sendStudio2Notice(input: SendStudio2NoticeInput): Promise<OfficialNotice> {
  await requireEnabled();

  const candidate: OfficialNotice = {
    id: 'pending',
    editionId: input.editionId,
    title: input.title,
    body: input.body,
    severity: input.severity,
    audience: input.audience,
    countryIds: input.countryIds,
    acknowledgementRequired: input.acknowledgementRequired,
    displaySurfaces: ['delegation_inbox'],
    sentAt: null,
  };
  validateOfficialNotice(candidate);

  const { data, error } = await client.rpc('studio2_send_notice', {
    p_edition_id: input.editionId,
    p_title: input.title.trim(),
    p_body: input.body.trim(),
    p_severity: input.severity,
    p_audience: input.audience,
    p_country_ids: input.countryIds,
    p_acknowledgement_required: input.acknowledgementRequired,
  });

  if (error) throw error;
  const notice = mapNotice(data as NoticeRow);
  if (input.editionId && notice.editionId !== input.editionId) {
    throw new Error('Official Communications returned data outside the requested edition scope.');
  }
  return notice;
}
