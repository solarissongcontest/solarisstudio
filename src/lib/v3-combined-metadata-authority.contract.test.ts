import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const source=readFileSync('src/integrations/televoting/combined.server.ts','utf8');
const metadata=source.split('export async function updateMergedCombinedAggregationServer')[1].split('export async function setMergedCombinedParticipantsServer')[0];
const ui=readFileSync('src/routes/televoting/admin/combined.tsx','utf8');
const sql=readFileSync('supabase/migrations/20261029052235_v3_combined_metadata_authority.sql','utf8');
describe('Combined settings authority',()=>{
 it('uses reviewed version and explicit stable operation from the form',()=>{
  expect(metadata).toContain('.rpc("v3_update_combined_metadata"');
  for(const pair of ['p_expected_version: data.expectedVersion','p_name: data.name','p_total_points: data.totalPoints','p_rank_exponent: data.rankExponent','p_operation_id: data.operationId'])expect(metadata).toContain(pair);
  expect(metadata).not.toContain('.update(');
  expect(ui).toContain('expectedVersion: settingsVersion');
  expect(ui).toContain('await updateFn({ data: pendingSettings.current.data })');
  expect(ui.indexOf('await onRefresh();\n      pendingSettings.current = null')).toBeGreaterThan(0);
 });
 it('denies stale and frozen changes and recovers receipts before CAS',()=>{
  for(const invariant of ['private.v3_require_active_auth_session','private.studio2_user_has_capability','for update','Combined settings changed after review','Locked or published Combined settings are immutable','combined.settings_changed','results_outdated=true','private.studio2_complete_operation'])expect(sql).toContain(invariant);
  expect(sql.indexOf("v_claim->>'replayed'")).toBeLessThan(sql.indexOf('Combined settings changed after review'));
 });
});
