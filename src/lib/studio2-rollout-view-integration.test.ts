import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

const route = source('src/routes/_authenticated/admin/feature-rollout.tsx');

describe('Studio 2 Feature Rollout UX integration', () => {
  it('exposes the five lifecycle views and a focused detail panel', () => {
    expect(route).toContain('STUDIO2_ROLLOUT_VIEWS');
    expect(route).toContain('Feature rollout views');
    expect(route).toContain('Selected feature details');
    expect(route).toContain('label="Depends on"');
    expect(route).toContain('label="Used by"');
    expect(route).toContain('label="Edition scope"');
    expect(route).toContain('label="User scope"');
  });

  it('keeps dependency and rollout rules in the canonical decision engine and RPC', () => {
    expect(route).toContain('studio2RolloutDecision');
    expect(route).toContain("client.rpc('studio2_set_feature_flag'");
    expect(route).toContain('disabled={busy || !decision.allowed}');
    expect(route).toContain("decision.reason === 'rollout_locked'");
  });

  it('keeps the view selector and feature details responsive', () => {
    expect(route).toContain('overflow-x-auto');
    expect(route).toContain('xl:grid-cols-[minmax(0,1fr)_22rem]');
    expect(route).toContain('xl:sticky xl:top-24');
  });

  it('does not retain the obsolete surface tone helper', () => {
    expect(route).not.toContain('surfaceTone');
  });
});
