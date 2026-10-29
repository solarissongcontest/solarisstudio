import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runConfirmationResponseDelete, type ConfirmationDeleteRequest } from './v3-confirmation-response-delete';
const revision='a'.repeat(64);
function setup() {
 const values=new Map<string,string>();
 const storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);},removeItem:(k:string)=>{values.delete(k);}};
 const input={userId:'actor-a',submissionId:'response-a',expectedRevision:revision,storage};
 return {values,input};
}
const success={data:{deleted:true,submissionId:'response-a'},error:null};
describe('governed Confirmation response delete caller',()=>{
 it('recovers after commit and lost response without needing a live response or revision',async()=>{
  const {input,values}=setup();const sent:ConfirmationDeleteRequest[]=[];
  const submit=vi.fn(async(request:ConfirmationDeleteRequest)=>{sent.push({...request});if(sent.length===1)throw new Error('response lost after commit');return success;});
  await expect(runConfirmationResponseDelete({...input,submit})).rejects.toThrow('response lost');
  expect(values.size).toBe(1);
  await expect(runConfirmationResponseDelete({...input,expectedRevision:undefined,onlyPending:true,submit})).resolves.toEqual(success.data);
  expect(sent[1]).toEqual(sent[0]);expect(sent[0].p_expected_revision).toBe(revision);expect(sent[0].p_operation_id).toBe(sent[0].p_idempotency_key);expect(values.size).toBe(0);
 });
 it('retains the original semantic payload when displayed data changes after an uncertain attempt',async()=>{
  const {input}=setup();const submit=vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(success);
  await expect(runConfirmationResponseDelete({...input,submit})).rejects.toThrow();
  await runConfirmationResponseDelete({...input,expectedRevision:'b'.repeat(64),submit});
  expect(submit.mock.calls[1][0]).toEqual(submit.mock.calls[0][0]);
 });
 it('does not inherit another account pending operation',async()=>{
  const {input,values}=setup();const submit=vi.fn().mockRejectedValue(new Error('offline'));
  await expect(runConfirmationResponseDelete({...input,submit})).rejects.toThrow();
  const other=vi.fn();expect(await runConfirmationResponseDelete({...input,userId:'actor-b',onlyPending:true,submit:other})).toBeNull();expect(other).not.toHaveBeenCalled();expect(values.size).toBe(1);
 });
 it('allows a new reviewed identity only after explicit canonical CAS rejection',async()=>{
  const {input,values}=setup();const submit=vi.fn().mockResolvedValueOnce({data:null,error:{code:'PT409',message:'VERSION_CONFLICT'}}).mockResolvedValueOnce(success);
  await expect(runConfirmationResponseDelete({...input,submit})).rejects.toThrow('VERSION_CONFLICT');expect(values.size).toBe(0);
  await runConfirmationResponseDelete({...input,expectedRevision:'b'.repeat(64),submit});
  expect(submit.mock.calls[1][0].p_operation_id).not.toBe(submit.mock.calls[0][0].p_operation_id);
 });
 for(const code of ['42501','P0001']) it(`keeps identity on authorization or receipt error ${code}`,async()=>{
  const {input,values}=setup();const submit=vi.fn().mockResolvedValue({data:null,error:{code,message:'denied or uncertain'}});
  await expect(runConfirmationResponseDelete({...input,submit})).rejects.toThrow();expect(values.size).toBe(1);
 });
 it('never treats an empty response as confirmation of deletion',async()=>{
  const {input,values}=setup();await expect(runConfirmationResponseDelete({...input,submit:async()=>({data:null,error:null})})).rejects.toThrow('unconfirmed');expect(values.size).toBe(1);
 });
 it('cuts over the sole route and recovers pending deletion before fetching a missing row',()=>{
  const route=readFileSync('src/routes/confirmations/admin/responses/$id.tsx','utf8');
  expect(route).toContain('expectedRevision: data.delete_revision');expect(route).toContain('storage: window.sessionStorage');
  expect(route.indexOf('onlyPending: true')).toBeLessThan(route.indexOf('"admin_confirmation_response"'));
  expect(route.match(/admin_confirmation_delete_response/g)).toHaveLength(1);
  expect(route).toContain('confirmationsSupabase.rpc("admin_confirmation_delete_response", request)');
 });
});
