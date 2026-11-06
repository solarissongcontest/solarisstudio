import { supabase } from "@/integrations/supabase/client";
import { assertTg13CurrentActor } from "@/lib/world-tg13-private-session";
import { parseEthicsCase, type EthicsCase } from "@/lib/world-ethics";

export const ETHICS_RECOMMENDATIONS = [
  "none","warning","censure","voting_suspension",
  "assistance_freeze","court_referral","other",
] as const;

export type EthicsRecommendation = typeof ETHICS_RECOMMENDATIONS[number];
export type EthicsFinding = {
  id: string; caseId: string;
  findings: string; reasoning: string;
  recommendation: EthicsRecommendation;
  recommendationText: string | null;
  preparedAt: string; caseRevision: number;
  evidenceCount: number;
};
export type EthicsFindingsWorkspace = {
  record: EthicsCase | null;
  finding: EthicsFinding | null;
  canPrepare: boolean;
};
export type EthicsFindingsOperation = { operationId: string; key: string };

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const object=(x:unknown):x is Record<string,unknown>=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const required=(x:unknown):string=>{
  if(typeof x!=="string"||!x.trim())throw new Error("The Ethics finding is incomplete.");
  return x;
};
const id=(x:unknown):string=>{
  const value=required(x);
  if(!UUID.test(value))throw new Error("The Ethics identifier is invalid.");
  return value;
};
const int=(x:unknown,min=1):number=>{
  if(typeof x!=="number"||!Number.isSafeInteger(x)||x<min)
    throw new Error("The Ethics finding revision is invalid.");
  return x;
};
const check=(error:{message:string}|null)=>{if(error)throw error;};

export function parseEthicsFinding(row:unknown):EthicsFinding{
  if(!object(row))throw new Error("The Ethics finding cannot be verified.");
  if(typeof row.recommendation_kind!=="string"
    ||!(ETHICS_RECOMMENDATIONS as readonly string[]).includes(row.recommendation_kind)){
    throw new Error("Unknown Ethics recommendation.");
  }
  const recommendation=row.recommendation_kind as EthicsRecommendation;
  const recommendationText=row.recommendation_text;
  if((recommendation==="none"&&recommendationText!==null)
    ||(recommendation!=="none"&&(typeof recommendationText!=="string"||!recommendationText.trim()))){
    throw new Error("An Ethics recommendation must include its meaning.");
  }
  return {
    id:id(row.id),caseId:id(row.case_id),
    findings:required(row.findings_text),reasoning:required(row.reasoning_text),
    recommendation,recommendationText:recommendationText as string|null,
    preparedAt:required(row.prepared_at),
    caseRevision:int(row.case_revision),
    evidenceCount:int(row.evidence_count,0),
  };
}

export function canSubmitEthicsFinding(
  workspace:EthicsFindingsWorkspace,
):boolean{
  return workspace.canPrepare
    && !!workspace.record
    && ["assigned","under_review"].includes(workspace.record.state)
    && workspace.finding===null;
}

/** Private TG13 read. The authenticated user must remain the same during the
 * entire sequence, not only when it begins. RLS remains the real authority. */
export async function fetchEthicsFindingsWorkspace(
  caseId:string,expectedActorId:string,
):Promise<EthicsFindingsWorkspace>{
  await assertTg13CurrentActor(expectedActorId);
  const db=supabase as any;
  const recordResult=await db.from("world_ethics_cases")
    .select("id,organization_id,organ_id,reporting_country_id,subject_country_id,subject_person_id,allegation,status,revision,opened_at")
    .eq("id",id(caseId)).maybeSingle();
  check(recordResult.error);
  if(!recordResult.data){
    await assertTg13CurrentActor(expectedActorId);
    return {record:null,finding:null,canPrepare:false};
  }
  const [findingResult,capabilityResult]=await Promise.all([
    db.from("world_ethics_findings")
      .select("id,case_id,findings_text,reasoning_text,recommendation_kind,recommendation_text,prepared_at,case_revision,evidence_count")
      .eq("case_id",id(caseId)).maybeSingle(),
    db.rpc("world_ethics_can_prepare_findings_v1",{p_case_id:id(caseId)}),
  ]);
  check(findingResult.error);
  check(capabilityResult.error);
  const record=parseEthicsCase(recordResult.data);
  const finding=findingResult.data?parseEthicsFinding(findingResult.data):null;
  await assertTg13CurrentActor(expectedActorId);
  return {record,finding,canPrepare:capabilityResult.data===true};
}

export function verifyEthicsFindingReceipt(input:unknown,operationId:string):{
  caseId:string;findingId:string;revision:number;state:"findings_prepared";
}{
  const envelope=object(input)?input:null;
  const result=object(envelope?.result)?envelope.result:null;
  if(envelope?.status!=="succeeded"||envelope.operationId!==operationId
    ||result?.ok!==true||result.operationId!==operationId
    ||result.state!=="findings_prepared"){
    throw new Error("An official Ethics finding was not acknowledged by a matching receipt.");
  }
  return {
    caseId:id(result.caseId),findingId:id(result.findingId),
    revision:int(result.revision),state:"findings_prepared",
  };
}

export async function prepareEthicsFinding(input:{
  caseId:string;findings:string;reasoning:string;
  recommendation:EthicsRecommendation;recommendationText:string|null;
  expectedRevision:number;
},op:EthicsFindingsOperation){
  const db=supabase as any;
  const {data,error}=await db.rpc("world_prepare_ethics_findings_v1",{
    p_case_id:id(input.caseId),
    p_findings:input.findings.trim(),
    p_reasoning:input.reasoning.trim(),
    p_recommendation_kind:input.recommendation,
    p_recommendation_text:input.recommendationText?.trim()||null,
    p_expected_revision:int(input.expectedRevision),
    p_operation_id:id(op.operationId),
    p_idempotency_key:required(op.key),
  });
  check(error);
  return verifyEthicsFindingReceipt(data,op.operationId);
}
