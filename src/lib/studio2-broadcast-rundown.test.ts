import { describe, expect, it } from 'vitest';

import { buildBroadcastRundown } from './broadcast-rundown';
import {
  createDefaultBroadcastRundown,
  parseStudio2BroadcastRundown,
  STUDIO2_RUNDOWN_CONFIG_KEY,
  validateStudio2BroadcastRundown,
} from './studio2-broadcast-rundown';

describe('Studio 2 broadcast rundown persistence', () => {
  it('parses a rundown without depending on unrelated broadcast config keys', () => {
    const parsed = parseStudio2BroadcastRundown({
      scoreboard: { style: 'classic' },
      graphics: { lowerThird: true },
      [STUDIO2_RUNDOWN_CONFIG_KEY]: {
        version: 1,
        startAt: '2026-09-17T18:00:00.000Z',
        segments: [
          { id: 'open', title: 'Opening', status: 'planned', plannedDurationSeconds: 180 },
        ],
      },
    });

    expect(parsed?.segments).toHaveLength(1);
    expect(parsed?.segments[0]?.title).toBe('Opening');
  });

  it('creates a valid default planner that the timing engine can evaluate', () => {
    const rundown = createDefaultBroadcastRundown('2026-09-17T18:00:00.000Z');
    expect(() => validateStudio2BroadcastRundown(rundown)).not.toThrow();

    const calculated = buildBroadcastRundown(rundown.segments, rundown.startAt);
    expect(calculated.segments).toHaveLength(5);
    expect(calculated.totalPlannedSeconds).toBeGreaterThan(0);
  });

  it('rejects duplicate segment ids', () => {
    const rundown = createDefaultBroadcastRundown('2026-09-17T18:00:00.000Z');
    rundown.segments[1] = { ...rundown.segments[1]!, id: rundown.segments[0]!.id };
    expect(() => validateStudio2BroadcastRundown(rundown)).toThrow(/Duplicate rundown segment id/);
  });
});
