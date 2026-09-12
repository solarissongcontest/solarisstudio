import { describe, expect, it } from 'vitest';

import { buildBroadcastRundown } from './broadcast-rundown';
import {
  buildStudio2BroadcastReadiness,
  createDefaultBroadcastRundown,
  parseStudio2BroadcastRundown,
  rehearseStudio2BroadcastTransition,
  STUDIO2_RUNDOWN_CONFIG_KEY,
  validateStudio2BroadcastRundown,
} from './studio2-broadcast-rundown';

describe('Studio 2 advanced broadcast rundown', () => {
  it('normalizes the legacy stored rundown shape into the revision-aware model', () => {
    const parsed = parseStudio2BroadcastRundown({
      scoreboard: { style: 'classic' },
      [STUDIO2_RUNDOWN_CONFIG_KEY]: {
        version: 1,
        startAt: '2026-09-17T18:00:00Z',
        segments: [
          { id: 'opening', label: 'Opening', status: 'planned', plannedDurationSeconds: 180 },
        ],
      },
    });

    expect(parsed).toMatchObject({
      version: 2,
      revision: 0,
      lockedAt: null,
      lockedBy: null,
      lockReason: null,
    });
    expect(parsed?.segments[0]?.label).toBe('Opening');
  });

  it('keeps backward compatibility with the first Studio 2 title field draft', () => {
    const parsed = parseStudio2BroadcastRundown({
      [STUDIO2_RUNDOWN_CONFIG_KEY]: {
        version: 1,
        startAt: '2026-09-17T18:00:00Z',
        segments: [
          { id: 'opening', title: 'Opening', status: 'planned', plannedDurationSeconds: 180 },
        ],
      },
    });

    expect(parsed?.segments[0]?.label).toBe('Opening');
  });

  it('creates a valid default planner that the timing engine can evaluate', () => {
    const rundown = createDefaultBroadcastRundown('2026-09-17T18:00:00Z');
    expect(() => validateStudio2BroadcastRundown(rundown)).not.toThrow();

    const calculated = buildBroadcastRundown(rundown.startAt, rundown.segments);
    expect(calculated.segments).toHaveLength(5);
    expect(calculated.totalPlannedSeconds).toBeGreaterThan(0);
  });

  it('marks an unconfigured rundown blocked and an editable planned rundown as attention', () => {
    expect(buildStudio2BroadcastReadiness(null)).toMatchObject({
      state: 'blocked',
      blockers: ['No broadcast rundown has been configured.'],
    });

    const draft = createDefaultBroadcastRundown('2026-09-17T18:00:00Z');
    const readiness = buildStudio2BroadcastReadiness(draft);
    expect(readiness.state).toBe('attention');
    expect(readiness.warnings).toEqual(
      expect.arrayContaining([
        'The rundown is not locked for broadcast.',
        'One or more segments are still only planned.',
      ]),
    );
  });

  it('is ready when the structure is locked and all segments have passed planning', () => {
    const draft = createDefaultBroadcastRundown('2026-09-17T18:00:00Z');
    const locked = {
      ...draft,
      lockedAt: '2026-09-17T17:00:00Z',
      lockedBy: 'organizer-1',
      lockReason: 'Final broadcast rundown approved.',
      segments: draft.segments.map((segment) => ({ ...segment, status: 'ready' as const })),
    };

    expect(buildStudio2BroadcastReadiness(locked)).toMatchObject({
      state: 'ready',
      blockers: [],
      warnings: [],
    });
  });

  it('supports rehearsal lifecycle transitions without mutating the original config', () => {
    const original = createDefaultBroadcastRundown('2026-09-17T18:00:00Z');
    const ready = rehearseStudio2BroadcastTransition(original, 'opening', 'ready', new Date('2026-09-17T17:50:00Z'));
    const live = rehearseStudio2BroadcastTransition(ready, 'opening', 'live', new Date('2026-09-17T18:00:03Z'));
    const completed = rehearseStudio2BroadcastTransition(live, 'opening', 'completed', new Date('2026-09-17T18:03:01Z'));

    expect(original.segments[0]?.status).toBe('planned');
    expect(live.segments[0]).toMatchObject({
      status: 'live',
      actualStartedAt: '2026-09-17T18:00:03.000Z',
    });
    expect(completed.segments[0]).toMatchObject({
      status: 'completed',
      actualCompletedAt: '2026-09-17T18:03:01.000Z',
    });
  });

  it('rejects invalid rehearsal jumps and a second live segment', () => {
    const original = createDefaultBroadcastRundown('2026-09-17T18:00:00Z');
    expect(() => rehearseStudio2BroadcastTransition(original, 'opening', 'completed')).toThrow(
      'Invalid segment transition: planned → completed',
    );

    const firstReady = rehearseStudio2BroadcastTransition(original, 'opening', 'ready');
    const firstLive = rehearseStudio2BroadcastTransition(firstReady, 'opening', 'live');
    const secondReady = rehearseStudio2BroadcastTransition(firstLive, 'performances', 'ready');
    expect(() => rehearseStudio2BroadcastTransition(secondReady, 'performances', 'live')).toThrow(
      'Another rundown segment is already live.',
    );
  });

  it('rejects duplicate segment ids and multiple live segments', () => {
    const draft = createDefaultBroadcastRundown('2026-09-17T18:00:00Z');
    expect(() => validateStudio2BroadcastRundown({
      ...draft,
      segments: [draft.segments[0]!, { ...draft.segments[0]! }],
    })).toThrow('Duplicate rundown segment id: opening');

    expect(() => validateStudio2BroadcastRundown({
      ...draft,
      segments: draft.segments.slice(0, 2).map((segment) => ({ ...segment, status: 'live' as const })),
    })).toThrow('Only one rundown segment can be live at a time.');
  });
});
