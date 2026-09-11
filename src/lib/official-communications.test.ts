import { describe, expect, it } from 'vitest';
import { summarizeNoticeReceipts, validateOfficialNotice, type OfficialNotice } from './official-communications';

const notice: OfficialNotice = {
  id: 'notice-1',
  editionId: 'ssc21',
  title: 'Jury deadline',
  body: 'Submit your jury ballot before the deadline.',
  severity: 'action_required',
  audience: 'hods',
  countryIds: [],
  acknowledgementRequired: true,
  sentAt: '2026-09-10T18:00:00.000Z',
};

describe('official communications', () => {
  it('validates audience targeting', () => {
    expect(() => validateOfficialNotice(notice)).not.toThrow();
    expect(() =>
      validateOfficialNotice({ ...notice, audience: 'specific_countries', countryIds: [] }),
    ).toThrow(/at least one country/i);
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
});
