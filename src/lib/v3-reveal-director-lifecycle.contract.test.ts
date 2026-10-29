import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20261026190500_v3_reveal_director_lifecycle.sql',
  'utf8',
);
const client = readFileSync('src/lib/results-reveal-lifecycle.ts', 'utf8');
const route = readFileSync('src/routes/_authenticated/admin/results-reveal.tsx', 'utf8');

describe('V3 Reveal Director governed lifecycle contract', () => {
  it('persists only the canonical Planning/Rehearsal/Armed/Live/Complete state vocabulary', () => {
    for (const state of ['planning', 'rehearsal', 'armed', 'live', 'complete']) {
      expect(migration).toContain(`'${state}'`);
    }
    expect(migration).toContain('private.v3_reveal_transition_allowed');
    expect(migration).toContain("p_from = 'armed' and p_to in ('rehearsal', 'live')");
    expect(migration).toContain("p_from = 'live' and p_to = 'complete'");
  });

  it('prevents arbitrary browser writes and enforces capability + edition/show scope server-side', () => {
    expect(migration).toContain('revoke all on table public.studio2_reveal_runtime from public, anon, authenticated');
    expect(migration).toContain('Reveal lifecycle changes must use the canonical V3 reveal command.');
    expect(migration).toContain("studio2_access_allowed('broadcast.manage', v_edition_id, false)");
    expect(migration).toContain("studio2_access_allowed('broadcast.control', v_edition_id, false)");
    expect(migration).toContain('v_runtime.edition_id is distinct from v_edition_id');
  });

  it('binds Armed and Live to the existing exact Results reveal-ready version without calculating Results', () => {
    expect(migration).toContain('public.studio2_result_operations');
    expect(migration).toContain('v_result_ops.reveal_ready_version is distinct from v_result_ops.calculation_version');
    expect(migration).toContain('v_runtime.locked_result_version is distinct from v_result_ops.calculation_version');
    expect(migration).not.toContain('recalculate_show_results');
    expect(migration).not.toContain('calculate_televote');
    expect(migration).not.toMatch(/update\s+public\.results/i);
  });

  it('uses CAS versions, durable idempotency receipts and canonical reconciliation', () => {
    expect(migration).toContain('p_expected_version bigint');
    expect(migration).toContain('private.studio2_claim_operation');
    expect(migration).toContain('private.studio2_complete_operation');
    expect(migration).toContain("errcode = 'PT409', message = 'VERSION_CONFLICT'");
    expect(client).toContain("'studio2_reconcile_operation'");
    expect(client).toContain('result.previousVersion !== request.expectedVersion');
    expect(client).toContain('result.version !== request.expectedVersion + 1');
  });

  it('emits live-show facts while keeping broader show consequences explicitly outside this slice', () => {
    expect(migration).toContain("'show.changed'");
    expect(migration).toContain("'show.cue_changed'");
    expect(migration).toContain("'live-show'");
    expect(migration).toContain('private.v3_emit_domain_event');
  });

  it('does not expose the Armed plan or future results through the public projection', () => {
    const publicProjection = migration.slice(migration.indexOf('create or replace function public.studio2_public_reveal_snapshot'));
    expect(publicProjection).toContain("v_runtime.state not in ('live', 'complete')");
    expect(publicProjection).toContain("jsonb_build_object('state', 'hidden')");
    expect(publicProjection).toContain("'lastRevealedId', v_last_revealed");
    expect(publicProjection).not.toContain("'sequence', v_runtime.sequence");
    expect(publicProjection).not.toContain("'points'");
  });

  it('makes Organizer consume the server snapshot and governed mutations', () => {
    expect(route).toContain('loadRevealDirectorSnapshot');
    expect(route).toContain('configureRevealPlan');
    expect(route).toContain('transitionReveal');
    expect(route).toContain('advanceReveal');
    expect(route).toContain('Arm locked sequence');
    expect(route).toContain('Disarm to rehearsal');
    expect(route).toContain('Start live reveal');
    expect(route).toContain('Advance next reveal');
    expect(route).toContain('Complete reveal');
    expect(route).not.toContain('server authority required before production use');
  });
});
