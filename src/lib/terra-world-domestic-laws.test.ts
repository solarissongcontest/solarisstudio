import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc=vi.hoisted(()=>vi.fn());
vi.mock("@/integrations/supabase/client",()=>({supabase:{rpc}}));
import {
  DOMESTIC_TRANSITIONS,parseDomesticLaws,parseDomesticMeasureDetail,
  readDomesticLaws,readDomesticMeasureDetail,writeDomesticMeasure,
} from "./terra-world-domestic-laws";

const SQL=readFileSync(resolve(process.cwd(),
  "supabase/migrations/20261107004300_v3_tg16_domestic_legislation.sql"),"utf8");
const countryId="11111111-1111-4111-8111-111111111111";
const measureId="22222222-2222-4222-8222-222222222222";
const lawId="33333333-3333-4333-8333-333333333333";
const operationId="44444444-4444-4444-8444-444444444444";
const overview={
  countryId,countryCode:"OL",isController:false,
  measures:[{id:measureId,title:"Fictional Civil Act",processKind:"monarchical",
    status:"enacted",published:true,revision:5,currentVersion:2,secretVoter:"PRIVATE"}],
  laws:[{id:lawId,measureId,title:"Fictional Civil Act",status:"in_force",
    enactmentMethod:"monarchical",enactedAt:"2025-01-01T00:00:00Z",
    repealedAt:null,secretAuthorId:"PRIVATE"}],
  authUserId:"PRIVATE",
};
const detail={...overview.measures[0],countryId,body:"Section I. Published fictional law.",
  versionHistory:[{number:2,createdAt:"2024-01-01T00:00:00Z",title:"Fictional Civil Act"}]};
beforeEach(()=>rpc.mockReset());

describe("WORLD-09 TG16 country-controlled domestic laws",()=>{
  it("connects the public route and Government navigation under canonical publication/shell protections",()=>{
    const route=readFileSync(resolve(process.cwd(),
      "src/routes/world/domestic-laws/$code.tsx"),"utf8");
    const country=readFileSync(resolve(process.cwd(),
      "src/components/world/WorldDomesticPolitics.tsx"),"utf8");
    const viewer=readFileSync(resolve(process.cwd(),
      "src/components/world/WorldDomesticLaws.tsx"),"utf8");
    expect(route).toContain("WorldPublicGate verifyOnMount");
    expect(route).toContain("<AppShell>");
    expect(country).toContain('/world/domestic-laws/$code');
    expect(viewer).toContain("readDomesticLaws");
    expect(viewer).toContain("writeDomesticMeasure");
    expect(viewer).toContain("isFetchedAfterMount");
    expect(viewer).toContain("candidate?.countryId===data?.countryId");
  });
  it("does not introduce a real institutional vote, legal Work owner or another controller",()=>{
    expect(SQL).toContain("public.country_accounts");
    expect(SQL).not.toContain("insert into public.world_ballots");
    expect(SQL).not.toContain("create table public.country_accounts");
    expect(SQL).not.toContain("create table public.world_documents");
    expect(SQL).toContain("world_domestic_measures");
    expect(SQL).toContain("world_domestic_measure_versions");
    expect(SQL).toContain("world_domestic_measure_transitions");
    expect(SQL).toContain("world_domestic_laws");
  });
  it("keeps a governed transactional operation and immutable version snapshots",()=>{
    expect(SQL).toContain("ca.user_id=v_actor and ca.status='active'");
    expect(SQL).toContain("private.studio2_claim_operation");
    expect(SQL).toContain("private.studio2_complete_operation");
    expect(SQL).toContain("private.v3_emit_domain_event");
    expect(SQL).toContain("v_m.revision<>p_expected_revision");
    expect(SQL).toContain("unique(measure_id,version_number)");
    expect(SQL).toContain("title_snapshot");
    expect(SQL).toContain("body_snapshot");
    expect(SQL).not.toMatch(/delete from public\.world_domestic_measure_versions/i);
  });
  it("does not reveal pre-public version metadata to anonymous readers after first publication",()=>{
    expect(SQL).toContain("public_version_floor bigint");
    expect(SQL).toContain("public_version_floor=coalesce(public_version_floor,current_version)");
    expect(SQL).toContain("h.version_number>=m.public_version_floor");
    expect(SQL).toContain("ca.country_id=m.country_id and ca.user_id=auth.uid()");
    expect(SQL).toContain("ca.status='active'");
  });
  it("enforces configurable state machines and no fictional voting masquerading as certified ballots",()=>{
    expect(DOMESTIC_TRANSITIONS.democratic).toMatchObject({
      draft:["introduced"],introduced:["debated","rejected","withdrawn"],
      debated:["adopted","rejected","withdrawn"],adopted:["enacted"],
    });
    expect(DOMESTIC_TRANSITIONS.monarchical?.council).toEqual(["assented","vetoed"]);
    expect(DOMESTIC_TRANSITIONS.decree?.issued).toEqual(["enacted"]);
    expect(SQL).toContain("INVALID_DOMESTIC_PROCESS_TRANSITION");
    expect(SQL).toContain("ONLY_ENACTED_LAWS_MAY_BE_REPEALED");
    expect(SQL).toContain("LAW_ALREADY_REPEALED");
  });
  it("does not bypass rollout and denies direct DML to anonymous, authenticated and service roles",()=>{
    expect(SQL).toContain("WORLD_NOT_PUBLISHED");
    expect(SQL.split("studio2_feature_enabled('terra_world_public'").length-1).toBe(4);
    expect(SQL).toContain("from public,anon,authenticated,service_role");
    for(const t of ["world_domestic_measures","world_domestic_measure_versions",
      "world_domestic_measure_transitions","world_domestic_laws"]){
      expect(SQL).toContain("public."+t+" enable row level security");
    }
    expect(SQL).toContain("grant select on public.world_domestic_measures");
  });
  it("bounds client readers and strips sensitive fields",()=>{
    const out=parseDomesticLaws(overview,"OL")!;
    expect(out.laws[0].title).toBe("Fictional Civil Act");
    expect(out.laws[0]).not.toHaveProperty("secretAuthorId");
    expect(out.measures[0]).not.toHaveProperty("secretVoter");
    expect(out).not.toHaveProperty("authUserId");
    expect(()=>parseDomesticLaws(overview,"UN")).toThrow();
    expect(()=>parseDomesticLaws({...overview,measures:Array(31).fill(overview.measures[0])},"OL")).toThrow();
    expect(parseDomesticLaws(null,"OL")).toBeNull();
  });
  it("validates a full-text detail separately from bounded directories",()=>{
    expect(parseDomesticMeasureDetail(detail,measureId)?.body).toContain("Section I.");
    expect(()=>parseDomesticMeasureDetail({...detail,body:"x".repeat(15001)},measureId)).toThrow();
    expect(()=>parseDomesticMeasureDetail({...detail,id:"wrong"},measureId)).toThrow();
    expect(()=>parseDomesticMeasureDetail({...detail,versionHistory:[{number:-1}]},measureId)).toThrow();
  });
  it("never opens Supabase for malformed or pre-aborted reads",async()=>{
    const abort=new AbortController();abort.abort();
    await expect(readDomesticLaws("OL",abort.signal)).rejects.toThrow("cancelled");
    await expect(readDomesticLaws("OL?secret")).rejects.toThrow("Invalid");
    await expect(readDomesticMeasureDetail("INVALID")).rejects.toThrow("Invalid");
    expect(rpc).not.toHaveBeenCalled();
    const forwarded=vi.fn().mockResolvedValue({data:overview,error:null});
    rpc.mockReturnValueOnce({abortSignal:forwarded});
    await expect(readDomesticLaws("OL",new AbortController().signal)).resolves.toMatchObject({countryCode:"OL"});
    expect(forwarded).toHaveBeenCalledTimes(1);
  });
  it("requires authoritative receipts and reports CAS conflicts rather than client-side fake success",async()=>{
    rpc.mockResolvedValueOnce({data:{ok:true,id:measureId,revision:1,
      operationId,action:"create"},error:null});
    await expect(writeDomesticMeasure({
      countryId,measureId:null,action:"create",
      payload:{title:"Fictional Law",body:"Article I",processKind:"democratic"},
      expectedRevision:0,operationId,idempotencyKey:operationId,
    })).resolves.toMatchObject({id:measureId,revision:1});
    expect(rpc).toHaveBeenCalledWith("world_write_domestic_measure_v1",expect.objectContaining({
      p_action:"create",p_expected_revision:0,p_country_id:countryId,
    }));
    rpc.mockResolvedValueOnce({data:null,error:{code:"40001",message:"VERSION_CONFLICT"}});
    await expect(writeDomesticMeasure({
      countryId,measureId,action:"advance",payload:{nextStatus:"enacted"},
      expectedRevision:4,operationId,idempotencyKey:operationId,
    })).rejects.toThrow("changed");
  });
  it("derives published enactment and repeal history from canonical laws with accurate lookahead",()=>{
    const pos=SQL.indexOf("create or replace function public.world_history_timeline_v1");
    expect(pos).toBeGreaterThan(0);
    const history=SQL.slice(pos,SQL.indexOf("do $contract$",pos));
    expect(history).toContain("world_domestic_laws");
    expect(history).toContain("'domestic_law'");
    expect(history).toContain("law-enacted:");
    expect(history).toContain("law-repealed:");
    expect(history).toContain("limit 21 offset p_page*20");
    expect(history).toContain("count(*) > 20");
    expect(history).toContain("WORLD_NOT_PUBLISHED");
    // A previous source edit injected the registration DO block into a SQL regexp.
    // Ensure the entire validation clause is literal SQL, never an interleaved block.
    expect(history).toContain("p_country_code !~ '^[[:alnum:]-]+
    expect(history.split("$history$").length-1).toBe(2);
    expect(history).not.toContain("insert into public.world_history_events");
  });
});
)) then");
    expect(history).not.toContain("v3_register_migration_contract");
    expect(history).not.toContain("notify pgrst");
    expect(history).not.toContain("$contract$");
    expect(SQL.match(/do \\$contract\\$/g)).toHaveLength(1);
    expect(history.split("$history$").length-1).toBe(2);
    expect(history).not.toContain("insert into public.world_history_events");
  });
});
