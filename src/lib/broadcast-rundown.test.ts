import { describe, expect, it } from 'vitest';
import { buildBroadcastRundown } from './broadcast-rundown';

describe('broadcast rundown engine', () => {
  it('calculates planned timing and current/next segments', () => {
    const rundown = buildBroadcastRundown('2026-09-10T18:00:00.000Z', [
      { id: 'opening', label: 'Opening', plannedDurationSeconds: 240, status: 'completed' },
      { id: 'hosts', label: 'Hosts', plannedDurationSeconds: 180, status: 'live' },
      { id: 'entry-1', label: 'Entry 1', plannedDurationSeconds: 240, status: 'ready' },
    ]);

    expect(rundown.currentSegment?.id).toBe('hosts');
    expect(rundown.nextSegment?.id).toBe('entry-1');
    expect(rundown.totalPlannedSeconds).toBe(660);
    expect(rundown.estimatedFinishAt).toBe('2026-09-10T18:11:00.000Z');
  });

  it('carries actual overrun into future estimated timing', () => {
    const rundown = buildBroadcastRundown('2026-09-10T18:00:00.000Z', [
      {
        id: 'opening',
        label: 'Opening',
        plannedDurationSeconds: 240,
        status: 'completed',
        actualStartedAt: '2026-09-10T18:00:00.000Z',
        actualCompletedAt: '2026-09-10T18:06:00.000Z',
      },
      { id: 'hosts', label: 'Hosts', plannedDurationSeconds: 180, status: 'live' },
    ]);

    expect(rundown.segments[1].estimatedStartedAt).toBe('2026-09-10T18:06:00.000Z');
    expect(rundown.segments[1].driftSeconds).toBe(120);
    expect(rundown.overallDriftSeconds).toBe(120);
    expect(rundown.estimatedFinishAt).toBe('2026-09-10T18:09:00.000Z');
  });
});
