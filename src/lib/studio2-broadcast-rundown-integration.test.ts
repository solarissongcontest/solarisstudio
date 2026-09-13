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
const migration = source('supabase/migrations/20260912141000_studio2_advanced_broadcast_workflows.sql');
const liveLockGuard = source('supabase/migrations/20260912141100_studio2_broadcast_live_lock_guard.sql');

describe('Studio 2 Phase 8 advanced broadcast workflows', () => {
  it('extends the existing Organizer rundown surface and timing engine', () => {
    expect(nav).toContain('"Broadcast rundown",');
    expect(nav).toContain('"/admin/broadcast-rundown"');
    expect(route).toContain("createFileRoute('/_authenticated/admin/broadcast-rundown')");
    expect(route).toContain('buildBroadcastRundown');
    expect(timingEngine).toContain("['planned', 'ready', 'live', 'completed', 'skipped']");
  });

  it('replaces direct browser writes with narrow revision-aware server commands', () => {
    expect(adapter).toContain("'studio2_broadcast_rundown'");
    expect(adapter).toContain("'studio2_save_broadcast_rundown'");
    expect(adapter).toContain("'studio2_set_broadcast_rundown_lock'");
    expect(adapter).toContain("'studio2_transition_broadcast_segment'");
    expect(adapter).not.toContain("from('shows')");
    expect(adapter).not.toContain('.update(');
    expect(route).not.toContain("from('shows')");
    expect(route).not.toContain('.update(');
    expect(migration).toContain('p_expected_revision integer');
    expect(migration).toContain('for update');
    expect(migration).toContain("using errcode = '40001'");
  });

  it('requires server authorization, reasons and an explicit rundown lock for live production', () => {
    expect(migration).toContain("private.studio2_user_has_capability(p_user_id, 'edition.manage', p_edition_id)");
    expect(migration).toContain("public.has_role(p_user_id, 'organizer'::public.app_role)");
    expect(migration).toContain("length(v_reason) < 5");
    expect(liveLockGuard).toContain("segment ->> 'status' = 'live'");
    expect(liveLockGuard).toContain("nullif(v_rundown ->> 'lockedAt', '') is null");
    expect(liveLockGuard).toContain('Lock the broadcast rundown before taking a segment live');
    expect(liveLockGuard).toContain('before update of broadcast_config on public.shows');
    expect(route).toContain('Lock rundown');
    expect(route).toContain('window.confirm');
    expect(route).toContain('window.prompt');
  });

  it('keeps rehearsal transitions local and incapable of writing production state', () => {
    expect(adapter).toContain("if (mode === 'rehearsal') return rehearseStudio2BroadcastTransition");
    expect(route).toContain("(['production', 'rehearsal'] as const)");
    expect(route).toContain('Rehearsal mode never calls a production mutation.');
  });

  it('audits production lifecycle changes through the canonical event vocabulary', () => {
    expect(migration).toContain("'broadcast.segment_started'");
    expect(migration).toContain("'broadcast.segment_completed'");
    expect(migration).toContain("'rule.changed'");
    expect(migration).toContain("'broadcast.rundown_updated'");
    expect(migration).toContain("'broadcast.rundown_locked'");
    expect(migration).toContain("'broadcast.rundown_unlocked'");
    expect(migration).toContain('insert into public.studio2_contest_events');
    expect(migration).not.toContain('studio2_contest_events_type_check');
    expect(liveLockGuard).not.toContain('studio2_contest_events_type_check');
  });

  it('does not create a parallel rundown table or duplicate the timing algorithm', () => {
    expect(migration).not.toContain('create table');
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

  it('does not touch unrelated rules or friend-voting systems', () => {
    expect(route).not.toContain('/rules');
    expect(route).not.toContain('friend-voting');
    expect(adapter).not.toContain('rules_engine');
  });
});
