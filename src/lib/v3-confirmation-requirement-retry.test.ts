import {describe,expect,it,vi} from 'vitest';
import {runRetainedRequirementChange,type RequirementChange} from './v3-confirmation-requirement-retry';
const change:RequirementChange={kind:'waive',editionId:'edition-a',requirementId:'requirement-a',reason:'Reviewed waiver',expectedRevision:'a'.repeat(64),operationId:'operation-a',idempotencyKey:'operation-a'};
function setup(){const values=new Map<string,string>();return {values,storage:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);},removeItem:(k:string)=>{values.delete(k);}}};}
describe('Confirmation requirement retry recovery',()=>{
 it('reuses the reviewed operation after a lost response even when the UI supplies a new identity',async()=>{
  const {storage,values}=setup();const submit=vi.fn().mockRejectedValueOnce(new Error('response lost')).mockResolvedValue({data:{ok:true,operationId:'operation-a',status:'waived'},error:null});
  await expect(runRetainedRequirementChange('actor-a',change,storage,submit)).rejects.toThrow('response lost');expect(values.size).toBe(1);
  await runRetainedRequirementChange('actor-a',{...change,operationId:'operation-b',idempotencyKey:'operation-b'},storage,submit);
  expect(submit.mock.calls[1][0]).toEqual(change);expect(values.size).toBe(0);
 });
 it('does not silently reinterpret a changed reason as retry of the previous operation',async()=>{
  const {storage}=setup();const submit=vi.fn().mockRejectedValue(new Error('offline'));
  await expect(runRetainedRequirementChange('actor-a',change,storage,submit)).rejects.toThrow();
  await expect(runRetainedRequirementChange('actor-a',{...change,reason:'Changed reason'},storage,submit)).rejects.toThrow('needs recovery');expect(submit).toHaveBeenCalledTimes(1);
 });
 it('isolates pending identity by actor',async()=>{
  const {storage,values}=setup();const submit=vi.fn().mockRejectedValue(new Error('offline'));
  await expect(runRetainedRequirementChange('actor-a',change,storage,submit)).rejects.toThrow();
  await expect(runRetainedRequirementChange('actor-b',{...change,operationId:'operation-b'},storage,submit)).rejects.toThrow();expect(values.size).toBe(2);
 });
 it('keeps uncertain and denied operations while clearing a proved stale CAS',async()=>{
  const {storage,values}=setup();for(const code of ['42501','P0001']) {await expect(runRetainedRequirementChange('actor-a',change,storage,async()=>({data:null,error:{code,message:'denied or uncertain'}}))).rejects.toThrow();expect(values.size).toBe(1);}
  await expect(runRetainedRequirementChange('actor-a',change,storage,async()=>({data:null,error:{code:'PT409',message:'VERSION_CONFLICT'}}))).rejects.toThrow();expect(values.size).toBe(0);
 });
 it('does not treat empty success as a committed operation receipt',async()=>{
  const {storage,values}=setup();await expect(runRetainedRequirementChange('actor-a',change,storage,async()=>({data:null,error:null}))).rejects.toThrow('unconfirmed');expect(values.size).toBe(1);
 });
});
