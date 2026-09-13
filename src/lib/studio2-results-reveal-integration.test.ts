import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

const nav = source('src/components/admin/admin-navigation.ts');
const route = source('src/routes/_authenticated/admin/results-reveal.tsx');
const model = source('src/lib/results-reveal-model.ts');

describe('Studio 2 Results Reveal Director integration', () => {
  it('is discoverable from Organizer navigation', () => {
    expect(nav).toContain('"Reveal Director",');
    expect(nav).toContain('"/admin/results-reveal"');
  });

  it('uses canonical show result rows and the existing reveal engine', () => {
    expect(route).toContain('useResults(showId');
    expect(route).toContain('buildResultsRevealModel');
    expect(model).toContain('compareRevealOrders');
    expect(model).toContain('simulateResultsReveal');
  });

  it('is rollout-gated by Results Replay rather than inventing a new flag', () => {
    expect(route).toContain("isStudio2FeatureEnabled('results_replay')");
  });

  it('compares operational and forensic reveal strategies', () => {
    expect(model).toContain("'jury_order'");
    expect(model).toContain("'final_rank_reverse'");
    expect(model).toContain("'televote_ascending'");
    expect(route).toContain('Strategy comparison');
    expect(route).toContain('Winner certain');
  });

  it('does not write results, voting data, Rules, or Friend Voting state', () => {
    expect(route).not.toContain('.update(');
    expect(route).not.toContain('.insert(');
    expect(route).not.toContain('/rules');
    expect(route).not.toContain('friend-voting');
  });
});
