import { supabase } from "@/integrations/supabase/client";

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const text=(v:unknown):v is string=>typeof v==="string";
const positive=(v:unknown):v is number=>typeof v==="number"&&Number.isSafeInteger(v)&&v>0;
const timestamp=(v:unknown):v is string=>text(v)&&Number.isFinite(Date.parse(v));
export type DomesticProcess="democratic"|"monarchical"|"decree";
export type DomesticMeasureStatus=
  "draft"|"introduced"|"debated"|"adopted"|"rejected"|"proposed"|"council"|
  "assented"|"vetoed"|"issued"|"enacted"|"withdrawn";
export const DOMESTIC_TRANSITIONS:Record<DomesticProcess,Partial<Record<DomesticMeasureStatus,readonly DomesticMeasureStatus[]>>>={
  democratic:{draft:["introduced"],introduced:["debated","rejected","withdrawn"],
    debated:["adopted","rejected","withdrawn"],adopted:["enacted"]},
  monarchical:{draft:["proposed"],proposed:["council","vetoed","withdrawn"],
    council:["assented","vetoed"],assented:["enacted"]},
  decree:{draft:["issued"],issued:["enacted"]},
};
export type DomesticMeasure={
  id:string;title:string;processKind:DomesticProcess;status:DomesticMeasureStatus;
  published:boolean;revision:number;currentVersion:number;
};
export type DomesticLaw={
  id:string;measureId:string;title:string;status:"in_force"|"repealed";
  enactmentMethod:DomesticProcess;enactedAt:string;repealedAt:string|null;
};
export type DomesticLawOverview={
  countryId:string;countryCode:string;isController:boolean;
  measures:DomesticMeasure[];laws:DomesticLaw[];
};
export type DomesticMeasureDetail=DomesticMeasure&{
  countryId:string;body:string;
  versionHistory:{number:number;createdAt:string;title:string}[];
};
export type DomesticMeasureAction="create"|"revise"|"advance"|"repeal";
export type DomesticMeasureWrite={
  countryId:string;action:DomesticMeasureAction;measureId:string|null;
  payload:Record<string,string|boolean|number|null>;
  expectedRevision:number;operationId:string;idempotencyKey:string;
};

function parseMeasure(v:unknown):DomesticMeasure{
  if(!record(v)||!uuid.test(String(v.id))||!text(v.title)||
    !["democratic","monarchical","decree"].includes(String(v.processKind))||
    !["draft","introduced","debated","adopted","rejected","proposed","council",
      "assented","vetoed","issued","enacted","withdrawn"].includes(String(v.status))||
    typeof v.published!=="boolean"||!positive(v.revision)||!positive(v.currentVersion))
    throw new Error("Invalid domestic measure response");
  return{id:v.id as string,title:v.title,processKind:v.processKind as DomesticProcess,
    status:v.status as DomesticMeasureStatus,published:v.published,
    revision:v.revision,currentVersion:v.currentVersion};
}
export function parseDomesticLaws(v:unknown,code:string):DomesticLawOverview|null{
  if(v==null)return null;
  if(!record(v)||!uuid.test(String(v.countryId))||!text(v.countryCode)||
    v.countryCode.toLowerCase()!==code.toLowerCase()||
    typeof v.isController!=="boolean"||
    !Array.isArray(v.measures)||v.measures.length>30||
    !Array.isArray(v.laws)||v.laws.length>30)throw new Error("Invalid legislation overview");
  const laws=v.laws.map((l):DomesticLaw=>{
    if(!record(l)||!uuid.test(String(l.id))||!uuid.test(String(l.measureId))||
      !text(l.title)||!["in_force","repealed"].includes(String(l.status))||
      !["democratic","monarchical","decree"].includes(String(l.enactmentMethod))||
      !timestamp(l.enactedAt)||!(l.repealedAt===null||timestamp(l.repealedAt)))
      throw new Error("Invalid domestic law response");
    return{id:l.id as string,measureId:l.measureId as string,title:l.title,
      status:l.status as DomesticLaw["status"],enactmentMethod:l.enactmentMethod as DomesticProcess,
      enactedAt:l.enactedAt,repealedAt:l.repealedAt};
  });
  return{countryId:v.countryId as string,countryCode:v.countryCode,
    isController:v.isController,measures:v.measures.map(parseMeasure),laws};
}
export function parseDomesticMeasureDetail(v:unknown,requestedId:string):DomesticMeasureDetail|null{
  if(v==null)return null;
  if(!record(v)||String(v.id)!==requestedId||!uuid.test(String(v.countryId))||
    !text(v.body)||v.body.length>15000||
    !Array.isArray(v.versionHistory)||v.versionHistory.length>20)
    throw new Error("Invalid domestic law detail");
  const versions=v.versionHistory.map(x=>{
    if(!record(x)||!positive(x.number)||!timestamp(x.createdAt)||!text(x.title))
      throw new Error("Invalid domestic version metadata");
    return{number:x.number as number,createdAt:x.createdAt as string,title:x.title as string};
  });
  return{...parseMeasure(v),countryId:v.countryId as string,body:v.body,versionHistory:versions};
}
export async function readDomesticLaws(code:string,signal?:AbortSignal):Promise<DomesticLawOverview|null>{
  if(!/^[a-z0-9-]{2,12}$/i.test(code))throw new Error("Invalid country code");
  if(signal?.aborted)throw new Error("Request cancelled");
  const req=(supabase as any).rpc("world_domestic_laws_v1",{p_country_code:code});
  const {data,error}=await(signal?req.abortSignal(signal):req);
  if(error)throw new Error("Domestic laws could not be verified");
  return parseDomesticLaws(data,code);
}
export async function readDomesticMeasureDetail(id:string,signal?:AbortSignal):Promise<DomesticMeasureDetail|null>{
  if(!uuid.test(id))throw new Error("Invalid law identity");
  if(signal?.aborted)throw new Error("Request cancelled");
  const req=(supabase as any).rpc("world_domestic_measure_detail_v1",{p_measure_id:id});
  const {data,error}=await(signal?req.abortSignal(signal):req);
  if(error)throw new Error("Domestic measure could not be retrieved");
  return parseDomesticMeasureDetail(data,id);
}
export async function writeDomesticMeasure(x:DomesticMeasureWrite){
  if(!uuid.test(x.countryId)||!uuid.test(x.operationId)||
    (x.measureId!==null&&!uuid.test(x.measureId))||
    !Number.isSafeInteger(x.expectedRevision)||x.expectedRevision<0||
    x.idempotencyKey.length<8||x.idempotencyKey.length>200||
    !["create","revise","advance","repeal"].includes(x.action))
    throw new Error("Invalid domestic legislative operation");
  const {data,error}=await(supabase as any).rpc("world_write_domestic_measure_v1",{
    p_country_id:x.countryId,p_action:x.action,p_measure_id:x.measureId,
    p_payload:x.payload,p_expected_revision:x.expectedRevision,
    p_operation_id:x.operationId,p_idempotency_key:x.idempotencyKey,
  });
  if(error){
    if(error.code==="40001"||String(error.message).includes("VERSION_CONFLICT"))
      throw new Error("This measure changed. Reload its latest revision before proceeding.");
    if(error.code==="42501")throw new Error("Domestic legislation is unavailable or country control changed.");
    throw new Error(error.message||"The domestic legislative operation failed");
  }
  // S2 reconcile returns a status envelope. An HTTP 200 or nested ok alone
  // must not claim success for processing, failed, or mismatched operations.
  if(!record(data)||data.status!=="succeeded"||data.error!==null||
    data.operationId!==x.operationId||!record(data.result))
    throw new Error("Missing authoritative legislative operation receipt");
  const result=data.result;
  if(result.ok!==true||!uuid.test(String(result.id))||
     result.operationId!==x.operationId||!positive(result.revision)||
     result.action!==x.action)
    throw new Error("Missing authoritative legislative operation receipt");
  return{id:result.id as string,revision:result.revision as number,operationId:x.operationId};
}
