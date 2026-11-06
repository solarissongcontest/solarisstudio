import { supabase } from "@/integrations/supabase/client";

export type GuardInquiryStatus = "awaiting_response" | "response_received" | "reviewed";
export type GuardReviewKind = "no_action" | "recommend_action";
export type GuardRecommendation = "warning" | "censure" | "voting_suspension" | "assistance_freeze";

export type GuardInquiry = {
  id: string; organizationId: string; targetCountryId: string;
  allegation: string; sourceReference: string;
  responseDueAt: string; openedAt: string; updatedAt: string;
  status: GuardInquiryStatus; revision: number;
};
export type GuardInquiryResponse = {
  inquiryId: string; responseText: string; submittedAt: string; wasLate: boolean;
};
export type GuardInquiryReview = {
  inquiryId: string; decisionKind: GuardReviewKind;
  proposedAction: GuardRecommendation | null;
  findings: string; reviewedAt: string;
};
export type GuardInquiryHistory = {
  id: string; action: string; fromState: GuardInquiryStatus | null;
  toState: GuardInquiryStatus; revision: number; recordedAt: string;
};
export type GuardInquiryWorkspace = {
  signedIn: boolean;
  countryId: string | null;
  organizationId: string | null;
  countries: { id: string; name: string }[];
  inquiries: GuardInquiry[];
  responses: GuardInquiryResponse[];
  reviews: GuardInquiryReview[];
  canOpen: boolean; canReview: boolean;
};
export type GuardInquiryOperation = { operationId: string; key: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATES: readonly GuardInquiryStatus[] = ["awaiting_response","response_received","reviewed"];
const RECOMMENDATIONS: readonly GuardRecommendation[] =
  ["warning","censure","voting_suspension","assistance_freeze"];
const obj = (x:unknown):x is Record<string,unknown> =>
  x !== null && typeof x==="object" && !Array.isArray(x);
const required = (x:unknown):string => {
  if(typeof x!=="string" || !x.trim()) throw new Error("Incomplete GUARD inquiry record.");
  return x;
};
const id = (x:unknown):string => {
  const value=required(x);
  if(!UUID.test(value)) throw new Error("Invalid GUARD inquiry identifier.");
  return value;
};
const optionalId = (x:unknown):string|null => x===null?null:id(x);
const revision = (x:unknown):number => {
  if(typeof x!=="number"||!Number.isSafeInteger(x)||x<1) throw new Error("Inquiry revision was not verified.");
  return x;
};
const state = (x:unknown):GuardInquiryStatus => {
  if(typeof x!=="string"||!STATES.includes(x as GuardInquiryStatus)) throw new Error("Unknown GUARD inquiry state.");
  return x as GuardInquiryStatus;
};
const reviewKind = (x:unknown):GuardReviewKind => {
  if(x!=="no_action"&&x!=="recommend_action") throw new Error("Invalid GUARD review decision.");
  return x;
};
const recommendation = (x:unknown):GuardRecommendation|null => {
  if(x===null) return null;
  if(typeof x!=="string"||!RECOMMENDATIONS.includes(x as GuardRecommendation))
    throw new Error("Unknown GUARD review recommendation.");
  return x as GuardRecommendation;
};
const timestamp = (x:unknown):string => {
  const value=required(x);
  if(!Number.isFinite(Date.parse(value))) throw new Error("GUARD inquiry date is invalid.");
  return value;
};
const check = (error:{message:string}|null) => {if(error) throw error;};

export function parseGuardInquiry(x:unknown):GuardInquiry {
  if(!obj(x)) throw new Error("Unverifiable GUARD inquiry.");
  return {
    id:id(x.id),organizationId:id(x.organization_id),targetCountryId:id(x.target_country_id),
    allegation:required(x.allegation),sourceReference:required(x.source_reference),
    responseDueAt:timestamp(x.response_due_at),openedAt:timestamp(x.opened_at),
    updatedAt:timestamp(x.updated_at),status:state(x.status),revision:revision(x.revision),
  };
}
export function parseGuardInquiryResponse(x:unknown):GuardInquiryResponse {
  if(!obj(x)||typeof x.was_late!=="boolean") throw new Error("Invalid inquiry response.");
  return {inquiryId:id(x.inquiry_id),responseText:required(x.response_text),
    submittedAt:timestamp(x.submitted_at),wasLate:x.was_late};
}
export function parseGuardInquiryReview(x:unknown):GuardInquiryReview {
  if(!obj(x)) throw new Error("Invalid GUARD review record.");
  const kind=reviewKind(x.decision_kind), proposed=recommendation(x.proposed_action);
  if((kind==="no_action" && proposed!==null)||(kind==="recommend_action"&&proposed===null))
    throw new Error("Inconsistent nonbinding recommendation.");
  return {inquiryId:id(x.inquiry_id),decisionKind:kind,proposedAction:proposed,
    findings:required(x.findings),reviewedAt:timestamp(x.reviewed_at)};
}
export function parseGuardInquiryHistory(x:unknown):GuardInquiryHistory {
  if(!obj(x)) throw new Error("Invalid inquiry history.");
  return {id:id(x.id),action:required(x.action),
    fromState:x.from_state===null?null:state(x.from_state),
    toState:state(x.to_state),revision:revision(x.revision),
    recordedAt:timestamp(x.recorded_at)};
}

export function canRespondToGuardInquiry(row:GuardInquiry,countryId:string|null):boolean {
  return row.status==="awaiting_response" && countryId!==null && row.targetCountryId===countryId;
}
export function canReviewGuardInquiry(row:GuardInquiry,canReview:boolean,now:number):boolean {
  if(!canReview||!Number.isFinite(now)) return false;
  if(row.status==="response_received") return true;
  return row.status==="awaiting_response" &&
    Number.isFinite(Date.parse(row.responseDueAt)) && Date.parse(row.responseDueAt)<=now;
}

export function guardInquiryError(error:unknown):string {
  const msg=obj(error)&&typeof error.message==="string"?error.message:"";
  if(/VERSION_CONFLICT|40001/.test(msg)) return "The inquiry changed. Refresh and review its latest version.";
  if(/AUTHORIZATION|42501|permission denied/.test(msg)) return "Your current country or Chairperson authority could not be verified.";
  if(/RESPONSE_WINDOW_OPEN/.test(msg)) return "The response window is still open. Review is not yet permitted.";
  if(/STATE_CHANGED|23514/.test(msg)) return "The inquiry cannot accept this action in its current state.";
  if(/VALIDATION|22023/.test(msg)) return "Check the required text, deadline and selected action.";
  return "The official inquiry operation could not be confirmed. Retry the identical operation.";
}

/** No anon-private reads, no artificial controller title and no direct DML. */
export async function fetchGuardInquiryWorkspace():Promise<GuardInquiryWorkspace> {
  const {data:auth,error:authError}=await supabase.auth.getUser();
  check(authError);
  if(!auth.user) return {signedIn:false,countryId:null,organizationId:null,
    countries:[],inquiries:[],responses:[],reviews:[],canOpen:false,canReview:false};
  const db=supabase as any;
  const [account,organizations,countries,inquiries]=await Promise.all([
    db.from("country_accounts").select("country_id").eq("user_id",auth.user.id)
      .eq("status","active").maybeSingle(),
    db.from("world_organizations").select("id,short_name").eq("slug","guard")
      .in("status",["recognized","active"]).eq("public_visibility","public").limit(1),
    db.from("countries").select("id,name").order("name").limit(100),
    db.from("world_guard_inquiries")
      .select("id,organization_id,target_country_id,allegation,source_reference,response_due_at,opened_at,updated_at,status,revision")
      .order("opened_at",{ascending:false}).limit(50),
  ]);
  for(const result of [account,organizations,countries,inquiries]) check(result.error);
  const organizationId=organizations.data?.[0]?.id?id(organizations.data[0].id):null;
  const inquiryRows:GuardInquiry[]=(inquiries.data??[]).map(parseGuardInquiry);
  let canOpen=false,canReview=false;
  if(organizationId){
    const [open,review]=await Promise.all([
      db.rpc("world_guard_inquiry_can_open_v1",{p_organization_id:organizationId}),
      db.rpc("world_guard_inquiry_can_review_v1",{p_organization_id:organizationId}),
    ]);
    check(open.error);check(review.error);
    canOpen=open.data===true;canReview=review.data===true;
  }
  let responses:GuardInquiryResponse[]=[],reviews:GuardInquiryReview[]=[];
  if(inquiryRows.length){
    const ids=inquiryRows.map(row=>row.id);
    const [responseRows,reviewRows]=await Promise.all([
      db.from("world_guard_inquiry_responses")
        .select("inquiry_id,response_text,submitted_at,was_late").in("inquiry_id",ids).limit(50),
      db.from("world_guard_inquiry_reviews")
        .select("inquiry_id,decision_kind,proposed_action,findings,reviewed_at")
        .in("inquiry_id",ids).limit(50),
    ]);
    check(responseRows.error);check(reviewRows.error);
    responses=(responseRows.data??[]).map(parseGuardInquiryResponse);
    reviews=(reviewRows.data??[]).map(parseGuardInquiryReview);
  }
  return {signedIn:true,countryId:account.data?.country_id?id(account.data.country_id):null,
    organizationId,
    countries:(countries.data??[]).map((row:any)=>({id:id(row.id),name:required(row.name)})),
    inquiries:inquiryRows,responses,reviews,canOpen,canReview};
}

export async function fetchGuardInquiryHistory(inquiryId:string):Promise<GuardInquiryHistory[]>{
  const db=supabase as any;
  const {data,error}=await db.from("world_guard_inquiry_history")
    .select("id,action,from_state,to_state,revision,recorded_at")
    .eq("inquiry_id",id(inquiryId)).order("revision",{ascending:true}).limit(50);
  check(error);
  return (data??[]).map(parseGuardInquiryHistory);
}

function verifiedReceipt(input:unknown,op:GuardInquiryOperation):{
  inquiryId:string;revision:number;status:GuardInquiryStatus;wasLate?:boolean;recommendationOnly?:boolean;
}{
  const envelope=obj(input)?input:null;
  const result=obj(envelope?.result)?envelope.result:null;
  if(envelope?.status!=="succeeded" || envelope.operationId!==op.operationId
    || result?.ok!==true || result.operationId!==op.operationId)
    throw new Error("A matching durable GUARD operation receipt was not received.");
  return {inquiryId:id(result.inquiryId),revision:revision(result.revision),
    status:state(result.status),
    ...(typeof result.wasLate==="boolean"?{wasLate:result.wasLate}:{}),
    ...(typeof result.recommendationOnly==="boolean"?{recommendationOnly:result.recommendationOnly}:{})};
}
export async function openGuardInquiry(input:{
  organizationId:string;targetCountryId:string;allegation:string;
  sourceReference:string;responseDueAt:string;
},op:GuardInquiryOperation){
  const date=new Date(input.responseDueAt);
  if(!Number.isFinite(date.getTime())) throw new Error("VALIDATION");
  const db=supabase as any;
  const {data,error}=await db.rpc("world_open_guard_inquiry_v1",{
    p_organization_id:id(input.organizationId),p_target_country_id:id(input.targetCountryId),
    p_allegation:input.allegation.trim(),p_source_reference:input.sourceReference.trim(),
    p_response_due_at:date.toISOString(),p_operation_id:id(op.operationId),
    p_idempotency_key:required(op.key),
  });
  check(error);
  const receipt=verifiedReceipt(data,op);
  if(receipt.status!=="awaiting_response") throw new Error("Unexpected GUARD inquiry opening state.");
  return receipt;
}
export async function respondGuardInquiry(input:{
  inquiryId:string;response:string;expectedRevision:number;
},op:GuardInquiryOperation){
  const db=supabase as any;
  const {data,error}=await db.rpc("world_respond_guard_inquiry_v1",{
    p_inquiry_id:id(input.inquiryId),p_response:input.response.trim(),
    p_expected_revision:input.expectedRevision,p_operation_id:id(op.operationId),
    p_idempotency_key:required(op.key),
  });
  check(error);
  const receipt=verifiedReceipt(data,op);
  if(receipt.status!=="response_received"||typeof receipt.wasLate!=="boolean")
    throw new Error("GUARD country response was not acknowledged.");
  return receipt;
}
export async function reviewGuardInquiry(input:{
  inquiryId:string;decisionKind:GuardReviewKind;
  proposedAction:GuardRecommendation|null;findings:string;expectedRevision:number;
},op:GuardInquiryOperation){
  if(input.decisionKind==="no_action"&&input.proposedAction!==null)throw new Error("VALIDATION");
  if(input.decisionKind==="recommend_action"&&
    (input.proposedAction===null||!RECOMMENDATIONS.includes(input.proposedAction)))
    throw new Error("VALIDATION");
  const db=supabase as any;
  const {data,error}=await db.rpc("world_review_guard_inquiry_v1",{
    p_inquiry_id:id(input.inquiryId),p_decision_kind:input.decisionKind,
    p_proposed_action:input.proposedAction,p_findings:input.findings.trim(),
    p_expected_revision:input.expectedRevision,
    p_operation_id:id(op.operationId),p_idempotency_key:required(op.key),
  });
  check(error);
  const receipt=verifiedReceipt(data,op);
  if(receipt.status!=="reviewed"||receipt.recommendationOnly!==true)
    throw new Error("Nonbinding review receipt could not be verified.");
  return receipt;
}
