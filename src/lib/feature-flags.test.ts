import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SOLARIS_FEATURE_RULES,
  SOLARIS_FEATURE_FLAGS,
  evaluateSolarisFeatureFlag,
} from './feature-flags';

describe('Solaris feature flag defaults', () => {
  it('keeps every Studio 2 feature disabled by default', () => {
    expect(SOLARIS_FEATURE_FLAGS.every((key) => DEFAULT_SOLARIS_FEATURE_RULES[key].enabled === false)).toBe(true);
    expect(evaluateSolarisFeatureFlag('live_control_room', { isAdmin: true })).toBe(false);
  });

  it('allows explicit scoped overrides', () => {
    expect(
      evaluateSolarisFeatureFlag(
        'live_control_room',
        { isAdmin: true, editionId: 'ssc21' },
        {
          live_control_room: {
            enabled: true,
            adminsOnly: true,
            editionIds: ['ssc21'],
          },
        },
      ),
    ).toBe(true);
  });
});
