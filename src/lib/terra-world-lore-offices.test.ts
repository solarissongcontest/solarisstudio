import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach,describe,expect,it,vi } from "vitest";

const rpc=vi.hoisted(()=>vi.fn());
vi.mock("@/integrations/supabase/client",()=>({supabase:{rpc}}));
import {
  parseWorldDomesticOfficials,readWorldDomesticOfficials,writeWorldDomesticOfficial,
} from "./terra-world-lore-offices";
const SQL=readFileSync(resolve(process.cwd(),
  "supabase/migrations/20261107004200_v3_tg16_lore_offices.sql"),"utf8");
const countryId="11111111-1111-4111-8111-111111111111";
const personId="22222222-2222-4222-8222-222222222222";
const officeId="33333333-3333-4333-8333-333333333333";
const termId="44444444-4444-4444-8444-444444444444";
const operationId="55555555-5555-4555-8555-555555555555";
const officials={
  countryId,countryCode:"OL",isController:false,
  people:[{id:personId,displayName:"Fictional President",nativeName:"President of Oland",
    biography:null,publicSummary:"A fictional officeholder.",status:"historical",
    bornOn:"1980-05-03",diedOn:null,
    published:true,revision:1,authUserId:"PRIVATE"}],
  offices:[{id:officeId,title:"President",officeType:"head_of_state",
    description:null,published:true,revision:1}],
  terms:[{id:termId,officeId,holderPersonId:personId,
    officeTitle:"President",holderDisplayName:"Fictional President",
    startedAt:"2020-01-01T12:00:00Z",endedAt:"2024-01-01T12:00:00Z",
    status:"ended",published:true,revision:2,secretReason:"PRIVATE"}],
  privateUserId:"PRIVATE",
};
beforeEach(()=>rpc.mockReset());
describe("TG16 fictional people, offices and historical terms",()=>{
  it("never creates an alternate real-human or country control authority",()=>{
    expect(SQL).toContain("public.country_accounts");
    expect(SQL).toContain("create table public.world_lore_people");
    expect(SQL).toContain("name text not null");
    expect(SQL).toContain("native_name text");
    expect(SQL).toContain("public_summary text");
    expect(SQL).toContain("world_lore_people_dates");
    expect(SQL).toContain("v_died_on<v_born_on");
    expect(SQL).toContain("create table public.world_domestic_offices");
    expect(SQL).toContain("create table public.world_domestic_office_terms");
    expect(SQL).not.toContain("create table public.delegation_people");
    expect(SQL).not.toContain("update public.country_accounts");
    expect(SQL).not.toContain("insert into public.world_ballots");
    expect(SQL).toContain("holder_display_name text not null");
    expect(SQL).toContain("office_title text not null");
  });
  it("keeps office-history intervals non-overlapping and ends terms without deletion",()=>{
    expect(SQL).toContain("world_domestic_office_one_open_uidx");
    expect(SQL).toContain("OVERLAPPING_OFFICE_TERM");
    expect(SQL).toContain("tstzrange(t.started_at,t.actual_end_at,'[)')");
    expect(SQL).toContain("actual_end_at=now()");
    expect(SQL).toContain("status in ('active','ended','resigned','removed')");
    expect(SQL).toContain("world_domestic_official_revisions");
    expect(SQL).not.toMatch(/delete from public\.world_domestic_office_terms/i);
  });
  it("authorizes against fresh current country controller with a governed receipt and version CAS",()=>{
    expect(SQL).toContain("ca.user_id=v_actor and ca.status='active'");
    expect(SQL).toContain("private.studio2_claim_operation");
    expect(SQL).toContain("private.studio2_complete_operation");
    expect(SQL).toContain("private.v3_emit_domain_event");
    expect(SQL).toContain("revision=p_expected_revision");
    expect(SQL).toContain("pg_column_size(p_payload)>16384");
    expect(SQL).toContain("grant select on public.world_lore_people");
    expect(SQL).not.toContain("grant all on public.world_lore_people");
  });
  it("strips private fields, refuses malformed, wrong-country and excessive projections",()=>{
    const parsed=parseWorldDomesticOfficials(officials,"OL")!;
    expect(parsed.terms[0].officeTitle).toBe("President");
    expect(parsed.terms[0].holderDisplayName).toBe("Fictional President");
    expect(parsed).not.toHaveProperty("privateUserId");
    expect(parsed.people[0]).not.toHaveProperty("authUserId");
    expect(parsed.people[0].nativeName).toBe("President of Oland");
    expect(parsed.people[0].status).toBe("historical");
    expect(parsed.people[0].bornOn).toBe("1980-05-03");
    expect(parsed.terms[0]).not.toHaveProperty("secretReason");
    expect(()=>parseWorldDomesticOfficials(officials,"UN")).toThrow();
    expect(()=>parseWorldDomesticOfficials({...officials,terms:Array(501).fill(officials.terms[0])},"OL")).toThrow();
    expect(parseWorldDomesticOfficials(null,"OL")).toBeNull();
  });
  it("aborts without opening Supabase and rejects invalid country parameters",async()=>{
    const abort=new AbortController();abort.abort();
    await expect(readWorldDomesticOfficials("OL",abort.signal)).rejects.toThrow("cancelled");
    await expect(readWorldDomesticOfficials("../private")).rejects.toThrow("Invalid");
    expect(rpc).not.toHaveBeenCalled();
    const forwarding=vi.fn().mockResolvedValue({data:officials,error:null});
    rpc.mockReturnValueOnce({abortSignal:forwarding});
    await expect(readWorldDomesticOfficials("OL",new AbortController().signal))
      .resolves.toMatchObject({terms:[{status:"ended"}]});
    expect(forwarding).toHaveBeenCalledTimes(1);
  });
  it("requires a real operation receipt and surfaces conflicts",async()=>{
    rpc.mockResolvedValueOnce({data:{ok:true,id:personId,kind:"lore_person",
      revision:1,operationId},error:null});
    await expect(writeWorldDomesticOfficial({countryId,kind:"lore_person",subjectId:null,
      payload:{name:"Fictional President",published:true},expectedRevision:0,
      operationId,idempotencyKey:operationId})).resolves.toMatchObject({id:personId});
    expect(rpc).toHaveBeenCalledWith("world_write_domestic_official_v1",expect.objectContaining({
      p_country_id:countryId,p_kind:"lore_person",p_expected_revision:0,
    }));
    rpc.mockResolvedValueOnce({data:null,error:{code:"40001",message:"VERSION_CONFLICT"}});
    await expect(writeWorldDomesticOfficial({countryId,kind:"office",subjectId:officeId,
      payload:{title:"Renamed"},expectedRevision:1,operationId,idempotencyKey:operationId}))
      .rejects.toThrow("changed elsewhere");
    expect(()=>parseWorldDomesticOfficials({...officials,people:[{...officials.people[0],
      revision:0}]},"OL")).toThrow();
  });
  it("keeps the complete TG17 function syntactically delimited and uses true page lookahead",()=>{
    const from=SQL.indexOf("create or replace function public.world_history_timeline_v1(");
    const until=SQL.indexOf("do $contract$",from);
    expect(from).toBeGreaterThan(0);
    expect(until).toBeGreaterThan(from);
    const functionBody=SQL.slice(from,until);
    expect(functionBody).toContain("p_country_code !~ '^[[:alnum:]-]+
    expect(SQL).toContain("create or replace function public.world_history_timeline_v1");
    expect(SQL).toContain("from public.world_domestic_office_terms t");
    expect(SQL).toContain("'domestic_office','world_domestic_office_terms'");
    expect(SQL).toContain("t.visibility='public'");
    expect(SQL).toContain("t.actual_end_at is not null");
    expect(SQL).toContain("t.holder_display_name || ' appointed ' || t.office_title");
    expect(SQL).not.toContain("insert into public.world_history_events");
  });
});
");
    expect(functionBody).toContain("limit 21 offset p_page*20");
    expect(functionBody).toContain("count(*) > 20");
    expect(functionBody).toContain("filter (where n.rn <= 20)");
    expect(functionBody.split("$history$").length - 1).toBe(2);
    expect(functionBody).not.toContain("do $contract$");
    expect(functionBody).not.toContain("notify pgrst");
    expect(SQL.split("do $contract$").length - 1).toBe(1);
  });
  it("derives published office appointments and conclusions into TG17 without editorial duplicates",()=>{
    expect(SQL).toContain("create or replace function public.world_history_timeline_v1");
    expect(SQL).toContain("from public.world_domestic_office_terms t");
    expect(SQL).toContain("'domestic_office','world_domestic_office_terms'");
    expect(SQL).toContain("t.visibility='public'");
    expect(SQL).toContain("t.actual_end_at is not null");
    expect(SQL).toContain("t.holder_display_name || ' appointed ' || t.office_title");
    expect(SQL).not.toContain("insert into public.world_history_events");
  });
});
