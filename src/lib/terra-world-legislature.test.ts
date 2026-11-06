import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(()=>vi.fn());
vi.mock("@/integrations/supabase/client",()=>({supabase:{rpc}}));

import { parseWorldLegislature,readWorldLegislature,writeWorldLegislature } from "./terra-world-legislature";

const SQL=readFileSync(resolve(process.cwd(),
  "supabase/migrations/20261107004100_v3_tg16_legislature_chambers.sql"),"utf8");
const countryId="11111111-1111-4111-8111-111111111111";
const legislatureId="22222222-2222-4222-8222-222222222222";
const chamberId="33333333-3333-4333-8333-333333333333";
const operationId="44444444-4444-4444-8444-444444444444";
const item={
  countryId,countryCode:"OL",isController:false,
  legislature:{id:legislatureId,name:"National Assembly",description:"A fictional assembly",
    electionCycleMonths:48,published:true,revision:1,createdByUserId:"private"},
  chambers:[{id:chamberId,title:"Lower House",seatCount:120,electionCycleMonths:48,
    presidingTitle:"Speaker",description:null,published:true,revision:1,
    secretDelegates:"private"}],
  authUserId:"private",
};
beforeEach(()=>rpc.mockReset());

describe("TG16 legislature and chamber contracts",()=>{
  it("reuses the canonical current country controller and does not create real ballot authorities",()=>{
    expect(SQL).toContain("public.country_accounts");
    expect(SQL).not.toMatch(/create table(?: if not exists)? public\.country_accounts/);
    expect(SQL).not.toContain("insert into public.world_ballots");
    expect(SQL).not.toContain("public.country_profile_sections");
    expect(SQL).toContain("foreign key (legislature_id,country_id)");
  });
  it("enforces the parent World publication decision inside command and reader",()=>{
    expect(SQL.split("studio2_feature_enabled('terra_world_public'").length - 1).toBe(2);
    expect(SQL).toContain("WORLD_NOT_PUBLISHED");
  });
  it("uses one owner for mutations, guarded revision and idempotent canonical receipts",()=>{
    expect(SQL).toContain("private.studio2_claim_operation");
    expect(SQL).toContain("private.studio2_complete_operation");
    expect(SQL).toContain("private.v3_emit_domain_event");
    expect(SQL).toContain("revision=p_expected_revision");
    expect(SQL).toContain("ca.user_id=v_actor and ca.status='active'");
    expect(SQL).toContain("PUBLIC_CHAMBERS_DEPEND_ON_LEGISLATURE");
    expect(SQL).toContain("LEGISLATURE_NOT_PUBLISHED");
    expect(SQL).toContain("CHAMBER_LIMIT");
    for(const table of ["world_domestic_legislatures","world_domestic_chambers","world_domestic_structure_revisions"]) {
      expect(SQL).toContain("public."+table);
    }
    expect(SQL).toContain("from public,anon,authenticated");
    expect(SQL).toContain("create table public.world_domestic_structure_revisions");
  });
  it("parses only the published reader contract and strips private fields",()=>{
    const projection=parseWorldLegislature(item,"OL")!;
    expect(projection.legislature?.name).toBe("National Assembly");
    expect(projection.chambers[0].seatCount).toBe(120);
    expect(projection.chambers[0]).not.toHaveProperty("secretDelegates");
    expect(projection.legislature).not.toHaveProperty("createdByUserId");
    expect(projection).not.toHaveProperty("authUserId");
    expect(()=>parseWorldLegislature({...item,countryCode:"WRONG"},"OL")).toThrow();
    expect(()=>parseWorldLegislature({...item,chambers:Array(11).fill(item.chambers[0])},"OL")).toThrow();
  });
  it("rejects orphan chambers and malformed seat data",()=>{
    expect(()=>parseWorldLegislature({...item,legislature:null},"OL")).toThrow("Orphan");
    expect(()=>parseWorldLegislature({...item,
      chambers:[{...item.chambers[0],seatCount:"120"}]},"OL")).toThrow();
    expect(parseWorldLegislature(null,"OL")).toBeNull();
  });
  it("does no RPC when inputs are invalid or an abort signal is already fired",async()=>{
    const controller=new AbortController();controller.abort();
    await expect(readWorldLegislature("OL",controller.signal)).rejects.toThrow("cancelled");
    await expect(readWorldLegislature("OL?private")).rejects.toThrow("Invalid");
    expect(rpc).not.toHaveBeenCalled();
    const aborted=vi.fn().mockResolvedValue({data:item,error:null});
    rpc.mockReturnValueOnce({abortSignal:aborted});
    await expect(readWorldLegislature("OL",new AbortController().signal))
      .resolves.toMatchObject({chambers:[{title:"Lower House"}]});
    expect(aborted).toHaveBeenCalledTimes(1);
  });
  it("requires a server-confirmed receipt for write success",async()=>{
    rpc.mockResolvedValueOnce({data:{operationId,status:"succeeded",error:null,
      result:{ok:true,id:legislatureId,kind:"legislature",operationId,revision:1}},error:null});
    await expect(writeWorldLegislature({
      countryId,kind:"legislature",subjectId:null,
      payload:{title:"National Assembly",description:"",electionCycleMonths:48,published:true},
      expectedRevision:0,operationId,idempotencyKey:operationId,
    })).resolves.toMatchObject({operationId,id:legislatureId});
    expect(rpc).toHaveBeenCalledWith("world_write_domestic_structure_v1",expect.objectContaining({
      p_country_id:countryId,p_kind:"legislature",p_expected_revision:0,
    }));
    rpc.mockResolvedValueOnce({data:{operationId,status:"processing",error:null,
      result:{ok:true,id:legislatureId,kind:"legislature",operationId,revision:1}},error:null});
    await expect(writeWorldLegislature({countryId,kind:"legislature",subjectId:legislatureId,
      payload:{title:"Attempted",published:true},expectedRevision:1,operationId,
      idempotencyKey:operationId})).rejects.toThrow("receipt");
    rpc.mockResolvedValueOnce({data:null,error:{code:"40001",message:"VERSION_CONFLICT"}});
    await expect(writeWorldLegislature({
      countryId,kind:"legislature",subjectId:legislatureId,
      payload:{title:"Changed",description:"",electionCycleMonths:null,published:true},
      expectedRevision:1,operationId,idempotencyKey:operationId,
    })).rejects.toThrow("updated elsewhere");
  });
});
