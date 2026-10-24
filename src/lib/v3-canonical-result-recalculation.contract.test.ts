import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

const cutover = source('supabase/migrations/20261024223100_v3_canonical_result_recalculation.sql');
const resultOperations = source('supabase/migrations/20260912154500_studio2_results_operations.sql');
const adminCutover = source('supabase/migrations/20260916035015_permission_engine_v2_operational_admin_rpc_cutover.sql');

describe('V3 canonical Results recalculation authority', () => {
  it('registers a valid forward-only S13 migration contract', () => {
    expect(cutover).toContain("'v3.results.canonical-recalculation'");
    expect(cutover).toContain("'forward_fix_only'");
    expect(cutover).toContain("false,\n  null,");
    expect(cutover).not.toContain("array[]::text[]");
    expect(cutover).not.toContain("'forward_fix',");
  });

  it('routes the legacy recalculation entrypoint through the canonical vote projection', () => {
    expect(cutover).toContain('create or replace function public.recalculate_show_results_internal(');
    expect(cutover).toContain('perform public.sync_show_results_from_votes(_show_id);');
    expect(cutover).toContain('One scoring authority.');
    expect(cutover).toContain('Canonical scoring authority is public.sync_show_results_from_votes(uuid)');
  });

  it('does not introduce another scoring or ranking implementation in the compatibility entrypoint', () => {
    expect(cutover).not.toContain("voting_config ->> 'weightedScoring'");
    expect(cutover).not.toContain('jury_points *');
    expect(cutover).not.toContain('televote_points *');
    expect(cutover).not.toContain('row_number() over');
    expect(cutover).not.toContain('update public.results');
  });

  it('keeps calculate and Organizer manual recalculation on the same authority chain', () => {
    expect(resultOperations).toContain('v_updated := public.recalculate_show_results_internal(p_show_id);');
    expect(adminCutover).toContain('return public.recalculate_show_results_internal(_show_id);');
  });

  it('serializes retries and counts canonical active identities instead of a removed legacy participant link', () => {
    expect(cutover).toContain('pg_advisory_xact_lock(');
    expect(cutover).toContain("'v3-results-recalculate:' || _show_id::text");
    expect(cutover).toContain("coalesce(participant.participation_status, 'confirmed') = 'confirmed'");
    expect(cutover).toContain('return v_active_result_rows;');
    expect(cutover).not.toContain('r.participant_id');
    expect(cutover).not.toContain("p.status = 'confirmed'");
  });

  it('preserves the private compatibility boundary', () => {
    expect(cutover).toContain('revoke all on function public.recalculate_show_results_internal(uuid)');
    expect(cutover).toContain('from public, anon, authenticated;');
  });
});
