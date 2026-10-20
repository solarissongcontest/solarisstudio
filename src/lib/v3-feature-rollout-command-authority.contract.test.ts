import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

const migration = source(
  'supabase/migrations/20261020062000_v3_feature_rollout_command_authority.sql',
);
const organizerRoute = source('src/routes/_authenticated/admin/feature-rollout.tsx');
const maintenanceGuard = source(
  'supabase/migrations/20261017210000_confirmation_maintenance_operation_claim_gate.sql',
);

describe('System V3 Feature Rollout command authority', () => {
  it('is explicitly governed by the S13 forward-fix migration contract', () => {
    expect(migration).toContain("set_config('request.jwt.claim.role', 'service_role', true)");
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("'v3.rollout.command-authority'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).toContain("set_config('request.jwt.claim.role', '', true)");
  });

  it('adds monotonic aggregate revisioning and canonical scope normalization', () => {
    expect(migration).toContain('add column if not exists revision bigint not null default 1');
    expect(migration).toContain('studio2_feature_flags_revision_check');
    expect(migration).toContain('check (revision >= 1) not valid');
    expect(migration).toContain('private.v3_normalize_rollout_uuid_array');
    expect(migration).toContain('select distinct value');
    expect(migration).toContain('array_agg(value order by value)');
  });

  it('preserves scoped rollout.manage authorization for existing and newly seeded rows', () => {
    expect(migration).toContain('private.v3_rollout_manage_allowed(');
    expect(migration).toContain('p_row_exists boolean');
    expect(migration).toContain("public.studio2_access_allowed('rollout.manage', null, false)");
    expect(migration).toContain(
      "public.studio2_access_allowed('rollout.manage', affected.edition_id, false)",
    );
    expect(migration).toContain('not v_exists and p_expected_revision <> 0');
    expect(migration).toContain('insert into public.studio2_feature_flags (');
  });

  it('keeps the current Confirmation maintenance exception while adding rollout recovery authority', () => {
    const currentConfirmationCommands = [
      'confirmation.round.status',
      'confirmation.round.editing',
      'confirmation.round.update',
    ];

    for (const command of currentConfirmationCommands) {
      expect(maintenanceGuard).toContain(`'${command}'`);
      expect(migration).toContain(`'${command}'`);
    }

    expect(migration.match(/'rollout\.change'/g)?.length).toBeGreaterThanOrEqual(3);
    expect(migration).toContain("when 'read_only' then");
    expect(migration).toContain("when 'maintenance' then");
  });

  it('binds consequential rollout changes to S2 idempotency and exact revision CAS', () => {
    expect(migration).toContain('public.studio2_feature_flag_change_preview');
    expect(migration).toContain('public.studio2_apply_feature_flag_change');
    expect(migration).toContain('private.studio2_claim_operation(');
    expect(migration).toContain("'rollout.change'");
    expect(migration).toContain("'R1'");
    expect(migration).toContain('p_expected_revision');
    expect(migration).toContain("message = 'VERSION_CONFLICT'");
    expect(migration).toContain('where key = p_key\n      and revision = p_expected_revision');
    expect(migration).toContain('private.studio2_complete_operation');
    expect(migration).toContain('public.studio2_reconcile_operation');
  });

  it('writes durable privacy-bounded audit and rollout.changed evidence in the same transaction', () => {
    expect(migration).toContain('insert into public.admin_audit_log (');
    expect(migration).toContain("'feature_rollout_changed'");
    expect(migration).toContain("'operationId', v_operation_id");
    expect(migration).toContain("'rollout.changed'");
    expect(migration).toContain("'feature_rollout'");
    expect(migration).toContain('v_after.revision');
    expect(migration).toContain('array[]::text[]');

    const auditStart = migration.indexOf('insert into public.admin_audit_log (');
    const eventStart = migration.indexOf('perform private.v3_emit_domain_event(', auditStart);
    const evidence = migration.slice(auditStart, eventStart + 1200);
    expect(evidence).toContain("'userTargetCount'");
    expect(evidence).toContain("'editionTargetCount'");
    expect(evidence).not.toContain("'userIds'");
    expect(evidence).not.toContain("'editionIds'");
  });

  it('closes runtime service-role bypasses while leaving database-owner migrations unaffected', () => {
    expect(migration).toContain(
      'revoke insert, update, delete, truncate, references, trigger\n  on table public.studio2_feature_flags\n  from service_role;',
    );
    expect(migration).toContain(
      'revoke all on function public.studio2_apply_feature_flag_change(',
    );
    expect(migration).toContain('from public, anon, service_role;');
    expect(migration).toContain(
      'revoke all on function public.studio2_set_feature_flag(\n  text, boolean, boolean, uuid[], uuid[]\n) from public, anon, service_role;',
    );
  });

  it('keeps the current Organizer route source-compatible until Chat 3 cuts over to the canonical command', () => {
    expect(organizerRoute.match(/client\.rpc\('studio2_set_feature_flag'/g)?.length).toBe(1);
    expect(migration).toContain('create or replace function public.studio2_set_feature_flag(');
    expect(migration).toContain('public.studio2_feature_flag_change_preview(');
    expect(migration).toContain('public.studio2_apply_feature_flag_change(');
    expect(migration).toContain("'rollout.change.compatibility'");
  });

  it('does not fabricate an audit/event/revision for a compatibility no-op', () => {
    const compatibilityStart = migration.indexOf(
      'create or replace function public.studio2_set_feature_flag(',
    );
    const compatibility = migration.slice(compatibilityStart);
    const noChange = compatibility.indexOf("if coalesce((v_preview ->> 'noChange')::boolean, false) then");
    const canonicalApply = compatibility.indexOf('public.studio2_apply_feature_flag_change(', noChange);

    expect(noChange).toBeGreaterThan(-1);
    expect(canonicalApply).toBeGreaterThan(noChange);
    expect(compatibility.slice(noChange, canonicalApply)).toContain('return v_row;');
  });
});
