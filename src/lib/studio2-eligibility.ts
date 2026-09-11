import { supabase } from '@/integrations/supabase/client';
import type { CountryOperationalReadiness, CountryReadinessSignal } from './country-operational-readiness';
import type { Studio2CountryCockpitRow } from './studio2-country-cockpit';

export type Studio2EligibilityStatus = 'eligible' | 'incomplete' | 'warning' | 'blocked' | 'overridden';
export type Studio2EligibilityDomain = 'participation' | 'entry' | 'jury' | 'media' | 'deadlines' | 'operations';

export type Studio2EligibilityOverride = {
  id: string;
  editionId: string;
  countryId: string;
  countryName: string;
  affectedRule: string;
  reason: string;
  createdBy: string | null;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
  revocationReason: string | null;
};

export type Studio2EligibilityRule = {
  id: string;
  label: string;
  domain: Studio2EligibilityDomain;
  factualStatus: Exclude<Studio2EligibilityStatus, 'overridden'>;
  effectiveStatus: Studio2EligibilityStatus;
  message: string;
  evidence: string[];
  override: Studio2EligibilityOverride | null;
};

export type Studio2EligibilityCountry = {
  editionId: string;
  countryId: string;
  countryName: string;
  participation: Studio2EligibilityStatus;
  entry: Studio2EligibilityStatus;
  jury: Studio2EligibilityStatus;
  media: Studio2EligibilityStatus;
  deadlines: Studio2EligibilityStatus;
  overall: Studio2EligibilityStatus;
  factualOverall: Exclude<Studio2EligibilityStatus, 'overridden'>;
  rules: Studio2EligibilityRule[];
  issues: Studio2EligibilityRule[];
  activeOverrides: Studio2EligibilityOverride[];
};

type SupabaseRpcClient = {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${label}`);
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`Invalid ${label}`);
  return value;
}

function nullableString(value: unknown, label: string): string | null {
  if (value == null) return null;
  return string(value, label);
}

function mapOverride(value: unknown): Studio2EligibilityOverride {
  const row = object(value, 'eligibility override');
  return {
    id: string(row.id, 'override id'),
    editionId: string(row.editionId, 'override edition id'),
    countryId: string(row.countryId, 'override country id'),
    countryName: string(row.countryName, 'override country name'),
    affectedRule: string(row.affectedRule, 'override affected rule'),
    reason: string(row.reason, 'override reason'),
    createdBy: nullableString(row.createdBy, 'override creator'),
    createdAt: string(row.createdAt, 'override created at'),
    expiresAt: nullableString(row.expiresAt, 'override expiry'),
    revokedAt: nullableString(row.revokedAt, 'override revoked at'),
    revokedBy: nullableString(row.revokedBy, 'override revoker'),
    revocationReason: nullableString(row.revocationReason, 'override revocation reason'),
  };
}

export function isStudio2EligibilityOverrideActive(
  override: Studio2EligibilityOverride,
  now = new Date(),
): boolean {
  if (override.revokedAt) return false;
  if (!override.expiresAt) return true;
  const expiry = new Date(override.expiresAt).getTime();
  return Number.isFinite(expiry) && expiry > now.getTime();
}

function statusFromSignal(
  signalState: 'ready' | 'attention' | 'blocked',
  attentionStatus: 'incomplete' | 'warning',
): Exclude<Studio2EligibilityStatus, 'overridden'> {
  if (signalState === 'blocked') return 'blocked';
  if (signalState === 'attention') return attentionStatus;
  return 'eligible';
}

function strongestStatus(statuses: readonly Studio2EligibilityStatus[]): Studio2EligibilityStatus {
  if (statuses.includes('blocked')) return 'blocked';
  if (statuses.includes('incomplete')) return 'incomplete';
  if (statuses.includes('warning')) return 'warning';
  if (statuses.includes('overridden')) return 'overridden';
  return 'eligible';
}

function factualStrongest(
  statuses: readonly Exclude<Studio2EligibilityStatus, 'overridden'>[],
): Exclude<Studio2EligibilityStatus, 'overridden'> {
  if (statuses.includes('blocked')) return 'blocked';
  if (statuses.includes('incomplete')) return 'incomplete';
  if (statuses.includes('warning')) return 'warning';
  return 'eligible';
}

function detailEvidence(row: Studio2CountryCockpitRow, ruleId: string, fallback: string): string[] {
  if (ruleId === 'entry-validity') {
    const checks = row.eligibility.checks
      .filter((check) => check.level !== 'pass')
      .map((check) => `${check.label}: ${check.message}`);
    return checks.length ? checks : [fallback];
  }
  if (ruleId === 'jury') {
    return [
      `Required: ${row.context.juryMembersRequired}`,
      `Assigned: ${row.context.juryMembersAssigned}`,
      fallback,
    ];
  }
  if (ruleId === 'deadlines') {
    const deadlines = row.operationalReadiness.overdueDeadlines.map(
      (deadline) => `${deadline.label}: overdue since ${deadline.dueAt}`,
    );
    return deadlines.length ? deadlines : [fallback];
  }
  return [fallback];
}

export function buildStudio2EligibilityCountry(
  row: Studio2CountryCockpitRow,
  overrides: readonly Studio2EligibilityOverride[],
  now = new Date(),
): Studio2EligibilityCountry {
  const activeOverrides = overrides.filter(
    (override) =>
      override.editionId === row.context.editionId &&
      override.countryId === row.context.countryId &&
      isStudio2EligibilityOverrideActive(override, now),
  );
  const overrideByRule = new Map(activeOverrides.map((override) => [override.affectedRule, override]));
  const signals = new Map<string, CountryReadinessSignal>(
    row.operationalReadiness.signals.map((signal) => [signal.id, signal]),
  );

  const definitions: Array<{
    id: string;
    label: string;
    domain: Studio2EligibilityDomain;
    attention: 'incomplete' | 'warning';
  }> = [
    { id: 'participation', label: 'Participation', domain: 'participation', attention: 'incomplete' },
    { id: 'entry-validity', label: 'Entry validity', domain: 'entry', attention: 'warning' },
    { id: 'entry-approval', label: 'Entry approval', domain: 'entry', attention: 'incomplete' },
    { id: 'jury', label: 'Jury roster', domain: 'jury', attention: 'incomplete' },
    { id: 'media', label: 'Required media', domain: 'media', attention: 'incomplete' },
    { id: 'deadlines', label: 'Delegation deadlines', domain: 'deadlines', attention: 'warning' },
    { id: 'organizer-issues', label: 'Organizer issues', domain: 'operations', attention: 'warning' },
  ];

  const rules: Studio2EligibilityRule[] = definitions.map((definition) => {
    const signal = signals.get(definition.id);
    const factualStatus = signal
      ? statusFromSignal(signal.state, definition.attention)
      : 'incomplete';
    const override = factualStatus === 'eligible' ? null : overrideByRule.get(definition.id) ?? null;
    return {
      id: definition.id,
      label: definition.label,
      domain: definition.domain,
      factualStatus,
      effectiveStatus: override ? 'overridden' : factualStatus,
      message: signal?.message ?? 'Operational status is unavailable.',
      evidence: detailEvidence(row, definition.id, signal?.message ?? 'Operational status is unavailable.'),
      override,
    };
  });

  const domainStatus = (domain: Studio2EligibilityDomain) =>
    strongestStatus(rules.filter((rule) => rule.domain === domain).map((rule) => rule.effectiveStatus));
  const factualOverall = factualStrongest(rules.map((rule) => rule.factualStatus));
  const overall = strongestStatus(rules.map((rule) => rule.effectiveStatus));

  return {
    editionId: row.context.editionId,
    countryId: row.context.countryId,
    countryName: row.context.countryName,
    participation: domainStatus('participation'),
    entry: domainStatus('entry'),
    jury: domainStatus('jury'),
    media: domainStatus('media'),
    deadlines: domainStatus('deadlines'),
    overall,
    factualOverall,
    rules,
    issues: rules.filter((rule) => rule.factualStatus !== 'eligible'),
    activeOverrides,
  };
}

export function buildStudio2EligibilityMatrix(
  rows: readonly Studio2CountryCockpitRow[],
  overrides: readonly Studio2EligibilityOverride[],
  now = new Date(),
): Studio2EligibilityCountry[] {
  return rows
    .map((row) => buildStudio2EligibilityCountry(row, overrides, now))
    .sort((a, b) => a.countryName.localeCompare(b.countryName));
}

export function applyStudio2EligibilityOverridesToReadiness(
  row: Studio2CountryCockpitRow,
  overrides: readonly Studio2EligibilityOverride[],
  now = new Date(),
): CountryOperationalReadiness {
  const eligibility = buildStudio2EligibilityCountry(row, overrides, now);
  const ruleById = new Map(eligibility.rules.map((rule) => [rule.id, rule]));
  const signals = row.operationalReadiness.signals.map((signal) => {
    const rule = ruleById.get(signal.id);
    if (rule?.effectiveStatus !== 'overridden') return signal;
    return {
      ...signal,
      state: 'ready' as const,
      message: `${signal.message} An organizer eligibility override is active.`,
    };
  });
  const blockers = signals.filter((signal) => signal.state === 'blocked');
  const attention = signals.filter((signal) => signal.state === 'attention');
  const readyCount = signals.filter((signal) => signal.state === 'ready').length;
  const score = signals.length
    ? Math.round(((readyCount + attention.length * 0.5) / signals.length) * 100)
    : 100;
  const state = blockers.length ? 'blocked' as const : attention.length ? 'attention_required' as const : 'ready' as const;

  return {
    ...row.operationalReadiness,
    state,
    score,
    signals,
    blockers,
    attention,
  };
}

async function rpc(
  name: string,
  args: Record<string, unknown>,
  client: SupabaseRpcClient = supabase as unknown as SupabaseRpcClient,
): Promise<unknown> {
  const { data, error } = await client.rpc(name, args);
  if (error) throw error;
  return data;
}

export async function listStudio2EligibilityOverrides(
  editionId: string,
  options: { countryId?: string | null; includeHistory?: boolean } = {},
  client: SupabaseRpcClient = supabase as unknown as SupabaseRpcClient,
): Promise<Studio2EligibilityOverride[]> {
  if (!editionId) return [];
  const data = await rpc(
    'studio2_list_eligibility_overrides',
    {
      p_edition_id: editionId,
      p_country_id: options.countryId ?? null,
      p_include_history: options.includeHistory ?? false,
    },
    client,
  );
  return Array.isArray(data) ? data.map(mapOverride) : [];
}

export async function createStudio2EligibilityOverride(
  input: {
    editionId: string;
    countryId: string;
    affectedRule: string;
    reason: string;
    expiresAt?: string | null;
  },
  client: SupabaseRpcClient = supabase as unknown as SupabaseRpcClient,
): Promise<Studio2EligibilityOverride> {
  const data = await rpc(
    'studio2_create_eligibility_override',
    {
      p_edition_id: input.editionId,
      p_country_id: input.countryId,
      p_affected_rule: input.affectedRule,
      p_reason: input.reason,
      p_expires_at: input.expiresAt ?? null,
    },
    client,
  );
  return mapOverride(data);
}

export async function revokeStudio2EligibilityOverride(
  overrideId: string,
  reason: string,
  client: SupabaseRpcClient = supabase as unknown as SupabaseRpcClient,
): Promise<Studio2EligibilityOverride> {
  const data = await rpc(
    'studio2_revoke_eligibility_override',
    { p_override_id: overrideId, p_reason: reason },
    client,
  );
  return mapOverride(data);
}
