import { supabase } from "@/integrations/supabase/client";

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const obj=(v:unknown):v is Record<string,unknown> => !!v&&typeof v==="object"&&!Array.isArray(v);
const str=(v:unknown):v is string=>typeof v==="string";
const opt=(v:unknown):v is string|null=>v===null||str(v);
const rev=(v:unknown):v is number=>typeof v==="number"&&Number.isSafeInteger(v)&&v>0;

export type WorldLorePerson={
  id:string;displayName:string;nativeName:string|null;
  biography:string|null;publicSummary:string|null;
  status:"active"|"deceased"|"historical"|"unknown";
  bornOn:string|null;diedOn:string|null;
  published:boolean;revision:number;
};
export type WorldDomesticOffice={id:string;title:string;officeType:string;description:string|null;published:boolean;revision:number};
export type WorldDomesticOfficeTerm={
  id:string;officeId:string;holderPersonId:string;
  officeTitle:string;holderDisplayName:string;
  startedAt:string;endedAt:string|null;
  status:"active"|"ended"|"resigned"|"removed";
  published:boolean;revision:number;
};
export type WorldDomesticOfficials={
  countryId:string;countryCode:string;isController:boolean;
  people:WorldLorePerson[];offices:WorldDomesticOffice[];terms:WorldDomesticOfficeTerm[];
};
export type OfficialMutationKind="lore_person"|"office"|"term_start"|"term_end"|"term_publish";
export type OfficialMutation={
  countryId:string;kind:OfficialMutationKind;subjectId:string|null;
  payload:Record<string,string|boolean|number|null>;
  expectedRevision:number;operationId:string;idempotencyKey:string;
};
const iso=(v:unknown):v is string=>str(v)&&Number.isFinite(Date.parse(v));
const date=(v:unknown):v is string|null=>v===null||
  (str(v)&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v)));

export function parseWorldDomesticOfficials(v:unknown,code:string):WorldDomesticOfficials|null{
  if(v==null)return null;
  if(!obj(v)||!uuid.test(String(v.countryId))||!str(v.countryCode)||
    v.countryCode.toLowerCase()!==code.toLowerCase()||typeof v.isController!=="boolean"||
    !Array.isArray(v.people)||!Array.isArray(v.offices)||!Array.isArray(v.terms)||
    v.people.length>100||v.offices.length>50||v.terms.length>500)
    throw new Error("Invalid World officials projection");
  const people=v.people.map((p):WorldLorePerson=>{
    if(!obj(p)||!uuid.test(String(p.id))||!str(p.displayName)||
      !opt(p.nativeName)||!opt(p.biography)||!opt(p.publicSummary)||
      !["active","deceased","historical","unknown"].includes(String(p.status))||
      !date(p.bornOn)||!date(p.diedOn)||
      typeof p.published!=="boolean"||!rev(p.revision))
      throw new Error("Invalid fictional person projection");
    return{id:p.id as string,displayName:p.displayName,nativeName:p.nativeName,
      biography:p.biography,publicSummary:p.publicSummary,
      status:p.status as WorldLorePerson["status"],
      bornOn:p.bornOn,diedOn:p.diedOn,
      published:p.published,revision:p.revision};
  });
  const offices=v.offices.map((o):WorldDomesticOffice=>{
    if(!obj(o)||!uuid.test(String(o.id))||!str(o.title)||!str(o.officeType)||
      !opt(o.description)||typeof o.published!=="boolean"||!rev(o.revision))
      throw new Error("Invalid domestic office projection");
    return{id:o.id as string,title:o.title,officeType:o.officeType,
      description:o.description,published:o.published,revision:o.revision};
  });
  const terms=v.terms.map((t):WorldDomesticOfficeTerm=>{
    if(!obj(t)||!uuid.test(String(t.id))||!uuid.test(String(t.officeId))||
      !uuid.test(String(t.holderPersonId))||!str(t.officeTitle)||
      !str(t.holderDisplayName)||!iso(t.startedAt)||!(t.endedAt===null||iso(t.endedAt))||
      !["active","ended","resigned","removed"].includes(String(t.status))||
      typeof t.published!=="boolean"||!rev(t.revision))
      throw new Error("Invalid domestic office term projection");
    return{id:t.id as string,officeId:t.officeId as string,holderPersonId:t.holderPersonId as string,
      officeTitle:t.officeTitle,holderDisplayName:t.holderDisplayName,
      startedAt:t.startedAt,endedAt:t.endedAt,
      status:t.status as WorldDomesticOfficeTerm["status"],published:t.published,revision:t.revision};
  });
  return{countryId:v.countryId as string,countryCode:v.countryCode,
    isController:v.isController,people,offices,terms};
}
export async function readWorldDomesticOfficials(code:string,signal?:AbortSignal){
  if(!/^[a-z0-9-]{2,12}$/i.test(code))throw new Error("Invalid country code");
  if(signal?.aborted)throw new Error("Request cancelled");
  const req=(supabase as any).rpc("world_domestic_officials_v1",{p_country_code:code});
  const {data,error}=await(signal?req.abortSignal(signal):req);
  if(error)throw new Error("Office history could not be verified");
  return parseWorldDomesticOfficials(data,code);
}
export async function writeWorldDomesticOfficial(x:OfficialMutation){
  if(!uuid.test(x.countryId)||!uuid.test(x.operationId)||
     (x.subjectId!==null&&!uuid.test(x.subjectId))||
     !Number.isSafeInteger(x.expectedRevision)||x.expectedRevision<0||
     x.idempotencyKey.length<8||x.idempotencyKey.length>200||
     !["lore_person","office","term_start","term_end","term_publish"].includes(x.kind))
    throw new Error("Invalid office history command");
  const {data,error}=await(supabase as any).rpc("world_write_domestic_official_v1",{
    p_country_id:x.countryId,p_kind:x.kind,p_subject_id:x.subjectId,
    p_payload:x.payload,p_expected_revision:x.expectedRevision,
    p_operation_id:x.operationId,p_idempotency_key:x.idempotencyKey,
  });
  if(error){
    if(error.code==="40001"||String(error.message).includes("VERSION_CONFLICT"))
      throw new Error("The record changed elsewhere. Reload before retrying.");
    if(error.code==="42501")throw new Error("Country control permission has changed.");
    throw new Error(error.message||"Cannot save office history");
  }
  // S2 command RPCs return the canonical reconcile envelope, not the inner result.
  if(!obj(data)||data.status!=="succeeded"||data.error!==null||
    data.operationId!==x.operationId||!obj(data.result))
    throw new Error("Missing authoritative office operation receipt");
  const result=data.result;
  if(result.ok!==true||!uuid.test(String(result.id))||
    result.operationId!==x.operationId||!rev(result.revision)||result.kind!==x.kind)
    throw new Error("Missing authoritative office operation receipt");
  return{id:result.id as string,operationId:x.operationId,revision:result.revision as number};
}
