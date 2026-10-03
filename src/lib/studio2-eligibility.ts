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

export type Studio2EligibilityOverrideAction = 'create' | 'revoke';

export type Studio2EligibilityOverridePreview = {
  riskClass: 'R2';
  action: Studio2EligibilityOverrideAction;
  editionId: string;
  countryId: string;
  countryName: string;
  affectedRule: string;
  overrideId: string | null;
  expectedVersion: number;
  activeOverrideId: string | null;
  activeOverrideReason: string | null;
  activeOverrideExpiresAt: string | null;
  historyCount: number;
  alreadyApplied: boolean;
};

export type Studio2EligibilityOverrideReceipt = Studio2EligibilityOverride & {
  ok: true;
  riskClass: 'R2';
  action: Studio2EligibilityOverrideAction;
  operationId: string;
  previousVersion: number;
  version: number;
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

const ENTRY_VALIDITY_DEDICATED_CHECK_IDS = new Set([
  'country-confirmed',
  'broadcaster-approval',
  'video',
  'artwork',
  'deadline',
]);

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

function entryValidityChecks(row: Studio2CountryCockpitRow) {
  return row.eligibility.checks.filter((check) => !ENTRY_VALIDITY_DEDICATED_CHECK_IDS.has(check.id));
}

function entryValidityStatus(
  row: Studio2CountryCockpitRow,
): Exclude<Studio2EligibilityStatus, 'overridden'> {
  const checks = entryValidityChecks(row);
  if (checks.some((check) => check.level === 'blocked')) return 'blocked';
  if (checks.some((check) => check.level === 'warning')) return 'warning';
  return 'eligible';
}

function entryValidityMessage(
  row: Studio2CountryCockpitRow,
  status: Exclude<Studio2EligibilityStatus, 'overridden'>,
): string {
  if (!row.context.entry) return 'No current entry is available.';
  if (status === 'blocked') return 'The current entry has blocking content eligibility requirements.';
  if (status === 'warning') return 'The current entry has content eligibility warnings.';
  return 'The current entry passes entry-content eligibility checks.';
}

function detailEvidence(row: Studio2CountryCockpitRow, ruleId: string, fallback: string): string[] {
  if (ruleId === 'entry-validity') {
    const checks = entryValidityChecks(row)
      .filter((check) => check.level !== 'pass')
      .map((check) => `${check.label}: ${check.message}`);
    return checks.length ? checks : [fallback];
  }
  if (ruleId === 'jury') {
    return [
      'Jury model: one HOD per country',
      `HOD assigned: ${row.context.juryMembersAssigned === 1 ? 'yes' : 'no'}`,
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
    { id: 'jury', label: 'HOD jury', domain: 'jury', attention: 'incomplete' },
    { id: 'media', label: 'Required media', domain: 'media', attention: 'incomplete' },
    { id: 'deadlines', label: 'Delegation deadlines', domain: 'deadlines', attention: 'warning' },
    { id: 'organizer-issues', label: 'Organizer issues', domain: 'operations', attention: 'warning' },
  ];

  const rules: Studio2EligibilityRule[] = definitions.map((definition) => {
    const signal = signals.get(definition.id);
    let factualStatus = signal
      ? statusFromSignal(signal.state, definition.attention)
      : 'incomplete';
    let message = signal?.message ?? 'Operational status is unavailable.';

    if (definition.id === 'entry-validity') {
      factualStatus = entryValidityStatus(row);
      message = entryValidityMessage(row, factualStatus);
    }

    const override = factualStatus === 'eligible' ? null : overrideByRule.get(definition.id) ?? null;
    return {
      id: definition.id,
      label: definition.label,
      domain: definition.domain,
      factualStatus,
      effectiveStatus: override ? 'overridden' : factualStatus,
      message,
      evidence: detailEvidence(row, definition.id, message),
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

function readinessStateFromEligibilityStatus(
  status: Studio2EligibilityStatus,
): CountryReadinessSignal['state'] {
  if (status === 'blocked') return 'blocked';
  if (status === 'incomplete' || status === 'warning') return 'attention';
  return 'ready';
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
    if (!rule) return signal;

    const state = readinessStateFromEligibilityStatus(rule.effectiveStatus);
    const message = rule.effectiveStatus === 'overridden'
      ? `${rule.message} An organizer eligibility override is active.`
      : rule.message;

    if (state === signal.state && message === signal.message) return signal;
    return { ...signal, state, message };
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

function eligibilityOverrideAction(value: unknown): Studio2EligibilityOverrideAction {
  if (value === 'create' || value === 'revoke') return value;
  throw new Error('Invalid eligibility override action');
}

function mapEligibilityOverridePreview(value: unknown): Studio2EligibilityOverridePreview {
  const row = object(value, 'eligibility override preview');
  if (row.riskClass !== 'R2') throw new Error('Eligibility override changes must be R2.');
  return {
    riskClass: 'R2',
    action: eligibilityOverrideAction(row.action),
    editionId: string(row.editionId, 'preview edition id'),
    countryId: string(row.countryId, 'preview country id'),
    countryName: string(row.countryName, 'preview country name'),
    affectedRule: string(row.affectedRule, 'preview affected rule'),
    overrideId: nullableString(row.overrideId, 'preview override id'),
    expectedVersion: Number(row.expectedVersion ?? 0),
    activeOverrideId: nullableString(row.activeOverrideId, 'active override id'),
    activeOverrideReason: nullableString(row.activeOverrideReason, 'active override reason'),
    activeOverrideExpiresAt: nullableString(row.activeOverrideExpiresAt, 'active override expiry'),
    historyCount: Number(row.historyCount ?? 0),
    alreadyApplied: row.alreadyApplied === true,
  };
}

export async function previewStudio2EligibilityOverrideChange(
  input: {
    action: Studio2EligibilityOverrideAction;
    editionId: string;
    countryId: string;
    affectedRule: string;
    overrideId?: string | null;
  },
  client: SupabaseRpcClient = supabase as unknown as SupabaseRpcClient,
): Promise<Studio2EligibilityOverridePreview> {
  const data = await rpc(
    'studio2_eligibility_override_change_preview',
    {
      p_action: input.action,
      p_edition_id: input.editionId,
      p_country_id: input.countryId,
      p_affected_rule: input.affectedRule,
      p_override_id: input.overrideId ?? null,
    },
    client,
  );
  return mapEligibilityOverridePreview(data);
}

export async function applyStudio2EligibilityOverrideChange(
  input: {
    action: Studio2EligibilityOverrideAction;
    editionId: string;
    countryId: string;
    affectedRule: string;
    overrideId?: string | null;
    reason: string;
    expiresAt?: string | null;
    operationId: string;
    idempotencyKey: string;
    expectedVersion: number;
  },
  client: SupabaseRpcClient = supabase as unknown as SupabaseRpcClient,
): Promise<Studio2EligibilityOverrideReceipt> {
  const data = await rpc(
    'studio2_apply_eligibility_override_change',
    {
      p_action: input.action,
      p_edition_id: input.editionId,
      p_country_id: input.countryId,
      p_affected_rule: input.affectedRule,
      p_override_id: input.overrideId ?? null,
      p_reason: input.reason,
      p_expires_at: input.expiresAt ?? null,
      p_operation_id: input.operationId,
      p_idempotency_key: input.idempotencyKey,
      p_expected_version: input.expectedVersion,
    },
    client,
  );

  const row = object(data, 'eligibility override receipt');
  const override = mapOverride(row);
  if (row.ok !== true || row.riskClass !== 'R2') {
    throw new Error('Eligibility override change did not return an R2 receipt.');
  }
  return {
    ...override,
    ok: true,
    riskClass: 'R2',
    action: eligibilityOverrideAction(row.action),
    operationId: string(row.operationId, 'override operation id'),
    previousVersion: Number(row.previousVersion ?? 0),
    version: Number(row.version ?? 0),
  };
}
