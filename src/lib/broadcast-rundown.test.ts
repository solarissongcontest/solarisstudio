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

  it('does not count a pre-air skip as airtime or treat the skip click as its broadcast finish', () => {
    const rundown = buildBroadcastRundown('2026-09-10T18:00:00.000Z', [
      {
        id: 'intro',
        label: 'Intro',
        plannedDurationSeconds: 240,
        status: 'skipped',
        // Operators can skip an upcoming cue before the show starts.
        actualCompletedAt: '2026-09-10T17:55:00.000Z',
      },
      { id: 'hosts', label: 'Hosts', plannedDurationSeconds: 180, status: 'ready' },
    ]);

    expect(rundown.currentSegment).toBeNull();
    expect(rundown.nextSegment?.id).toBe('hosts');
    expect(rundown.segments[1].estimatedStartedAt).toBe('2026-09-10T18:00:00.000Z');
    expect(rundown.segments[0].driftSeconds).toBe(-240);
    expect(rundown.overallDriftSeconds).toBe(-240);
    expect(rundown.estimatedFinishAt).toBe('2026-09-10T18:03:00.000Z');
    expect(rundown.totalPlannedSeconds).toBe(420);
  });

  it('uses real elapsed airtime when a cue is skipped after going live', () => {
    const rundown = buildBroadcastRundown('2026-09-10T18:00:00.000Z', [
      {
        id: 'performance',
        label: 'Performance',
        plannedDurationSeconds: 240,
        status: 'skipped',
        actualStartedAt: '2026-09-10T18:01:00.000Z',
        actualCompletedAt: '2026-09-10T18:02:00.000Z',
      },
      { id: 'hosts', label: 'Hosts', plannedDurationSeconds: 180, status: 'ready' },
    ]);

    expect(rundown.segments[1].estimatedStartedAt).toBe('2026-09-10T18:02:00.000Z');
    expect(rundown.estimatedFinishAt).toBe('2026-09-10T18:05:00.000Z');
    expect(rundown.overallDriftSeconds).toBe(-120);
  });

  it('retains prior overruns but removes only the unused duration of a future skipped cue', () => {
    const rundown = buildBroadcastRundown('2026-09-10T18:00:00.000Z', [
      {
        id: 'opening',
        label: 'Opening',
        plannedDurationSeconds: 240,
        status: 'completed',
        actualStartedAt: '2026-09-10T18:00:00.000Z',
        actualCompletedAt: '2026-09-10T18:06:00.000Z',
      },
      {
        id: 'break',
        label: 'Break',
        plannedDurationSeconds: 180,
        status: 'skipped',
        actualCompletedAt: '2026-09-10T18:01:00.000Z',
      },
      { id: 'outro', label: 'Outro', plannedDurationSeconds: 120, status: 'ready' },
    ]);

    expect(rundown.segments[2].estimatedStartedAt).toBe('2026-09-10T18:06:00.000Z');
    expect(rundown.estimatedFinishAt).toBe('2026-09-10T18:08:00.000Z');
    expect(rundown.overallDriftSeconds).toBe(-60);
  });
});
