export const RULE_STATUSES = ['draft', 'active', 'retired'] as const;
export type RuleStatus = (typeof RULE_STATUSES)[number];

export type ContestRuleVersion = {
  id: string;
  ruleId: string;
  version: number;
  title: string;
  description: string;
  status: RuleStatus;
  effectiveFromEdition: number | null;
  effectiveThroughEdition: number | null;
  config: Record<string, unknown>;
  createdAt: string;
};

export type RuleDependency = {
  ruleId: string;
  systemKey: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
};

export type RuleImpact = {
  ruleId: string;
  affectedSystems: RuleDependency[];
  highestSeverity: RuleDependency['severity'] | null;
};

const SEVERITY_RANK: Record<RuleDependency['severity'], number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export function validateRuleVersion(rule: ContestRuleVersion): void {
  if (!rule.ruleId.trim()) throw new Error('Rule id is required');
  if (!rule.title.trim()) throw new Error('Rule title is required');
  if (!Number.isInteger(rule.version) || rule.version <= 0) throw new Error('Rule version must be a positive integer');
  if (
    rule.effectiveFromEdition != null &&
    rule.effectiveThroughEdition != null &&
    rule.effectiveThroughEdition < rule.effectiveFromEdition
  ) {
    throw new Error('Rule effective-through edition cannot precede effective-from edition');
  }
}

export function isRuleEffectiveForEdition(rule: ContestRuleVersion, editionNumber: number): boolean {
  if (rule.status !== 'active') return false;
  if (rule.effectiveFromEdition != null && editionNumber < rule.effectiveFromEdition) return false;
  if (rule.effectiveThroughEdition != null && editionNumber > rule.effectiveThroughEdition) return false;
  return true;
}

export function resolveActiveRules(
  versions: readonly ContestRuleVersion[],
  editionNumber: number,
): ContestRuleVersion[] {
  const effective = versions.filter((rule) => isRuleEffectiveForEdition(rule, editionNumber));
  const latest = new Map<string, ContestRuleVersion>();

  for (const rule of effective) {
    const existing = latest.get(rule.ruleId);
    if (!existing || rule.version > existing.version) latest.set(rule.ruleId, rule);
  }

  return [...latest.values()].sort((a, b) => a.ruleId.localeCompare(b.ruleId));
}

export function analyzeRuleImpact(
  ruleId: string,
  dependencies: readonly RuleDependency[],
): RuleImpact {
  const affectedSystems = dependencies
    .filter((dependency) => dependency.ruleId === ruleId)
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);

  return {
    ruleId,
    affectedSystems,
    highestSeverity: affectedSystems[0]?.severity ?? null,
  };
}

export function compareRuleConfigs(
  previous: ContestRuleVersion,
  next: ContestRuleVersion,
): string[] {
  if (previous.ruleId !== next.ruleId) throw new Error('Cannot compare versions of different rules');

  const keys = new Set([...Object.keys(previous.config), ...Object.keys(next.config)]);
  return [...keys]
    .filter((key) => JSON.stringify(previous.config[key]) !== JSON.stringify(next.config[key]))
    .sort();
}
