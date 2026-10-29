import {describe,expect,it,vi} from 'vitest';
import {runRetainedConfirmationRestore} from './v3-confirmation-restore-retry';
const request={_submission_id:'response-a',_version_id:'historical-a',_reason:'Reviewed restore',p_expected_revision:'a'.repeat(64)};
function setup(){const values=new Map<string,string>();return{values,storage:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);},removeItem:(k:string)=>{values.delete(k);}}};}
describe('Confirmation restoration uncertain-outcome recovery',()=>{
 it('recovers on reload without the old live revision or history baseline',async()=>{
  const {storage,values}=setup();const submit=vi.fn().mockImplementationOnce(async()=>{throw new Error('response lost');}).mockImplementation(async r=>({data:{ok:true,operationId:r.p_operation_id,captured_version:2},error:null}));
  const base={actorId:'actor-a',submissionId:'response-a',storage,submit};
  await expect(runRetainedConfirmationRestore({...base,request})).rejects.toThrow('response lost');expect(values.size).toBe(1);
  await runRetainedConfirmationRestore({...base,onlyPending:true});
  expect(submit.mock.calls[1][0]).toEqual(submit.mock.calls[0][0]);expect(values.size).toBe(0);
 });
 it('does not apply a changed target or reason while an earlier restore is pending',async()=>{
  const {storage}=setup();const submit=vi.fn().mockRejectedValue(new Error('offline'));const base={actorId:'actor-a',submissionId:'response-a',storage,submit};
  await expect(runRetainedConfirmationRestore({...base,request})).rejects.toThrow();
  for(const changed of [{...request,_version_id:'historical-b'},{...request,_reason:'Changed reason'}])await expect(runRetainedConfirmationRestore({...base,request:changed})).rejects.toThrow('Recover the previous restore');
  expect(submit).toHaveBeenCalledTimes(1);
 });
 it('isolates retained restoration by actor',async()=>{const {storage}=setup();const submit=vi.fn().mockRejectedValue(new Error('offline'));await expect(runRetainedConfirmationRestore({actorId:'actor-a',submissionId:'response-a',storage,submit,request})).rejects.toThrow();expect(await runRetainedConfirmationRestore({actorId:'actor-b',submissionId:'response-a',storage,submit,onlyPending:true})).toBeNull();expect(submit).toHaveBeenCalledTimes(1);});
 it('retains denied/uncertain requests and clears only an explicit rejected CAS',async()=>{const {storage,values}=setup();const base={actorId:'actor-a',submissionId:'response-a',storage,request};for(const code of ['42501','P0001']){await expect(runRetainedConfirmationRestore({...base,submit:async()=>({data:null,error:{code,message:'denied'}})})).rejects.toThrow();expect(values.size).toBe(1);}await expect(runRetainedConfirmationRestore({...base,submit:async()=>({data:null,error:{code:'PT409',message:'VERSION_CONFLICT'}})})).rejects.toThrow();expect(values.size).toBe(0);});
 it('does not clear identity for an unconfirmed success response',async()=>{const {storage,values}=setup();await expect(runRetainedConfirmationRestore({actorId:'actor-a',submissionId:'response-a',storage,request,submit:async()=>({data:null,error:null})})).rejects.toThrow('unconfirmed');expect(values.size).toBe(1);});
});
