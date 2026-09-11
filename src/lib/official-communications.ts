export const NOTICE_SEVERITIES = ['info', 'action_required', 'urgent', 'critical'] as const;
export type NoticeSeverity = (typeof NOTICE_SEVERITIES)[number];

export const NOTICE_AUDIENCES = ['all_delegations', 'specific_countries', 'jurors', 'hods', 'staff', 'press'] as const;
export type NoticeAudience = (typeof NOTICE_AUDIENCES)[number];

export type OfficialNotice = {
  id: string;
  editionId: string | null;
  title: string;
  body: string;
  severity: NoticeSeverity;
  audience: NoticeAudience;
  countryIds: readonly string[];
  acknowledgementRequired: boolean;
  sentAt: string | null;
};

export type NoticeReceipt = {
  noticeId: string;
  recipientUserId: string;
  deliveredAt: string | null;
  openedAt: string | null;
  acknowledgedAt: string | null;
};

export function validateOfficialNotice(notice: OfficialNotice): void {
  if (!notice.title.trim()) throw new Error('Official notice title is required');
  if (!notice.body.trim()) throw new Error('Official notice body is required');
  if (notice.audience === 'specific_countries' && notice.countryIds.length === 0) {
    throw new Error('Specific-country notices require at least one country');
  }
  if (notice.audience !== 'specific_countries' && notice.countryIds.length > 0) {
    throw new Error('Country ids are only valid for specific-country notices');
  }
}

export function summarizeNoticeReceipts(notice: OfficialNotice, receipts: readonly NoticeReceipt[]) {
  const relevant = receipts.filter((receipt) => receipt.noticeId === notice.id);
  const delivered = relevant.filter((receipt) => receipt.deliveredAt).length;
  const opened = relevant.filter((receipt) => receipt.openedAt).length;
  const acknowledged = relevant.filter((receipt) => receipt.acknowledgedAt).length;

  return {
    total: relevant.length,
    delivered,
    opened,
    acknowledged,
    acknowledgementOutstanding: notice.acknowledgementRequired
      ? Math.max(0, relevant.length - acknowledged)
      : 0,
  };
}
