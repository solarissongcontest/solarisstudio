import { supabase } from "@/integrations/supabase/client";
import { parseCourtCase, type CourtCase } from "./world-court-filing";
import { verifyCourtJudgmentReceipt, type CourtJudgmentOperation } from "./world-court-judgments";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const obj=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const txt=(v:unknown):string=>{
 if(typeof v!=="string"||!v.trim())throw new Error("The Court proceeding is incomplete.");
 return v;
};
const id=(v:unknown):string=>{
 const value=txt(v);
 if(!UUID.test(value))throw new Error("Invalid Court record identifier.");
 return value;
};
const number=(v:unknown):number=>{
 if(typeof v!=="number"||!Number.isSafeInteger(v)||v<1)throw new Error("Invalid Court record revision.");
 return v;
};
const optional=(v:unknown):string|null=>typeof v==="string"&&v.trim()?v:null;
const check=(error:{message:string}|null)=>{if(error)throw error;};
const formats=["written","video","in_person","hybrid"] as const;
const statuses=["scheduled","held","cancelled"] as const;
export type CourtHearingFormat=typeof formats[number];
export type CourtHearingStatus=typeof statuses[number];
export type CourtHearing={
 id:string;caseId:string;startsAt:string;endsAt:string;
 format:CourtHearingFormat;locationNote:string|null;
 status:CourtHearingStatus;heldSummary:string|null;
 cancellationReason:string|null;revision:number;
};
export type CourtHearingEvent={
 id:string;hearingId:string;fromState:CourtHearingStatus|null;
 toState:CourtHearingStatus;reason:string|null;
 caseRevision:number;hearingRevision:number;recordedAt:string;
};
export type CourtOrder={
 id:string;caseId:string;orderNumber:number;title:string;
 body:string;effectiveAt:string|null;publishedAt:string;
 publiclyListed:boolean;
};
export type CourtProceedingsWorkspace={
 authorizedCase:CourtCase|null;
 hearings:CourtHearing[];events:CourtHearingEvent[];
 orders:CourtOrder[];canManage:boolean;canJudge:boolean;
};

export function parseCourtHearing(row:unknown):CourtHearing{
 if(!obj(row))throw new Error("Unverifiable Court hearing.");
 if(typeof row.format!=="string"||!(formats as readonly string[]).includes(row.format))
  throw new Error("Unknown hearing format.");
 if(typeof row.status!=="string"||!(statuses as readonly string[]).includes(row.status))
  throw new Error("Unknown Court hearing status.");
 return {
  id:id(row.id),caseId:id(row.case_id),startsAt:txt(row.starts_at),endsAt:txt(row.ends_at),
  format:row.format as CourtHearingFormat,locationNote:optional(row.location_note),
  status:row.status as CourtHearingStatus,heldSummary:optional(row.held_summary),
  cancellationReason:optional(row.cancellation_reason),revision:number(row.revision),
 };
}
export function parseCourtHearingEvent(row:unknown):CourtHearingEvent{
 if(!obj(row))throw new Error("Invalid Court hearing event.");
 const status=row.to_state;
 if(typeof status!=="string"||!(statuses as readonly string[]).includes(status))throw new Error("Unknown hearing event.");
 const before=row.from_state;
 if(before!==null&&(typeof before!=="string"||!(statuses as readonly string[]).includes(before)))
  throw new Error("Unknown hearing history state.");
 return {
  id:id(row.id),hearingId:id(row.hearing_id),
  fromState:before as CourtHearingStatus|null,toState:status as CourtHearingStatus,
  reason:optional(row.reason),caseRevision:number(row.case_revision),
  hearingRevision:number(row.hearing_revision),recordedAt:txt(row.recorded_at),
 };
}
export function parseCourtOrder(row:unknown,fromPublic=false):CourtOrder{
 if(!obj(row))throw new Error("Invalid Court order.");
 const count=row.order_number??row.orderNumber;
 const listed=row.publicly_listed??(fromPublic?true:false);
 if(typeof listed!=="boolean")throw new Error("Invalid official publication status.");
 return {
  id:id(row.id),caseId:id(row.case_id??row.caseId),orderNumber:number(count),
  title:txt(row.title),body:txt(row.body),
  effectiveAt:optional(row.effective_at??row.effectiveAt),
  publishedAt:txt(row.published_at??row.publishedAt),publiclyListed:listed,
 };
}
export function canRecordCourtHearing(
 hearing:CourtHearing,caseStatus:CourtCase["status"],now:Date,
):boolean{
 return hearing.status==="scheduled"
  && !["decided","closed","archived"].includes(caseStatus)
  && now.getTime()>=Date.parse(hearing.startsAt);
}

/** The public projection is verified first. Private rows never leave RLS. */
export async function fetchCourtProceedings(caseId:string):Promise<CourtProceedingsWorkspace>{
 const key=id(caseId);
 const db=supabase as any;
 const publicOrders=await db.rpc("world_court_public_orders_v1",{p_case_id:key});
 check(publicOrders.error);
 if(!Array.isArray(publicOrders.data))throw new Error("The public Court order projection could not be verified.");
 const visible=publicOrders.data.map((v:unknown)=>parseCourtOrder(v,true));
 const {data:auth,error:authError}=await supabase.auth.getUser();
 check(authError);
 if(!auth.user)return {authorizedCase:null,hearings:[],events:[],orders:visible,canManage:false,canJudge:false};
 const caseResult=await db.from("world_court_cases")
  .select("id,identifier,organization_id,applicant_country_id,respondent_country_id,claim,legal_basis,requested_remedy,status,revision,filed_at,updated_at")
  .eq("id",key).maybeSingle();
 check(caseResult.error);
 if(!caseResult.data)return {authorizedCase:null,hearings:[],events:[],orders:visible,canManage:false,canJudge:false};
 const record=parseCourtCase(caseResult.data);
 const [hearings,events,orders,manager,judge]=await Promise.all([
  db.from("world_court_hearings")
   .select("id,case_id,starts_at,ends_at,format,location_note,status,held_summary,cancellation_reason,revision")
   .eq("case_id",key).order("starts_at",{ascending:true}).limit(100),
  db.from("world_court_hearing_events")
   .select("id,hearing_id,from_state,to_state,reason,case_revision,hearing_revision,recorded_at")
   .eq("case_id",key).order("case_revision",{ascending:true}).limit(200),
  db.from("world_court_orders")
   .select("id,case_id,order_number,title,body,effective_at,published_at,publicly_listed")
   .eq("case_id",key).order("order_number",{ascending:true}).limit(100),
  db.rpc("world_access_allowed",{
   p_capability:"world.court.manage",p_organization_id:record.organizationId,
   p_country_id:null,p_organ_id:null,p_object_type:"court",p_object_id:key,
  }),
  db.rpc("world_court_judge_eligible_v1",{p_case_id:key}),
 ]);
 for(const r of [hearings,events,orders,manager,judge])check(r.error);
 return {
  authorizedCase:record,
  hearings:(hearings.data??[]).map(parseCourtHearing),
  events:(events.data??[]).map(parseCourtHearingEvent),
  orders:(orders.data??[]).map((v:unknown)=>parseCourtOrder(v)),
  canManage:manager.data===true,
  canJudge:judge.data===true,
 };
}
export type CourtProceedingOp=CourtJudgmentOperation;
async function mutate(name:string,args:Record<string,unknown>,op:CourtProceedingOp){
 const {data,error}=await (supabase as any).rpc(name,{
  ...args,p_operation_id:id(op.operationId),p_idempotency_key:txt(op.key),
 });
 check(error);
 return verifyCourtJudgmentReceipt(data,op.operationId);
}
export async function scheduleCourtHearing(input:{
 caseId:string;startsAt:string;endsAt:string;format:CourtHearingFormat;
 locationNote:string;expectedRevision:number;op:CourtProceedingOp;
}){
 return mutate("world_schedule_court_hearing_v1",{
  p_case_id:id(input.caseId),p_starts_at:input.startsAt,p_ends_at:input.endsAt,
  p_format:input.format,p_location_note:input.locationNote.trim(),
  p_expected_revision:input.expectedRevision,
 },input.op);
}
export async function decideCourtHearing(input:{
 hearingId:string;target:"held"|"cancelled";reason:string;
 expectedCaseRevision:number;expectedHearingRevision:number;op:CourtProceedingOp;
}){
 return mutate("world_decide_court_hearing_v1",{
  p_hearing_id:id(input.hearingId),p_target_state:input.target,
  p_reason:input.reason.trim(),p_expected_case_revision:input.expectedCaseRevision,
  p_expected_hearing_revision:input.expectedHearingRevision,
 },input.op);
}
export async function issueCourtOrder(input:{
 caseId:string;title:string;body:string;effectiveAt:string|null;
 publiclyListed:boolean;expectedRevision:number;op:CourtProceedingOp;
}){
 return mutate("world_issue_court_order_v1",{
  p_case_id:id(input.caseId),p_title:input.title.trim(),p_body:input.body.trim(),
  p_effective_at:input.effectiveAt,p_publicly_listed:input.publiclyListed,
  p_expected_revision:input.expectedRevision,
 },input.op);
}
