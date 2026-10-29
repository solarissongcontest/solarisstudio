import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const sql = readFileSync('supabase/migrations/20261029072852_v3_combined_calculation_authority.sql', 'utf8');
const server = readFileSync('src/integrations/televoting/combined.server.ts', 'utf8');
const family = server.split('export async function recalculateMergedCombinedServer')[1].split('export async function setMergedCombinedStatusServer')[0];
describe('canonical Combined calculation', () => {
 it('accepts only identity and reviewed version, derives canonical inputs in SQL', () => {
  expect(family).toContain('.rpc("v3_calculate_combined"');
  for(const verb of ['.insert(', '.update(', '.delete(', '.upsert(']) expect(family).not.toContain(verb);
  expect(sql).toContain('from televoting.vote_entries');
  expect(sql).toContain('from televoting.external_score_entries');
  expect(sql).not.toContain('p_result');
 });
 it('authorizes live session before replay, replays before CAS, freezes final state', () => {
  expect(sql.indexOf('v3_require_active_auth_session')).toBeLessThan(sql.indexOf('studio2_claim_operation'));
  expect(sql.indexOf('studio2_user_has_capability')).toBeLessThan(sql.indexOf('studio2_claim_operation'));
  expect(sql.indexOf("v_claim->>'replayed'")).toBeLessThan(sql.indexOf('a.command_version<>p_expected_version'));
  expect(sql).toContain("a.status not in ('draft','calculated')");
  expect(sql).toContain('from public,anon,service_role');
 });
 it('owns both results, pool metadata, version, audit, event and receipt in one transaction', () => {
  for(const table of ['combined_televote_component_results','combined_televote_results','televote_aggregation_sources','televote_aggregations','admin_audit_log','integration_events']) expect(sql).toContain(`televoting.${table}` === 'televoting.integration_events' ? 'public.integration_events' : `televoting.${table}`);
  expect(sql).toContain('v_version:=a.calculation_version+1');
  expect(sql).toContain('studio2_complete_operation');
  expect(sql).not.toContain('exception when');
 });
});
