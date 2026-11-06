import { supabase } from "@/integrations/supabase/client";

// TG7 amendments do not accept or enact text. Only governed submit/withdraw.
const db = supabase as any;
type Obj = Record<string,unknown>;
const object = (v:unknown):v is Obj => v!==null && typeof v==="object" && !Array.isArray(v);
export const amendmentUuid = (v:unknown):v is string => typeof v==="string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const string=(v:unknown):v is string=>typeof v==="string";
const optional=(v:unknown):v is string|null=>v===null||string(v);
const revision=(v:unknown):v is number=>Number.isSafeInteger(v)&&(v as number)>=1;
const hash=(v:unknown):v is string=>string(v)&&/^[0-9a-f]{64}$/.test(v);
const date=(v:unknown):v is string=>string(v)&&Number.isFinite(Date.parse(v));
function invalid(label:string):never{throw new Error("Institutional amendment "+label+" could not be verified.");}
export type WorldAmendment={
 id:string; sponsorCountryId:string; sponsorCountryCode:string; baseVersionId:string;
 currentText:string; proposedText:string; reasoning:string;
 state:"proposed"|"accepted"|"rejected"|"withdrawn"|"superseded";
 submittedAt:string; withdrawnAt:string|null; revision:number; contentHash:string;
 relatedVoteId:string|null; incorporatedVersionId:string|null;
};
export type WorldAmendmentsWorkspace={
 measureId:string; organizationId:string; organId:string; measureTitle:string;
 currentVersionId:string; currentVersionText:string;
 measureState:string; measureRevision:number; canSubmit:boolean;
 amendments:WorldAmendment[];
};
export type WorldAmendmentReceipt={
 ok:true; amendmentId:string; measureId:string; status:"proposed"|"withdrawn";
 revision:number; operationId:string; replayed:boolean;
};
export type AmendInput={
 measureId:string; sponsorCountryId:string; baseVersionId:string;
 currentText:string; proposedText:string; reasoning:string;
 expectedMeasureRevision:number; operationId:string;
};
export type WithdrawInput={
 amendmentId:string; expectedAmendmentRevision:number; operationId:string;
};
const states=new Set(["proposed","accepted","rejected","withdrawn","superseded"]);
async function rpc(name:string,args:Obj):Promise<unknown>{
 const {data,error}=await db.rpc(name,args);
 if(error)throw error;
 return data;
}
export function parseAmendmentWorkspace(v:unknown):WorldAmendmentsWorkspace|null {
 if(v===null)return null;
 if(!object(v)||!amendmentUuid(v.measureId)||!amendmentUuid(v.organizationId)||
    !amendmentUuid(v.organId)||!string(v.measureTitle)||
    !amendmentUuid(v.currentVersionId)||!string(v.currentVersionText)||
    !string(v.measureState)||!revision(v.measureRevision)||
    typeof v.canSubmit!=="boolean"||!Array.isArray(v.amendments)||
    v.amendments.length>30)return invalid("manager");
 const amendments:WorldAmendment[]=v.amendments.map((raw:unknown)=>{
   if(!object(raw)||!amendmentUuid(raw.id)||!amendmentUuid(raw.sponsorCountryId)||
     !string(raw.sponsorCountryCode)||!amendmentUuid(raw.baseVersionId)||
     !string(raw.currentText)||!string(raw.proposedText)||!string(raw.reasoning)||
     !string(raw.state)||!states.has(raw.state)||!date(raw.submittedAt)||
     !optional(raw.withdrawnAt)||!revision(raw.revision)||!hash(raw.contentHash)||
     !(raw.relatedVoteId===null||amendmentUuid(raw.relatedVoteId))||
     !(raw.incorporatedVersionId===null||amendmentUuid(raw.incorporatedVersionId))||
     ((raw.state==="withdrawn")!==(raw.withdrawnAt!==null)))
     return invalid("entry");
   return {id:raw.id,sponsorCountryId:raw.sponsorCountryId,
     sponsorCountryCode:raw.sponsorCountryCode,baseVersionId:raw.baseVersionId,
     currentText:raw.currentText,proposedText:raw.proposedText,reasoning:raw.reasoning,
     state:raw.state as WorldAmendment["state"],submittedAt:raw.submittedAt,
     withdrawnAt:raw.withdrawnAt,revision:raw.revision,contentHash:raw.contentHash,
     relatedVoteId:raw.relatedVoteId,incorporatedVersionId:raw.incorporatedVersionId};
 });
 return {measureId:v.measureId,organizationId:v.organizationId,organId:v.organId,
   measureTitle:v.measureTitle,currentVersionId:v.currentVersionId,
   currentVersionText:v.currentVersionText,measureState:v.measureState,
   measureRevision:v.measureRevision,canSubmit:v.canSubmit,amendments};
}
export function parseAmendmentReceipt(v:unknown,operationId:string):WorldAmendmentReceipt {
 const envelope=object(v)?v:null;
 const result=object(envelope?.result)?envelope.result:null;
 if(!envelope||envelope.status!=="succeeded"||
   envelope.operationId!==operationId||typeof envelope.replayed!=="boolean"||
   !result||result.ok!==true||result.operationId!==operationId||
   !amendmentUuid(result.amendmentId)||!amendmentUuid(result.measureId)||
   !revision(result.revision)||
   (result.status!=="proposed"&&result.status!=="withdrawn"))
   return invalid("receipt");
 return {ok:true,amendmentId:result.amendmentId,measureId:result.measureId,
   status:result.status,revision:result.revision,
   operationId,replayed:envelope.replayed};
}
export async function getWorldAmendments(measureId:string):Promise<WorldAmendmentsWorkspace|null>{
 if(!amendmentUuid(measureId))return null;
 return parseAmendmentWorkspace(await rpc("world_measure_amendments_manage_v1",
   {p_measure_id:measureId}));
}
export function validateAmendInput(v:AmendInput):string|null{
 if(!amendmentUuid(v.measureId)||!amendmentUuid(v.sponsorCountryId)||
    !amendmentUuid(v.baseVersionId)||!amendmentUuid(v.operationId)||
    !revision(v.expectedMeasureRevision))
    return "The measure, country, version or operation identity is invalid.";
 if(!v.currentText.trim()||v.currentText.trim().length>5000)
    return "Select a precise passage up to 5,000 characters.";
 if(!v.proposedText.trim()||v.proposedText.trim().length>5000||
     v.currentText.trim()===v.proposedText.trim())
    return "Provide different replacement wording up to 5,000 characters.";
 if(v.reasoning.trim().length<8||v.reasoning.trim().length>3000)
    return "Explain the amendment in 8 to 3,000 characters.";
 return null;
}
export async function submitWorldAmendment(v:AmendInput):Promise<WorldAmendmentReceipt>{
 const error=validateAmendInput(v);
 if(error)throw new Error(error);
 const res=await rpc("world_submit_measure_amendment_v1",{
   p_measure_id:v.measureId,p_sponsor_country_id:v.sponsorCountryId,
   p_base_version_id:v.baseVersionId,p_current_text:v.currentText.trim(),
   p_proposed_text:v.proposedText.trim(),p_reasoning:v.reasoning.trim(),
   p_expected_measure_revision:v.expectedMeasureRevision,p_operation_id:v.operationId,
   p_idempotency_key:"world.amendment.submit:"+v.operationId,
 });
 return parseAmendmentReceipt(res,v.operationId);
}
export async function withdrawWorldAmendment(v:WithdrawInput):Promise<WorldAmendmentReceipt>{
 if(!amendmentUuid(v.amendmentId)||!revision(v.expectedAmendmentRevision)||
    !amendmentUuid(v.operationId))throw new Error("Current amendment identity or revision is invalid.");
 const res=await rpc("world_withdraw_measure_amendment_v1",{
   p_amendment_id:v.amendmentId,p_expected_amendment_revision:v.expectedAmendmentRevision,
   p_operation_id:v.operationId,p_idempotency_key:"world.amendment.withdraw:"+v.operationId,
 });
 return parseAmendmentReceipt(res,v.operationId);
}
