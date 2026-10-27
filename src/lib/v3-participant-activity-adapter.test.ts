import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { participantActivityQueryKey } from './v3-participant-activity-runtime';
import { describe, expect, it, vi } from 'vitest';
import { loadV3ParticipantActivity } from '@/integrations/v3/participant-activity.server';

describe('actual canonical participant activity adapter', () => {
  it('forwards the complete stable keyset cursor without accepting caller identity or domain scope', async () => {
    const rpc=vi.fn().mockResolvedValue({data:{items:[{
      id:'operation-1',occurred_at:'2026-10-01T00:00:00Z',kind:'submission',
      title:'Entry updated',source_event_type:'entry.version_changed',
      reconciliation_state:'superseded',route:'/participate',privatePayload:'SECRET',
    }],next_before:'2026-10-01T00:00:00Z',next_operation_id:'operation-1',generated_at:'2026-10-01T00:00:01Z'},error:null});
    const result=await loadV3ParticipantActivity({before:'2026-10-02T00:00:00Z',beforeOperationId:'previous',limit:7},{rpc});
    expect(rpc).toHaveBeenCalledWith('v3_my_participant_activity',{
      p_before:'2026-10-02T00:00:00Z',p_before_operation_id:'previous',p_limit:7,
    });
    expect(result).toMatchObject({schemaReady:true,nextOperationId:'operation-1',nextBefore:'2026-10-01T00:00:00Z'});
    expect(result.items[0]).toMatchObject({reconciliationState:'superseded',route:'/participate'});
    expect(JSON.stringify(result)).not.toContain('SECRET');
  });
  it('switches the real private observer namespace before another account can receive history', async () => {
    const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity}}});
    let finish!: (value:string)=>void;
    try {
      const oldRead=client.fetchQuery({queryKey:participantActivityQueryKey('A'),queryFn:()=>new Promise<string>(resolve=>{finish=resolve;})});
      const observer=new QueryObserver(client,{queryKey:participantActivityQueryKey('A'),enabled:false,queryFn:async()=>'A'});
      const unsubscribe=observer.subscribe(()=>{});
      observer.setOptions({queryKey:participantActivityQueryKey('B'),enabled:false,queryFn:async()=>'B'});
      expect(observer.getCurrentResult().data).toBeUndefined();
      client.setQueryData(participantActivityQueryKey('B'),'verified B history');
      finish('old A history');
      await oldRead;
      expect(observer.getCurrentResult().data).toBe('verified B history');
      expect(client.getQueryData(participantActivityQueryKey('B'))).toBe('verified B history');
      unsubscribe();
    } finally { client.clear(); }
  });
  it.each(['42883','PGRST202'])('keeps missing-schema compatibility fail-closed for the real missing code %s',async (code)=>{
    const rpc=vi.fn().mockResolvedValue({data:null,error:{code,message:'RPC unavailable'}});
    const result=await loadV3ParticipantActivity({}, {rpc});
    expect(result).toMatchObject({schemaReady:false,items:[],nextOperationId:null});
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it.each(['42501','P0001','40001'])('never mistakes owner/auth failures for a missing contract (%s)',async(code)=>{
    const rpc=vi.fn().mockResolvedValue({data:null,error:{code,message:'Error in v3_my_participant_activity: canonical failure'}});
    await expect(loadV3ParticipantActivity({}, {rpc})).rejects.toThrow('Participant activity unavailable');
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
