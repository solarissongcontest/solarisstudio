import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

const cutover = source('supabase/migrations/20261023091500_v3_canonical_result_recalculation.sql');
const resultOperations = source('supabase/migrations/20260912154500_studio2_results_operations.sql');
const adminCutover = source('supabase/migrations/20260916035015_permission_engine_v2_operational_admin_rpc_cutover.sql');

describe('V3 canonical Results recalculation authority', () => {
  it('routes the legacy recalculation entrypoint through the canonical vote projection', () => {
    expect(cutover).toContain(
      'create or replace function public.recalculate_show_results_internal(_show_id uuid)',
    );
    expect(cutover).toContain('perform public.sync_show_results_from_votes(_show_id);');
    expect(cutover).toContain('One scoring authority.');
  });

  it('does not introduce another scoring or ranking implementation in the compatibility entrypoint', () => {
    expect(cutover).not.toContain("voting_config ->> 'weightedScoring'");
    expect(cutover).not.toContain('jury_points *');
    expect(cutover).not.toContain('televote_points *');
    expect(cutover).not.toContain('row_number() over');
    expect(cutover).not.toContain('update public.results');
  });

  it('keeps calculate and Organizer manual recalculation on the same authority chain', () => {
    expect(resultOperations).toContain(
      'v_updated := public.recalculate_show_results_internal(p_show_id);',
    );
    expect(adminCutover).toContain(
      'return public.recalculate_show_results_internal(_show_id);',
    );
    expect(cutover).toContain('Canonical scoring authority is public.sync_show_results_from_votes(uuid)');
  });

  it('preserves the private compatibility boundary and returns active projected rows', () => {
    expect(cutover).toContain(
      'revoke all on function public.recalculate_show_results_internal(uuid) from public, anon, authenticated;',
    );
    expect(cutover).toContain("coalesce(p.participation_status, 'confirmed') = 'confirmed'");
    expect(cutover).toContain('return v_active_result_rows;');
  });
});
