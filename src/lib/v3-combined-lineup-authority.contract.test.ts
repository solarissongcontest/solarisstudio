import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const source=readFileSync('src/integrations/televoting/combined-sync.server.ts','utf8');
const sql=readFileSync('supabase/migrations/20261029043157_v3_combined_lineup_reconciliation_authority.sql','utf8');
describe('Combined canonical lineup reconciliation',()=>{
 it('uses one governed RPC rather than separate delete/insert/outdated writes',()=>{
  expect(source).toContain('.rpc("v3_reconcile_combined_lineup"');
  expect(source).not.toMatch(/\.from\([\s\S]{0,200}?\.(insert|update|delete|upsert)\(/);
  for(const key of ['p_aggregation_id','p_expected_updated_at','p_expected_participants','p_operation_id','p_idempotency_key'])expect(source).toContain(key);
 });
 it('binds retries to reviewed state rather than generating a new operation on retry',()=>{
  expect(source).toContain('createHash("sha256")');
  expect(source).toContain('aggregationId, aggregation.updated_at, currentCodes');
  expect(sql.indexOf("v_claim->>'replayed'")).toBeLessThan(sql.indexOf('Combined lineup changed after review'));
 });
 it('enforces canonical show authority and atomic mutation, event and receipt',()=>{
  for(const invariant of ['private.v3_require_active_auth_session()','private.studio2_user_has_capability','voting.manage','for update','Ambiguous Combined source scope','Combined lineup is immutable','Missing canonical country code','Duplicate canonical country code','public.integration_events','private.studio2_complete_operation'])expect(sql).toContain(invariant);
  expect(sql).toContain('from public,anon,service_role');
  expect(sql).not.toMatch(/(?:insert into|update) public\.(?:results|televoting_round_bindings)/);
 });
});
