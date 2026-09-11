import { describe, expect, it } from 'vitest';
import { evaluateFeatureFlag } from './feature-flags';
import { hasCapability, requireCapability } from './permissions-v2';

describe('Solaris Studio 2 foundations', () => {
  it('supports admin-only and edition-scoped feature flags', () => {
    const rule = {
      enabled: true,
      adminsOnly: true,
      editionIds: ['ssc21'],
    } as const;

    expect(evaluateFeatureFlag(rule, { isAdmin: true, editionId: 'ssc21' })).toBe(true);
    expect(evaluateFeatureFlag(rule, { isAdmin: false, editionId: 'ssc21' })).toBe(false);
    expect(evaluateFeatureFlag(rule, { isAdmin: true, editionId: 'ssc22' })).toBe(false);
  });

  it('supports edition-scoped and expiring capability grants', () => {
    const grants = [
      { capability: 'results.verify' as const, editionId: 'ssc21' },
      { capability: 'broadcast.control' as const, expiresAt: '2026-09-11T00:00:00.000Z' },
    ];

    expect(hasCapability(grants, 'results.verify', { editionId: 'ssc21' })).toBe(true);
    expect(hasCapability(grants, 'results.verify', { editionId: 'ssc22' })).toBe(false);
    expect(
      hasCapability(grants, 'broadcast.control', {
        now: new Date('2026-09-10T20:00:00.000Z'),
      }),
    ).toBe(true);
    expect(
      hasCapability(grants, 'broadcast.control', {
        now: new Date('2026-09-11T00:00:00.000Z'),
      }),
    ).toBe(false);
  });

  it('fails closed when a capability is missing', () => {
    expect(() => requireCapability([], 'results.publish')).toThrow(/Missing Solaris capability/);
  });
});
