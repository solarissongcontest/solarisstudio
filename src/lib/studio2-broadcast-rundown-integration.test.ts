import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

const nav = source('src/components/admin/admin-navigation.ts');
const route = source('src/routes/_authenticated/admin/broadcast-rundown.tsx');
const adapter = source('src/lib/studio2-broadcast-rundown.ts');
const timingEngine = source('src/lib/broadcast-rundown.ts');
const legacyMigration = source('supabase/migrations/20260912141000_studio2_advanced_broadcast_workflows.sql');
const liveLockGuard = source('supabase/migrations/20260912141100_studio2_broadcast_live_lock_guard.sql');
const structuralLockRecovery = source('supabase/migrations/20261028045749_v3_show_structural_lock_recovery.sql');
const authority = source('supabase/migrations/20261027204600_v3_show_cue_authority.sql');

describe('Studio 2 Phase 8 advanced broadcast workflows', () => {
  it('extends the existing Organizer rundown surface and timing engine', () => {
    expect(nav).toContain('"Broadcast rundown",');
    expect(nav).toContain('"/admin/broadcast-rundown"');
    expect(route).toContain("createFileRoute('/_authenticated/admin/broadcast-rundown')");
    expect(route).toContain('buildBroadcastRundown');
    expect(timingEngine).toContain("['planned', 'ready', 'live', 'completed', 'skipped']");
  });

  it('routes browser cue mutations through the canonical V3 operation commands', () => {
    expect(adapter).toContain("'studio2_broadcast_rundown'");
    expect(adapter).toContain("'v3_save_show_rundown'");
    expect(adapter).toContain("'v3_set_show_rundown_lock'");
    expect(adapter).toContain("'v3_transition_show_cue'");
    expect(adapter).toContain('p_operation_id');
    expect(adapter).toContain('p_idempotency_key');
    expect(adapter).toContain("response = await client.rpc(name, args)");
    expect(adapter).not.toContain("from('shows')");
    expect(adapter).not.toContain('.update(');
    expect(route).not.toContain("from('shows')");
    expect(route).not.toContain('.update(');
  });

  it('keeps row locking, revision CAS and legal transitions while allowing governed structural-lock recovery', () => {
    expect(legacyMigration).toContain('p_expected_revision integer');
    expect(legacyMigration).toContain('for update');
    expect(legacyMigration).toContain("using errcode = '40001'");
    expect(legacyMigration).toContain("(v_from_status = 'planned' and p_to_status in ('ready', 'skipped'))");
    expect(legacyMigration).toContain("(v_from_status = 'ready' and p_to_status in ('live', 'skipped'))");
    expect(legacyMigration).toContain("(v_from_status = 'live' and p_to_status in ('completed', 'skipped'))");
    expect(liveLockGuard).toContain("segment ->> 'status' = 'live'");
    expect(structuralLockRecovery).toContain('private.v3_show_cue_operation_is_current');
    expect(structuralLockRecovery).toContain('Only one rundown segment may be live');
    expect(structuralLockRecovery).not.toContain("nullif(v_rundown ->> 'lockedAt', '') is null");
    expect(liveLockGuard).toContain('before update of broadcast_config on public.shows');
  });

  it('cuts off the legacy peer RPCs and rejects raw cue-subtree updates including service-role DML', () => {
    expect(authority).toContain('create trigger v3_guard_show_cue_authority');
    expect(authority).toContain("message = 'SHOW_CUE_AUTHORITY'");
    expect(authority).toContain("receipt.command in (\n        'show.cue.configure',\n        'show.cue.lock',\n        'show.cue.transition'");
    expect(authority).toContain('revoke all on function public.studio2_save_broadcast_rundown');
    expect(authority).toContain('from public, anon, authenticated, service_role');
    expect(authority).toContain('revoke all on function public.v3_transition_show_cue');
    expect(authority).toContain('from public, anon, service_role');
    expect(authority).toContain('to authenticated;');
  });

  it('binds cue changes to durable operations and the canonical show.cue_changed fact', () => {
    expect(authority).toContain("'show.cue.configure'");
    expect(authority).toContain("'show.cue.lock'");
    expect(authority).toContain("'show.cue.transition'");
    expect(authority).toContain('private.studio2_claim_operation(');
    expect(authority).toContain("'show.cue_changed'");
    expect(authority).toContain('private.v3_emit_domain_event(');
    expect(authority).toContain('private.studio2_complete_operation(p_operation_id, v_result)');
    expect(authority).toContain("return v_claim -> 'result' -> 'rundown'");
  });

  it('preserves runtime-owned showMode and cue state when edition design inheritance runs', () => {
    expect(authority).toContain("jsonb_build_object('showMode', show_row.broadcast_config -> 'showMode')");
    expect(authority).toContain("jsonb_build_object('studio2Rundown', show_row.broadcast_config -> 'studio2Rundown')");
    expect(authority).toContain('set search_path = pg_catalog, public');
    expect(authority).toContain('revoke all on function public.sync_edition_design_to_shows()');
  });

  it('requires server authorization and reviewed reasons while exposing structural editing coordination', () => {
    expect(legacyMigration).toContain("private.studio2_user_has_capability(p_user_id, 'edition.manage', p_edition_id)");
    expect(legacyMigration).toContain("public.has_role(p_user_id, 'organizer'::public.app_role)");
    expect(legacyMigration).toContain('length(v_reason) < 5');
    expect(route).toContain('Lock rundown');
    expect(route).toContain('AdminConfirmSheet');
    expect(route).not.toContain('window.confirm');
    expect(route).not.toContain('window.prompt');
    expect(route).toContain('Operator reason');
    expect(route).toContain('At least 5 characters. The reason is stored with the audited command.');
  });

  it('keeps rehearsal transitions local and incapable of writing production state', () => {
    expect(adapter).toContain("if (mode === 'rehearsal') return rehearseStudio2BroadcastTransition");
    expect(route).toContain("(['production', 'rehearsal'] as const)");
    expect(route).toContain('Rehearsal mode never calls a production mutation.');
  });

  it('does not create a parallel rundown table or duplicate the timing algorithm', () => {
    expect(authority).not.toContain('create table');
    expect(liveLockGuard).not.toContain('create table');
    expect(adapter).toContain("from './broadcast-rundown'");
    expect(adapter).toContain('buildBroadcastRundown');
    expect(adapter).not.toContain('studio2_broadcast_rundown_segments');
  });

  it('keeps the feature rollout gate and surfaces readiness, locking, revision and drift', () => {
    expect(adapter).toContain("isStudio2FeatureEnabled('broadcast_rundown')");
    expect(route).toContain('revision {draft.revision}');
    expect(route).toContain('Readiness');
    expect(route).toContain('Current drift');
    expect(route).toContain('Estimated broadcast clock');
  });

  it('does not touch unrelated rules, Televote authority or Results ownership', () => {
    expect(route).not.toContain('/rules');
    expect(route).not.toContain('friend-voting');
    expect(adapter).not.toContain('rules_engine');
    expect(authority).not.toContain('televoting_round_bindings');
    expect(authority).not.toContain('studio2_recalculate_results');
  });
});
