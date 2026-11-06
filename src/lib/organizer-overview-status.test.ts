import { describe, expect, it } from 'vitest';
import { organizerOverviewStatus } from './organizer-overview-status';

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
});
