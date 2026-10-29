import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {recoverCombinedDeletion} from '../integrations/televoting/combined-deletion';
describe('Combined deletion recovery',()=>{
 it('recovers only an exact committed actor-scoped resource receipt',async()=>{
  expect(await recoverCombinedDeletion('A',async()=>({data:{command:'televote.combined.delete',status:'succeeded',result:{ok:true,aggregationId:'A'}},error:null}))).toBe(true);
 });
 it('allows a new attempt only for an explicitly missing receipt',async()=>{
  expect(await recoverCombinedDeletion('A',async()=>({data:null,error:{code:'P0002',message:'UNKNOWN'}}))).toBe(false);
  await expect(recoverCombinedDeletion('A',async()=>({data:null,error:{code:'42501',message:'SESSION_REVOKED'}}))).rejects.toThrow('SESSION_REVOKED');
  await expect(recoverCombinedDeletion('A',async()=>({data:null,error:{code:'TIMEOUT',message:'network timeout'}}))).rejects.toThrow('network timeout');
 });
 it.each(['pending','failed','uncertain'])('does not turn %s into successful deletion or a fresh write',async status=>{
  await expect(recoverCombinedDeletion('A',async()=>({data:{command:'televote.combined.delete',status,result:{ok:true,aggregationId:'A'}},error:null}))).rejects.toThrow('needs operation reconciliation');
 });
 it.each([null,{}, {command:'different.command',status:'succeeded',result:{ok:true,aggregationId:'A'}},{command:'televote.combined.delete',status:'succeeded',result:{ok:true,aggregationId:'B'}}])('rejects ambiguous or foreign receipts',async data=>{
  await expect(recoverCombinedDeletion('A',async()=>({data,error:null}))).rejects.toThrow('needs operation reconciliation');
 });
 it('calls governed deletion and recovery before attempting a missing-row read',()=>{
  const source=readFileSync('src/integrations/televoting/combined.server.ts','utf8').split('export async function deleteMergedCombinedAggregationServer')[1];
  expect(source).toContain('.rpc("v3_delete_combined_aggregation"');
  expect(source).toContain('p_expected_version: aggregation.command_version');
  expect(source).toContain('p_remote_edition_id: aggregation.edition_id');
  expect(source.indexOf('recoverCombinedDeletion(')).toBeLessThan(source.indexOf('await loadAggregation(id)'));
  expect(source).not.toMatch(/\.from\([\s\S]{0,200}?\.(delete|update|insert|upsert)\(/);
 });
});
