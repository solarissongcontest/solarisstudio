import { supabase } from '@/integrations/supabase/client';
import {
  summarizeNoticeReceipts,
  validateOfficialNotice,
  validateOperationalNotice,
  noticeInboxState,
  type NoticeAudience,
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
  status?: NoticeState | null;
  scheduled_at?: string | null;
  sent_at: string | null;
  cancelled_at?: string | null;
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
  status: NoticeState;
  scheduled_at: string | null;
  sent_at: string | null;
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
};

function asRows<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function mapNotice(row: NoticeRow): OperationalNotice {
  return {
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
    state: row.status ?? (row.sent_at ? 'published' : 'draft'),
    scheduledAt: row.scheduled_at ?? null,
    sentAt: row.sent_at,
    cancelledAt: row.cancelled_at ?? null,
    supersededById: row.superseded_by_id ?? null,
    revision: row.revision ?? 1,
  };
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
    state: row.status,
    scheduledAt: row.scheduled_at,
    sentAt: row.sent_at,
    changedAt: row.changed_at,
    changedBy: row.changed_by,
  };
}

async function requireEnabled() {
  if (!(await isStudio2FeatureEnabled('official_communications'))) {
    throw new Error('Official Communications is disabled by the Studio 2 rollout flag.');
  }
}

const NOTICE_COLUMNS = [
  'id', 'edition_id', 'notice_type', 'title', 'body', 'severity', 'audience',
  'audience_group', 'country_ids', 'acknowledgement_required', 'status',
  'scheduled_at', 'sent_at', 'cancelled_at', 'superseded_by_id', 'revision', 'created_at',
].join(',');

const RECEIPT_COLUMNS = 'notice_id,recipient_user_id,delivered_at,opened_at,acknowledged_at,archived_at';

export async function loadStudio2Notices(editionId?: string | null): Promise<Studio2NoticeSummary[]> {
  await requireEnabled();

  let noticeQuery = client
    .from('studio2_official_notices')
    .select(NOTICE_COLUMNS)
    .order('created_at', { ascending: false });

  if (editionId) noticeQuery = noticeQuery.eq('edition_id', editionId);

  const { data: noticeData, error: noticeError } = await noticeQuery;
  if (noticeError) throw noticeError;

  const noticeRows = asRows<NoticeRow>(noticeData);
  if (!noticeRows.length) return [];

  const noticeIds = noticeRows.map((row) => row.id);
  const { data: receiptData, error: receiptError } = await client
    .from('studio2_notice_receipts')
    .select(RECEIPT_COLUMNS)
    .in('notice_id', noticeIds);

  if (receiptError) throw receiptError;
  const receipts = asRows<ReceiptRow>(receiptData).map(mapReceipt);

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

  let noticeQuery = client
    .from('studio2_official_notices')
    .select(NOTICE_COLUMNS)
    .eq('status', 'published')
    .order('sent_at', { ascending: false, nullsFirst: false });
  if (editionId) noticeQuery = noticeQuery.eq('edition_id', editionId);

  const { data: noticeData, error: noticeError } = await noticeQuery;
  if (noticeError) throw noticeError;
  const noticeRows = asRows<NoticeRow>(noticeData);
  if (!noticeRows.length) return [];

  const { data: receiptData, error: receiptError } = await client
    .from('studio2_notice_receipts')
    .select(RECEIPT_COLUMNS)
    .in('notice_id', noticeRows.map((row) => row.id));
  if (receiptError) throw receiptError;

  const receipts = asRows<ReceiptRow>(receiptData).map(mapReceipt);
  return noticeRows.map((row) => {
    const notice = mapNotice(row);
    const receipt = receipts.find((candidate) => candidate.noticeId === notice.id) ?? null;
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
    state: 'draft',
    scheduledAt: null,
    sentAt: null,
    cancelledAt: null,
    supersededById: null,
    revision: 1,
  };
}

function saveArgs(input: SaveStudio2NoticeInput) {
  const candidate = draftCandidate(input);
  validateOperationalNotice(candidate);
  return {
    p_edition_id: input.editionId,
    p_notice_type: input.noticeType,
    p_title: input.title.trim(),
    p_body: input.body.trim(),
    p_severity: input.severity,
    p_audience: input.audience,
    p_audience_group: input.audienceGroup,
    p_country_ids: input.countryIds,
    p_acknowledgement_required: input.acknowledgementRequired,
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
  return noticeRpc('studio2_create_notice_draft', {
    ...saveArgs(input),
    p_supersedes_id: supersedesId,
  });
}

export async function updateStudio2NoticeDraft(
  noticeId: string,
  input: SaveStudio2NoticeInput,
): Promise<OperationalNotice> {
  const { p_edition_id: _editionId, ...args } = saveArgs(input);
  return noticeRpc('studio2_update_notice_draft', { p_notice_id: noticeId, ...args });
}

export async function scheduleStudio2Notice(noticeId: string, scheduledAt: string): Promise<OperationalNotice> {
  return noticeRpc('studio2_schedule_notice', { p_notice_id: noticeId, p_scheduled_at: scheduledAt });
}

export async function publishStudio2Notice(noticeId: string): Promise<OperationalNotice> {
  return noticeRpc('studio2_publish_notice', { p_notice_id: noticeId });
}

export async function cancelStudio2Notice(noticeId: string, reason: string): Promise<OperationalNotice> {
  return noticeRpc('studio2_cancel_notice', { p_notice_id: noticeId, p_reason: reason.trim() || null });
}

export async function createSupersedingStudio2NoticeDraft(noticeId: string): Promise<OperationalNotice> {
  return noticeRpc('studio2_create_superseding_notice_draft', { p_notice_id: noticeId });
}

export async function loadStudio2NoticeRevisions(noticeId: string): Promise<NoticeRevision[]> {
  await requireEnabled();
  const { data, error } = await client
    .from('studio2_notice_versions')
    .select('notice_id,revision,notice_type,title,body,severity,audience,audience_group,country_ids,acknowledgement_required,status,scheduled_at,sent_at,changed_by,changed_at')
    .eq('notice_id', noticeId)
    .order('revision', { ascending: false });
  if (error) throw error;
  return asRows<RevisionRow>(data).map(mapRevision);
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
  return mapNotice(data as NoticeRow);
}
