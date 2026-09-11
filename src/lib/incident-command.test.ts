import { describe, expect, it } from 'vitest';
import {
  assertIncidentTransition,
  canTransitionIncident,
  isCrisisModeRequired,
  summarizeIncidents,
  type Incident,
} from './incident-command';

const incidents: Incident[] = [
  {
    id: '1',
    editionId: 'ssc21',
    title: 'Televote unavailable',
    severity: 'sev1',
    status: 'mitigating',
    startedAt: '2026-09-10T18:00:00.000Z',
    resolvedAt: null,
  },
  {
    id: '2',
    editionId: 'ssc21',
    title: 'Late media asset',
    severity: 'sev3',
    status: 'open',
    startedAt: '2026-09-10T17:00:00.000Z',
    resolvedAt: null,
  },
];

describe('incident command engine', () => {
  it('enforces a one-way resolved state', () => {
    expect(canTransitionIncident('open', 'mitigating')).toBe(true);
    expect(canTransitionIncident('monitoring', 'resolved')).toBe(true);
    expect(canTransitionIncident('resolved', 'open')).toBe(false);
    expect(() => assertIncidentTransition('resolved', 'open')).toThrow(/Illegal incident transition/);
  });

  it('activates crisis mode only for unresolved SEV-1 incidents', () => {
    expect(isCrisisModeRequired(incidents)).toBe(true);
    expect(
      isCrisisModeRequired([
        { ...incidents[0], status: 'resolved', resolvedAt: '2026-09-10T18:20:00.000Z' },
      ]),
    ).toBe(false);
  });

  it('summarizes active incidents by severity', () => {
    expect(summarizeIncidents(incidents)).toEqual({
      activeCount: 2,
      criticalCount: 1,
      crisisMode: true,
      highestSeverity: 'sev1',
    });
  });
});
