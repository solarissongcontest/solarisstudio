import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const read=(p:string)=>readFileSync(p,'utf8');
describe('Canonical Combined creation',()=>{
 it('routes the creation intent through one receipted command without raw aggregate INSERT',()=>{
  const source=read('src/integrations/televoting/combined.server.ts').split('export async function createMergedCombinedAggregationServer')[1].split('export async function updateMergedCombinedAggregationServer')[0];
  expect(source).toContain('.rpc("v3_create_combined_aggregation"');
  expect(source).toContain('p_operation_id: data.operationId');
  expect(source).toContain('p_remote_edition_id: data.editionId ?? null');
  expect(source).not.toContain('.insert(');
  const ui=read('src/routes/televoting/admin/combined.tsx');
  expect(ui).toContain('createFn({ data: pendingCreate.current.data })');
  expect(ui).toContain('Recover the previous creation request before changing its inputs');
 });
 it('revokes all external insert columns and retains canonical retry and actor enforcement',()=>{
  const sql=read('supabase/migrations/20261029052600_v3_combined_creation_authority.sql');
  for(const invariant of ['private.v3_require_active_auth_session','private.studio2_user_has_capability','private.studio2_claim_operation','private.studio2_complete_operation','combined.created','revoke insert on televoting.televote_aggregations','revoke insert(%I)'])expect(sql).toContain(invariant);
 });
});
