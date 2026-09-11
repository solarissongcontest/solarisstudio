export const NOTICE_SEVERITIES = ['info', 'action_required', 'urgent', 'critical'] as const;
export type NoticeSeverity = (typeof NOTICE_SEVERITIES)[number];

export const NOTICE_AUDIENCES = [
  'all_delegations',
  'participating_countries',
  'specific_countries',
  'jurors',
  'hods',
  'organizers',
  'edition_group',
  'staff',
  'press',
] as const;
export type NoticeAudience = (typeof NOTICE_AUDIENCES)[number];

export const NOTICE_TYPES = [
  'official_notice',
  'deadline_reminder',
  'rule_clarification',
  'technical_advisory',
  'voting_notice',
  'emergency_communication',
  'broadcast_information',
] as const;
export type NoticeType = (typeof NOTICE_TYPES)[number];

export const NOTICE_STATES = ['draft', 'scheduled', 'published', 'cancelled', 'superseded'] as const;
export type NoticeState = (typeof NOTICE_STATES)[number];

export const NOTICE_EDITION_GROUPS = [
  'broadcast',
  'voting',
  'delegations',
  'results',
  'communications',
] as const;
export type NoticeEditionGroup = (typeof NOTICE_EDITION_GROUPS)[number];

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

export type OperationalNotice = OfficialNotice & {
  noticeType: NoticeType;
  state: NoticeState;
  audienceGroup: NoticeEditionGroup | null;
  scheduledAt: string | null;
  cancelledAt: string | null;
  supersededById: string | null;
  revision: number;
};

export type NoticeRevision = {
  noticeId: string;
  revision: number;
  noticeType: NoticeType;
  title: string;
  body: string;
  severity: NoticeSeverity;
  audience: NoticeAudience;
  audienceGroup: NoticeEditionGroup | null;
  countryIds: readonly string[];
  acknowledgementRequired: boolean;
  state: NoticeState;
  scheduledAt: string | null;
  sentAt: string | null;
  changedAt: string;
  changedBy: string | null;
};

export type NoticeReceipt = {
  noticeId: string;
  recipientUserId: string;
  deliveredAt: string | null;
  openedAt: string | null;
  acknowledgedAt: string | null;
  archivedAt?: string | null;
};

export type NoticeInboxState = 'unread' | 'read' | 'acknowledgement_required' | 'acknowledged' | 'archived';

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

export function validateOperationalNotice(notice: OperationalNotice): void {
  validateOfficialNotice(notice);
  if (notice.audience === 'edition_group' && !notice.audienceGroup) {
    throw new Error('Edition-group notices require a group');
  }
  if (notice.audience !== 'edition_group' && notice.audienceGroup) {
    throw new Error('Audience group is only valid for edition-group notices');
  }
  if (notice.state === 'scheduled' && !notice.scheduledAt) {
    throw new Error('Scheduled notices require a scheduled time');
  }
  if (!Number.isInteger(notice.revision) || notice.revision < 1) {
    throw new Error('Notice revision must be a positive integer');
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

export function noticeInboxState(notice: OfficialNotice, receipt?: NoticeReceipt | null): NoticeInboxState {
  if (receipt?.archivedAt) return 'archived';
  if (receipt?.acknowledgedAt) return 'acknowledged';
  if (notice.acknowledgementRequired && receipt?.openedAt) return 'acknowledgement_required';
  if (receipt?.openedAt) return 'read';
  return 'unread';
}

export function noticeStateLabel(state: NoticeState): string {
  switch (state) {
    case 'draft': return 'Draft';
    case 'scheduled': return 'Scheduled';
    case 'published': return 'Published';
    case 'cancelled': return 'Cancelled';
    case 'superseded': return 'Superseded';
  }
}

export function noticeTypeLabel(type: NoticeType): string {
  return type.replace(/_/g, ' ').replace(/^./, (character) => character.toUpperCase());
}
