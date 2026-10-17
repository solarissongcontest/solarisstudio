import { describe, expect, it } from 'vitest';

import {
  createDefaultBroadcastRundown,
  parseStudio2BroadcastRundown,
  STUDIO2_RUNDOWN_CONFIG_KEY,
  validateStudio2BroadcastCommandResult,
} from './studio2-broadcast-rundown';

function storedRundown(overrides: Record<string, unknown> = {}) {
  return {
    version: 2,
    revision: 4,
    startAt: '2026-10-16T18:00:00Z',
    segments: [
      {
        id: 'opening',
        label: 'Opening',
        status: 'ready',
        plannedDurationSeconds: 180,
        actualStartedAt: null,
        actualCompletedAt: null,
      },
    ],
    lockedAt: null,
    lockedBy: null,
    lockReason: null,
    updatedAt: '2026-10-16T17:00:00Z',
    updatedBy: 'organizer-1',
    ...overrides,
  };
}

describe('Broadcast rundown transport boundary', () => {
  it('preserves the intentional version-1 compatibility bridge only', () => {
    const parsed = parseStudio2BroadcastRundown({
      [STUDIO2_RUNDOWN_CONFIG_KEY]: {
        ...storedRundown(),
        version: 1,
        revision: undefined,
      },
    });

    expect(parsed).toMatchObject({ version: 2, revision: 0 });
  });

  it('rejects version-2 payloads that omit or corrupt revision evidence', () => {
    expect(parseStudio2BroadcastRundown({
      [STUDIO2_RUNDOWN_CONFIG_KEY]: storedRundown({ revision: undefined }),
    })).toBeNull();
    expect(parseStudio2BroadcastRundown({
      [STUDIO2_RUNDOWN_CONFIG_KEY]: storedRundown({ revision: -1 }),
    })).toBeNull();
    expect(parseStudio2BroadcastRundown({
      [STUDIO2_RUNDOWN_CONFIG_KEY]: storedRundown({ revision: 1.5 }),
    })).toBeNull();
    expect(parseStudio2BroadcastRundown({
      [STUDIO2_RUNDOWN_CONFIG_KEY]: storedRundown({ version: 99 }),
    })).toBeNull();
  });

  it('does not invent missing segment ids or round fractional durations', () => {
    expect(parseStudio2BroadcastRundown({
      [STUDIO2_RUNDOWN_CONFIG_KEY]: storedRundown({
        segments: [{ label: 'Opening', status: 'ready', plannedDurationSeconds: 180 }],
      }),
    })).toBeNull();
    expect(parseStudio2BroadcastRundown({
      [STUDIO2_RUNDOWN_CONFIG_KEY]: storedRundown({
        segments: [{ id: 'opening', label: 'Opening', status: 'ready', plannedDurationSeconds: 180.5 }],
      }),
    })).toBeNull();
  });

  it('requires save and segment-transition commands to advance revision exactly once', () => {
    expect(validateStudio2BroadcastCommandResult(
      storedRundown({ revision: 5 }),
      4,
      'increment',
    ).revision).toBe(5);

    expect(() => validateStudio2BroadcastCommandResult(
      storedRundown({ revision: 4 }),
      4,
      'increment',
    )).toThrow('inconsistent revision evidence');
    expect(() => validateStudio2BroadcastCommandResult(
      storedRundown({ revision: 6 }),
      4,
      'increment',
    )).toThrow('inconsistent revision evidence');
  });

  it('allows lock/unlock no-op replay at the same revision or one real increment', () => {
    expect(validateStudio2BroadcastCommandResult(
      storedRundown({ revision: 4 }),
      4,
      'same-or-increment',
    ).revision).toBe(4);
    expect(validateStudio2BroadcastCommandResult(
      storedRundown({ revision: 5 }),
      4,
      'same-or-increment',
    ).revision).toBe(5);
    expect(() => validateStudio2BroadcastCommandResult(
      storedRundown({ revision: 6 }),
      4,
      'same-or-increment',
    )).toThrow('inconsistent revision evidence');
  });

  it('rejects legacy-version responses from governed commands', () => {
    expect(() => validateStudio2BroadcastCommandResult(
      storedRundown({ version: 1, revision: 5 }),
      4,
      'increment',
    )).toThrow('invalid version evidence');
  });

  it('keeps locally created planner data valid under the stricter integer contract', () => {
    const draft = createDefaultBroadcastRundown('2026-10-16T18:00:00Z');
    expect(draft.revision).toBe(0);
    expect(draft.segments.every((segment) => Number.isInteger(segment.plannedDurationSeconds))).toBe(true);
    expect(draft.segments.every((segment) => Boolean(segment.id.trim()))).toBe(true);
  });
});
