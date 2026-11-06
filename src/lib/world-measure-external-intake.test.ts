import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
const { rpcMock } = vi.hoisted(()=>({rpcMock:vi.fn()}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{rpc:rpcMock}}));
import {
  introduceExternalMeasure, listExternalIntakes, listExternalIntakeInstitutions,
  loadExternalIntakeOptions, parseExternalIntakes, parseExternalReceipt,
  recordExternalIntake, validateExternalIntroduction, validateExternalRecord,
} from "./world-measure-external-intake";

const org="11111111-1111-4111-8111-111111111111";
const country="22222222-2222-4222-8222-222222222222";
const intake="33333333-3333-4333-8333-333333333333";
const measure="44444444-4444-4444-8444-444444444444";
const organ="55555555-5555-4555-8555-555555555555";
const operation="66666666-6666-4666-8666-666666666666";
const contentHash="a".repeat(64);
const source={
  id:intake,organizationId:org,countryId:country,countryCode:"XZA",
  sourceChannel:"instagram",sourceReference:"DM 12 November",
  receivedAt:"2026-11-07T12:01:00Z",rawTitle:"A formal proposal",
  rawText:"Original received message body",sourceNote:"Received by the chair",
  contentHash,status:"received",revision:1,introducedMeasureId:null,
};
const accepted={...source,status:"introduced",revision:2,introducedMeasureId:measure};
const institutions=[{id:org,slug:"guard",shortName:"GUARD"}];
const options={organs:[{id:organ,name:"General Assembly"}],
  countries:[{id:country,name:"Test Country",shortCode:"XZA"}],
  categories:[{code:"TP",label:"Known constitutional topic"}]};
const success=(result: Record<string,unknown>)=>({
  status:"succeeded",operationId:operation,replayed:false,
  result:{ok:true,operationId,...result},
});
describe("WORLD-05 TG7 governed external proposals",()=>{
  beforeEach(()=>rpcMock.mockReset());
  it("never reads a private inbox without an authorized RPC and exact org context",async()=>{
    rpcMock.mockResolvedValueOnce({data:[source],error:null});
    expect((await listExternalIntakes(org))?.[0].contentHash).toBe(contentHash);
    expect(rpcMock).toHaveBeenCalledWith("world_external_intakes_manage_v1",
      {p_organization_id:org});
    await expect(listExternalIntakes("invalid")).rejects.toThrow();
  });
  it("rejects malformed or cross-institution private messages",()=>{
    expect(parseExternalIntakes([source],org)).toHaveLength(1);
    expect(parseExternalIntakes(null,org)).toBeNull();
    expect(()=>parseExternalIntakes([{...source,organizationId:country}],org)).toThrow();
    expect(()=>parseExternalIntakes([{...source,status:"introduced",introducedMeasureId:null}],org)).toThrow();
    expect(()=>parseExternalIntakes([{...source,contentHash:"unverified"}],org)).toThrow();
    expect(()=>parseExternalIntakes([{...source,rawText:undefined}],org)).toThrow();
    expect(parseExternalIntakes([accepted],org)?.[0].introducedMeasureId).toBe(measure);
    expect(()=>parseExternalIntakes(Array(31).fill(source),org)).toThrow();
  });
  it("validates private organization, country, organ and REAL category options",async()=>{
    rpcMock.mockResolvedValueOnce({data:institutions,error:null});
    expect((await listExternalIntakeInstitutions())[0].slug).toBe("guard");
    rpcMock.mockResolvedValueOnce({data:options,error:null});
    expect((await loadExternalIntakeOptions(org))?.categories[0].code).toBe("TP");
    expect(rpcMock).toHaveBeenCalledWith("world_external_intake_options_v1",
      {p_organization_id:org});
    rpcMock.mockResolvedValueOnce({data:{...options,categories:null},error:null});
    await expect(loadExternalIntakeOptions(org)).rejects.toThrow();
  });
  it("accepts ONLY the canonical nested succeeded operation receipt",()=>{
    const envelope=success({
      intakeId:intake,organizationId:org,status:"received",revision:1,contentHash,
    });
    expect(parseExternalReceipt(envelope,operation)).toMatchObject({
      intakeId:intake,status:"received",replayed:false,operationId:operation,
    });
    expect(()=>parseExternalReceipt(envelope.result,operation)).toThrow();
    expect(()=>parseExternalReceipt({...envelope,status:"pending"},operation)).toThrow();
    expect(()=>parseExternalReceipt({...envelope,replayed:undefined},operation)).toThrow();
    expect(()=>parseExternalReceipt({...envelope,
      result:{...envelope.result,operationId:country}},operation)).toThrow();
    expect(()=>parseExternalReceipt(success({intakeId:intake,status:"introduced",
      revision:2,measureId:"not-uuid"}),operation)).toThrow();
    expect(parseExternalReceipt(success({intakeId:intake,status:"introduced",
      revision:2,measureId:measure}),operation).measureId).toBe(measure);
  });
  it("records a received private source without manufacturing formal proposal creation",async()=>{
    const request={organizationId:org,countryId:country,sourceChannel:"instagram" as const,
      sourceReference:" message #12 ",rawTitle:" A formal proposal ",
      rawText:" Received body ",sourceNote:"Chair intake",operationId:operation};
    expect(validateExternalRecord(request)).toBeNull();
    expect(validateExternalRecord({...request,sourceChannel:"invented" as any})).not.toBeNull();
    expect(validateExternalRecord({...request,rawText:""})).not.toBeNull();
    rpcMock.mockResolvedValueOnce({data:success({
      intakeId:intake,organizationId:org,status:"received",revision:1,contentHash,
    }),error:null});
    expect((await recordExternalIntake(request)).status).toBe("received");
    expect(rpcMock).toHaveBeenCalledWith("world_record_external_intake_v1",
      expect.objectContaining({
        p_source_channel:"instagram",p_source_reference:"message #12",
        p_raw_title:"A formal proposal",p_raw_text:"Received body",
        p_raw_attachments:[],p_operation_id:operation,
        p_idempotency_key:"world.measure.external_intake.record:"+operation,
      }));
  });
  it("introduces exactly ONE formal submitted measure only through governed command",async()=>{
    const request={intakeId:intake,organId:organ,measureType:"proposal",
      categoryCode:"TP",expectedRevision:1,operationId:operation};
    expect(validateExternalIntroduction(request)).toBeNull();
    expect(validateExternalIntroduction({...request,categoryCode:"FAKE CODE"})).not.toBeNull();
    rpcMock.mockResolvedValueOnce({data:success({
      intakeId:intake,measureId:measure,status:"introduced",revision:2,
    }),error:null});
    expect((await introduceExternalMeasure(request)).measureId).toBe(measure);
    expect(rpcMock).toHaveBeenCalledWith("world_introduce_external_measure_v1",
      expect.objectContaining({p_intake_id:intake,p_expected_intake_revision:1,
        p_operation_id:operation,
        p_idempotency_key:"world.measure.external_intake.introduce:"+operation}));
  });
  it("keeps raw messages unpublished and blocks direct table writes",()=>{
    const root="supabase/migrations/";
    const intakeSql=readFileSync(resolve(process.cwd(),root+
      "20261107123000_v3_tg7_external_measure_intake.sql"),"utf8");
    const recordSql=readFileSync(resolve(process.cwd(),root+
      "20261107123100_v3_tg7_external_measure_record.sql"),"utf8");
    const introduceSql=readFileSync(resolve(process.cwd(),root+
      "20261107123200_v3_tg7_external_measure_introduce.sql"),"utf8");
    const service=readFileSync(resolve(process.cwd(),
      "src/lib/world-measure-external-intake.ts"),"utf8");
    expect(intakeSql).toContain("create table private.world_measure_intakes");
    expect(intakeSql).toContain("world_measures_intake_source_identity_fk");
    expect(intakeSql).toContain("world_external_intake_history_guard");
    expect(intakeSql).toContain("alter table private.world_measure_intakes enable row level security");
    expect(intakeSql).toContain("private.world_measure_intakes from public,anon,authenticated,service_role");
    expect(recordSql).toContain("'world.measure.external_intake.received'");
    expect(recordSql).not.toContain("insert into public.world_measures");
    expect(recordSql).toContain("private.studio2_claim_operation");
    expect(introduceSql).toContain("'SPONSOR_NOT_CURRENT_MEMBER'");
    expect(introduceSql).toContain("GUARD_TOPIC_CODE_REQUIRED");
    expect(introduceSql).toContain("insert into public.world_measures");
    expect(introduceSql).toContain("'submitted','members'");
    expect(introduceSql).not.toContain("state='registered'");
    expect(service).not.toMatch(/\.from\(["'](?:world_measure_intakes|world_measures)["']\)/);
    const route=readFileSync(resolve(process.cwd(),
      "src/routes/world/measures/external.tsx"),"utf8");
    expect(route).toContain("<WorldPublicGate verifyOnMount>");
    expect(route).toContain("noindex,nofollow");
  });
});
