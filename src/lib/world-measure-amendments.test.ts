import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
const {rpcMock}=vi.hoisted(()=>({rpcMock:vi.fn()}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{rpc:rpcMock}}));
import {
 getWorldAmendments,parseAmendmentWorkspace,parseAmendmentReceipt,
 submitWorldAmendment,withdrawWorldAmendment,validateAmendInput,
} from "./world-measure-amendments";

const measureId="11111111-1111-4111-8111-111111111111";
const countryId="22222222-2222-4222-8222-222222222222";
const orgId="33333333-3333-4333-8333-333333333333";
const organId="44444444-4444-4444-8444-444444444444";
const versionId="55555555-5555-4555-8555-555555555555";
const amendmentId="66666666-6666-4666-8666-666666666666";
const operationId="77777777-7777-4777-8777-777777777777";
const base={
 measureId,organizationId:orgId,organId,measureTitle:"Published proposal",
 currentVersionId:versionId,currentVersionText:"Preamble. Keep this passage. Conclude.",
 measureState:"registered",measureRevision:2,canSubmit:true,
 amendments:[{
  id:amendmentId,sponsorCountryId:countryId,sponsorCountryCode:"XZ",
  baseVersionId:versionId,currentText:"Keep this passage",
  proposedText:"Replace with a better passage",reasoning:"Explanation of constitutional necessity",
  state:"proposed",submittedAt:"2026-11-07T12:00:00Z",withdrawnAt:null,
  revision:1,contentHash:"a".repeat(64),relatedVoteId:null,incorporatedVersionId:null,
 }],
};
const envelope=(result:Record<string,unknown>,replayed=false)=>({
 status:"succeeded",operationId,replayed,result:{ok:true,operationId,...result},
});
describe("WORLD-05 TG7 amendments, without fake adoption",()=>{
 beforeEach(()=>rpcMock.mockReset());
 it("parses only a real versioned authorized projection",()=>{
   expect(parseAmendmentWorkspace(base)?.amendments).toHaveLength(1);
   expect(parseAmendmentWorkspace(null)).toBeNull();
   expect(()=>parseAmendmentWorkspace({...base,canSubmit:null})).toThrow();
   expect(()=>parseAmendmentWorkspace({...base,currentVersionText:null})).toThrow();
   expect(()=>parseAmendmentWorkspace({...base,amendments:[{
     ...base.amendments[0],state:"withdrawn",withdrawnAt:null,
   }]})).toThrow();
   expect(()=>parseAmendmentWorkspace({...base,amendments:Array(31).fill(base.amendments[0])})).toThrow();
 });
 it("requires the nested canonical operation receipt and rejects flat fake success",()=>{
   const result={amendmentId,measureId,status:"proposed",revision:1};
   expect(parseAmendmentReceipt(envelope(result),operationId)).toMatchObject({
     amendmentId,measureId,status:"proposed",replayed:false,
   });
   expect(()=>parseAmendmentReceipt({...result,operationId},operationId)).toThrow();
   expect(()=>parseAmendmentReceipt({...envelope(result),status:"pending"},operationId)).toThrow();
   expect(()=>parseAmendmentReceipt(envelope({...result,revision:0}),operationId)).toThrow();
   expect(()=>parseAmendmentReceipt(envelope(result),countryId)).toThrow();
 });
 it("fetches scoped private amendments only through managed RPC",async()=>{
   rpcMock.mockResolvedValueOnce({data:base,error:null});
   expect((await getWorldAmendments(measureId))?.measureRevision).toBe(2);
   expect(rpcMock).toHaveBeenCalledWith("world_measure_amendments_manage_v1",
     {p_measure_id:measureId});
   rpcMock.mockReset();
   expect(await getWorldAmendments("invalid")).toBeNull();
   expect(rpcMock).not.toHaveBeenCalled();
 });
 it("validates exact version, immutable source wording and reason",()=>{
   const input={measureId,sponsorCountryId:countryId,baseVersionId:versionId,
     currentText:"Keep this passage",proposedText:"Change the passage",
     reasoning:"A good procedural reason",expectedMeasureRevision:2,operationId};
   expect(validateAmendInput(input)).toBeNull();
   expect(validateAmendInput({...input,proposedText:"Keep this passage"})).not.toBeNull();
   expect(validateAmendInput({...input,reasoning:"no"})).not.toBeNull();
   expect(validateAmendInput({...input,baseVersionId:"bad"})).not.toBeNull();
 });
 it("submits only through exact-version R2 and persistent idempotency",async()=>{
   const input={measureId,sponsorCountryId:countryId,baseVersionId:versionId,
     currentText:" Keep this passage ",proposedText:"Better passage",
     reasoning:"An eligible sponsor reason",expectedMeasureRevision:2,operationId};
   rpcMock.mockResolvedValueOnce({data:envelope({
     amendmentId,measureId,status:"proposed",revision:1,
   }),error:null});
   expect((await submitWorldAmendment(input)).status).toBe("proposed");
   expect(rpcMock).toHaveBeenCalledWith("world_submit_measure_amendment_v1",
     expect.objectContaining({p_measure_id:measureId,p_base_version_id:versionId,
       p_current_text:"Keep this passage",p_expected_measure_revision:2,
       p_idempotency_key:"world.amendment.submit:"+operationId}));
 });
 it("withdraws a proposal with CAS and never deletes its audit record",async()=>{
   rpcMock.mockResolvedValueOnce({data:envelope({
     amendmentId,measureId,status:"withdrawn",revision:2,
   }),error:null});
   expect((await withdrawWorldAmendment({
     amendmentId,expectedAmendmentRevision:1,operationId,
   })).status).toBe("withdrawn");
   expect(rpcMock).toHaveBeenCalledWith("world_withdraw_measure_amendment_v1",
     expect.objectContaining({p_expected_amendment_revision:1,
       p_idempotency_key:"world.amendment.withdraw:"+operationId}));
 });
 it("prevents browser acceptance, unapproved versions and raw table operations",()=>{
   const schema=readFileSync(resolve(process.cwd(),
     "supabase/migrations/20261107123500_v3_tg7_measure_amendments.sql"),"utf8");
   const commands=readFileSync(resolve(process.cwd(),
     "supabase/migrations/20261107123600_v3_tg7_measure_amendment_commands.sql"),"utf8");
   const client=readFileSync(resolve(process.cwd(),
     "src/lib/world-measure-amendments.ts"),"utf8");
   const route=readFileSync(resolve(process.cwd(),
     "src/routes/world/measures/$measureId/amendments.tsx"),"utf8");
   expect(schema).toContain("create table public.world_measure_amendments");
   expect(schema).toContain("world_amendment_base_fk");
   expect(schema).toContain("world_amendment_history_guard");
   expect(schema).toContain("world_amendment_identity_guard");
   expect(schema).toContain("public.world_measure_amendments enable row level security");
   expect(schema).toContain("public,anon,authenticated,service_role");
   expect(schema).toContain("coalesce(public.world_access_allowed");
   expect(commands).toContain("WORLD_AMENDMENTS_DISABLED");
   expect(commands).toContain("AMENDMENT_TARGET_NOT_UNIQUE");
   expect(commands).toContain("private.studio2_claim_operation");
   expect(commands).toContain("'world.amendment.proposed'");
   expect(commands).toContain("'world.amendment.withdrawn'");
   expect(commands).not.toContain("state='accepted'");
   expect(commands).not.toContain("set current_version_id");
   expect(client).not.toMatch(/\.from\(["'](?:world_measure_amendments|world_measure_versions)["']\)/);
   expect(route).toContain("<WorldPublicGate verifyOnMount>");
 });
});
