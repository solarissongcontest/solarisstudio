import { describe, expect, it } from 'vitest';
import { organizerIncidentEscalation, organizerOverviewEmptyAttention, organizerOverviewStatus } from './organizer-overview-status';

describe('Organizer Overview risk and verified health presentation', () => {
  it('never describes unknown control-room evidence as on track', () => {
    expect(organizerOverviewStatus('normal', 'unknown'))
      .toEqual({ tone: 'neutral', label: 'Status unverified' });
  });

  it('preserves known elevated or critical risks even when some evidence is missing', () => {
    expect(organizerOverviewStatus('elevated', 'unknown').label).toBe('Needs attention');
    expect(organizerOverviewStatus('critical', 'unknown').label).toBe('Critical attention');
  });

  it('does not downplay degraded or outage health when task risk is normal', () => {
    expect(organizerOverviewStatus('normal', 'degraded').tone).toBe('attention');
    expect(organizerOverviewStatus('normal', 'outage').tone).toBe('blocked');
    expect(organizerOverviewStatus('normal', 'partial_outage').tone).toBe('blocked');
  });

  it('shows on track only when system health is positively verified', () => {
    expect(organizerOverviewStatus('normal', 'healthy'))
      .toEqual({ tone: 'ready', label: 'On track' });
  });
  it('does not give a green all-clear when no tasks are listed but health is unknown', () => {
    expect(organizerOverviewEmptyAttention('normal', 'unknown')).toMatchObject({
      heading: 'Operational status not verified',
      verifiedClear: false,
    });
  });

  it('retains a clear state only for verified healthy operations with no tasks', () => {
    expect(organizerOverviewEmptyAttention('normal', 'healthy')).toMatchObject({
      heading: 'Nothing is asking for intervention',
      verifiedClear: true,
    });
  });

  it('does not hide elevated risk or outage when the task list is empty', () => {
    expect(organizerOverviewEmptyAttention('elevated', 'healthy').verifiedClear).toBe(false);
    expect(organizerOverviewEmptyAttention('normal', 'outage').heading).toBe('Review operational health');
  });

  it('keeps verified critical incident escalation visible with unknown or contradictory active totals', () => {
    expect(organizerIncidentEscalation(null, 1)).toEqual({
      title: '1 critical incident confirmed',
      description: '1 critical incident requires immediate review. Total active incident count is unverified. Review Incident Command.',
    });
    const inconsistent = organizerIncidentEscalation(0, 2);
    expect(inconsistent?.title).toBe('2 critical incidents confirmed');
    expect(inconsistent?.description).toContain('unverified');
  });

  it('keeps exact active counts when verified, and does not invent zero-count incidents', () => {
    expect(organizerIncidentEscalation(3, 1)?.title).toBe('3 active incidents');
    expect(organizerIncidentEscalation(1, 0)?.title).toBe('1 active incident');
    expect(organizerIncidentEscalation(0, 0)).toBeNull();
    expect(organizerIncidentEscalation(null, 0)).toBeNull();
    expect(organizerIncidentEscalation(Number.NaN, null)).toBeNull();
  });

});
