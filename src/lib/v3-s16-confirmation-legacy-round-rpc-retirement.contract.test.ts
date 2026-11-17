import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/20261117180000_v3_s16_confirmation_legacy_round_rpc_retirement.sql', 'utf8');
const probe = readFileSync('.github/tests/v3-s16-confirmation-legacy-round-rpc-retirement.sql', 'utf8');
const adapter = readFileSync('src/integrations/confirmations/admin.ts', 'utf8');
const roundRoute = readFileSync('src/routes/confirmations/admin/rounds.tsx', 'utf8');
const runner = readFileSync('.github/scripts/v3-s16-catalog-rehearsal.sh', 'utf8');
const s14 = readFileSync('.github/workflows/v3-s14-archive-forward-effects-local.yml', 'utf8');

const legacy = [
  ['admin_confirmation_save_round', 'jsonb'],
  ['admin_confirmation_delete_round', 'uuid'],
  ['admin_confirmation_set_round_status', 'uuid,text'],
  ['admin_confirmation_set_round_editing', 'uuid,boolean'],
] as const;

describe('S16 P07 legacy Confirmation round RPC retirement', () => {
  it('physically removes all four competing legacy writers only after canonical CAS/receipt and trigger preflights', () => {
    expect(migration).toContain("current_user <> 'postgres'");
    expect(migration).toContain("server_version_num");
    expect(migration).toContain("pg_get_userbyid(p.proowner) = 'postgres'");
    expect(migration).toContain("has_function_privilege('authenticated', v_command, 'EXECUTE')");
    expect(migration).toContain("public.studio2_apply_confirmation_round_change(uuid,text,jsonb,uuid,text,bigint)");
    expect(migration).toContain('studio2_confirmation_round_touch_version');
    expect(migration).toContain('studio2_guard_direct_confirmation_round_update');
    expect(migration).toContain('studio2_guard_direct_confirmation_round_delete');
    expect(migration).toContain('v3_guard_archived_edition_workflow_write');
    for (const [name, args] of legacy) {
      expect(migration).toContain(`drop function public.${name}(${args}) restrict;`);
      expect(probe).toContain(`public.${name}`);
      expect(adapter).not.toContain(`rpc("${name}"`);
    }
    expect(migration).not.toMatch(/drop trigger|disable trigger|disable row level security|create or replace function/i);
  });
  it('preserves the actual Organizer preview-apply path instead of hiding its UI', () => {
    expect(adapter).toContain('"studio2_confirmation_round_change_preview"');
    expect(adapter).toContain('"studio2_apply_confirmation_round_change"');
    expect(roundRoute).toContain('applyConfirmationRoundChange');
    expect(roundRoute).toContain('previewConfirmationRoundChange');
    expect(roundRoute).toContain('expectedVersion: pending.preview.expectedVersion');
    expect(roundRoute).toContain('idempotencyKey: pending.idempotencyKey');
    for (const [name] of legacy) {
      expect(roundRoute).not.toContain(name);
    }
  });
  it('executes real anon, authenticated, service_role SQL denials in the isolated PG17 source and maintains independent exact-SHA S14 producer', () => {
    for (const role of ['anon', 'authenticated', 'service_role']) {
      expect(probe).toContain(`set local role ${role};`);
      expect(probe).toContain(`4 absent legacy Confirmation round RPCs as ${role}`);
    }
    expect((probe.match(/exception when undefined_function then null/g) || []).length).toBe(12);
    expect(runner).toContain('v3-s16-confirmation-legacy-round-rpc-retirement.sql');
    expect(s14).toContain('20261117180000_v3_s16_confirmation_legacy_round_rpc_retirement.sql');
    expect(s14).toContain('v3-s16-confirmation-legacy-round-rpc-retirement.sql');
  });
});
