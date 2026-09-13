import { describe, expect, it } from 'vitest';
import {
  noticeInboxState,
  summarizeNoticeReceipts,
  validateOfficialNotice,
  validateOperationalNotice,
  type OfficialNotice,
  type OperationalNotice,
} from './official-communications';

const notice: OfficialNotice = {
  id: 'notice-1',
  editionId: 'ssc21',
  title: 'Jury deadline',
  body: 'Submit your jury ballot before the deadline.',
  severity: 'action_required',
  audience: 'hods',
  countryIds: [],
  acknowledgementRequired: true,
  displaySurfaces: ['delegation_inbox'],
  sentAt: '2026-09-10T18:00:00.000Z',
};

const operationalNotice: OperationalNotice = {
  ...notice,
  noticeType: 'deadline_reminder',
  state: 'scheduled',
  audienceGroup: null,
  scheduledAt: '2026-09-10T17:00:00.000Z',
  cancelledAt: null,
  archivedAt: null,
  supersededById: null,
  revision: 2,
};

describe('official communications', () => {
  it('validates audience targeting', () => {
    expect(() => validateOfficialNotice(notice)).not.toThrow();
    expect(() =>
      validateOfficialNotice({ ...notice, audience: 'specific_countries', countryIds: [] }),
    ).toThrow(/at least one country/i);
  });

  it('requires at least one display surface and keeps acknowledgement tied to inbox delivery', () => {
    expect(() => validateOfficialNotice({ ...notice, displaySurfaces: [] })).toThrow(/destination/i);
    expect(() => validateOfficialNotice({
      ...notice,
      displaySurfaces: ['mysolaris_home'],
      acknowledgementRequired: true,
    })).toThrow(/acknowledgements require/i);
    expect(() => validateOfficialNotice({
      ...notice,
      displaySurfaces: ['mysolaris_home', 'public_home'],
      acknowledgementRequired: false,
    })).not.toThrow();
  });

  it('validates lifecycle-specific scheduling and edition-group targeting', () => {
    expect(() => validateOperationalNotice(operationalNotice)).not.toThrow();
    expect(() =>
      validateOperationalNotice({ ...operationalNotice, scheduledAt: null }),
    ).toThrow(/scheduled time/i);
    expect(() =>
      validateOperationalNotice({
        ...operationalNotice,
        state: 'draft',
        scheduledAt: null,
        audience: 'edition_group',
        audienceGroup: null,
      }),
    ).toThrow(/require a group/i);
  });

  it('summarizes delivery and acknowledgement progress', () => {
    const summary = summarizeNoticeReceipts(notice, [
      {
        noticeId: 'notice-1',
        recipientUserId: 'u1',
        deliveredAt: '2026-09-10T18:01:00.000Z',
        openedAt: '2026-09-10T18:02:00.000Z',
        acknowledgedAt: '2026-09-10T18:03:00.000Z',
      },
      {
        noticeId: 'notice-1',
        recipientUserId: 'u2',
        deliveredAt: '2026-09-10T18:01:00.000Z',
        openedAt: null,
        acknowledgedAt: null,
      },
    ]);

    expect(summary).toEqual({
      total: 2,
      delivered: 2,
      opened: 1,
      acknowledged: 1,
      acknowledgementOutstanding: 1,
    });
  });

  it('derives stable HOD inbox states from receipt history', () => {
    expect(noticeInboxState(notice, null)).toBe('unread');
    expect(
      noticeInboxState(notice, {
        noticeId: notice.id,
        recipientUserId: 'u1',
        deliveredAt: '2026-09-10T18:01:00.000Z',
        openedAt: '2026-09-10T18:02:00.000Z',
        acknowledgedAt: null,
      }),
    ).toBe('acknowledgement_required');
    expect(
      noticeInboxState(notice, {
        noticeId: notice.id,
        recipientUserId: 'u1',
        deliveredAt: '2026-09-10T18:01:00.000Z',
        openedAt: '2026-09-10T18:02:00.000Z',
        acknowledgedAt: '2026-09-10T18:03:00.000Z',
      }),
    ).toBe('acknowledged');
    expect(
      noticeInboxState(notice, {
        noticeId: notice.id,
        recipientUserId: 'u1',
        deliveredAt: '2026-09-10T18:01:00.000Z',
        openedAt: '2026-09-10T18:02:00.000Z',
        acknowledgedAt: '2026-09-10T18:03:00.000Z',
        archivedAt: '2026-09-10T18:04:00.000Z',
      }),
    ).toBe('archived');
  });
});
