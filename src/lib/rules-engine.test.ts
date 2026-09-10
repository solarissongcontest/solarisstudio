import { describe, expect, it } from 'vitest';
import { analyzeRuleImpact, compareRuleConfigs, resolveActiveRules, type ContestRuleVersion } from './rules-engine';

const base: ContestRuleVersion = {
  id: 'v1',
  ruleId: 'VOT-004',
  version: 1,
  title: 'Public vote allocation',
  description: 'Controls the maximum allocation per voter.',
  status: 'active',
  effectiveFromEdition: 20,
  effectiveThroughEdition: null,
  config: { maxAllocation: 10, minimumCountries: 5 },
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('rules engine', () => {
  it('resolves the newest effective version for an edition', () => {
    const next = { ...base, id: 'v2', version: 2, effectiveFromEdition: 21, config: { maxAllocation: 7, minimumCountries: 5 } };
    expect(resolveActiveRules([base, next], 21)).toEqual([next]);
    expect(resolveActiveRules([base], 19)).toEqual([]);
  });

  it('reports which configured fields changed', () => {
    const next = { ...base, version: 2, config: { maxAllocation: 7, minimumCountries: 5, allowSelfVote: false } };
    expect(compareRuleConfigs(base, next)).toEqual(['allowSelfVote', 'maxAllocation']);
  });

  it('sorts rule impact by severity', () => {
    const impact = analyzeRuleImpact('VOT-004', [
      { ruleId: 'VOT-004', systemKey: 'televote-ui', description: 'Allocation controls', severity: 'high' },
      { ruleId: 'VOT-004', systemKey: 'results-engine', description: 'Vote totals', severity: 'critical' },
      { ruleId: 'OTHER', systemKey: 'archive', description: 'Unrelated', severity: 'low' },
    ]);

    expect(impact.highestSeverity).toBe('critical');
    expect(impact.affectedSystems.map((item) => item.systemKey)).toEqual(['results-engine', 'televote-ui']);
  });
});
