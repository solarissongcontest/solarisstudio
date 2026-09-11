import { supabase } from '@/integrations/supabase/client';
import {
  summarizeNoticeReceipts,
  validateOfficialNotice,
  type NoticeAudience,
  type NoticeReceipt,
  type NoticeSeverity,
  type OfficialNotice,
} from './official-communications';
import { isStudio2FeatureEnabled } from './studio2-feature-flags';

type NoticeRow = {
  id: string;
  edition_id: string | null;
  title: string;
  body: string;
  severity: NoticeSeverity;
  audience: NoticeAudience;
  country_ids: string[] | null;
  acknowledgement_required: boolean;
  sent_at: string | null;
  created_at: string;
};

type ReceiptRow = {
  notice_id: string;
  recipient_user_id: string;
  delivered_at: string | null;
  opened_at: string | null;
  acknowledged_at: string | null;
};

export type Studio2NoticeSummary = {
  notice: OfficialNotice;
  createdAt: string;
  receipts: ReturnType<typeof summarizeNoticeReceipts>;
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

function mapNotice(row: NoticeRow): OfficialNotice {
  return {
    id: row.id,
    editionId: row.edition_id,
    title: row.title,
    body: row.body,
    severity: row.severity,
    audience: row.audience,
    countryIds: row.country_ids ?? [],
    acknowledgementRequired: row.acknowledgement_required,
    sentAt: row.sent_at,
  };
}

function mapReceipt(row: ReceiptRow): NoticeReceipt {
  return {
    noticeId: row.notice_id,
    recipientUserId: row.recipient_user_id,
    deliveredAt: row.delivered_at,
    openedAt: row.opened_at,
    acknowledgedAt: row.acknowledged_at,
  };
}

async function requireEnabled() {
  if (!(await isStudio2FeatureEnabled('official_communications'))) {
    throw new Error('Official Communications is disabled by the Studio 2 rollout flag.');
  }
}

export async function loadStudio2Notices(editionId?: string | null): Promise<Studio2NoticeSummary[]> {
  await requireEnabled();

  let noticeQuery = supabase
    .from('studio2_official_notices')
    .select('id,edition_id,title,body,severity,audience,country_ids,acknowledgement_required,sent_at,created_at')
    .order('sent_at', { ascending: false, nullsFirst: false });

  if (editionId) noticeQuery = noticeQuery.eq('edition_id', editionId);

  const { data: noticeData, error: noticeError } = await noticeQuery;
  if (noticeError) throw noticeError;

  const noticeRows = (noticeData ?? []) as NoticeRow[];
  if (!noticeRows.length) return [];

  const noticeIds = noticeRows.map((row) => row.id);
  const { data: receiptData, error: receiptError } = await supabase
    .from('studio2_notice_receipts')
    .select('notice_id,recipient_user_id,delivered_at,opened_at,acknowledged_at')
    .in('notice_id', noticeIds);

  if (receiptError) throw receiptError;
  const receipts = ((receiptData ?? []) as ReceiptRow[]).map(mapReceipt);

  return noticeRows.map((row) => {
    const notice = mapNotice(row);
    return {
      notice,
      createdAt: row.created_at,
      receipts: summarizeNoticeReceipts(notice, receipts),
    };
  });
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

  const { data, error } = await supabase.rpc('studio2_send_notice', {
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
