import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const source=readFileSync('src/integrations/televoting/combined.server.ts','utf8');
const status=source.slice(source.indexOf('export async function setMergedCombinedStatusServer'),source.indexOf('export async function deleteMergedCombinedAggregationServer'));
const sql=readFileSync('supabase/migrations/20261029043510_v3_combined_status_authority.sql','utf8');
describe('Combined status canonical command',()=>{
 it('migrates status branch, retaining publication validation and exact request identity',()=>{
  expect(status).toContain('aggregation.results_outdated || !aggregation.calculation_version');
  expect(status).toContain('.rpc("v3_transition_combined_status"');
  expect(status).toContain('actor.id, data.id, aggregation.command_version, data.status');
  expect(status).not.toMatch(/\.from\([\s\S]{0,200}?\.update\(/);
 });
 it('protects retry before CAS and audit in one transaction with live scoped actor authority',()=>{
  for(const invariant of ['private.v3_require_active_auth_session','private.studio2_user_has_capability','for update','Combined state changed after review','combined.status_changed','private.studio2_complete_operation','from public,anon,service_role'])expect(sql).toContain(invariant);
  expect(sql.indexOf("v_claim->>'replayed'")).toBeLessThan(sql.indexOf('Combined state changed after review'));
 });
});
