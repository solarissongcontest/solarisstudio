import { supabase } from "@/integrations/supabase/client";
import { parseCourtCase, type CourtCase } from "./world-court-filing";

type JsonRecord = Record<string, unknown>;
const object = (input: unknown): input is JsonRecord => input !== null && typeof input === "object" && !Array.isArray(input);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const readText = (input: unknown): string => {
  if (typeof input !== "string" || !input.trim()) throw new Error("The Court record is incomplete.");
  return input;
};
const readId = (input: unknown): string => {
  const id = readText(input);
  if (!UUID.test(id)) throw new Error("An official Court identifier could not be verified.");
  return id;
};
const readRevision = (input: unknown): number => {
  if (typeof input !== "number" || !Number.isSafeInteger(input) || input < 1) {
    throw new Error("The Court revision could not be verified.");
  }
  return input;
};
const readDate = (input: unknown): string => readText(input);
const check = (error: { message: string } | null) => { if (error) throw error; };

export type CourtJudgment = {
  id: string;
  caseId: string;
  judgmentNumber: number;
  kind: "original" | "revised";
  findings: string; reasoning: string; orders: string; remedies: string;
  publishedAt: string; publiclyListed: boolean;
};
export type CourtReconsideration = {
  id: string; caseId: string; judgmentId: string; partyCountryId: string;
  grounds: string; filedAt: string;
  decision: "accepted" | "rejected" | null;
  decisionReason: string | null;
};
export type CourtProceedingAction = {
  id: string; fromState: string; toState: string;
  reason: string; caseRevision: number; recordedAt: string;
};
export type CourtJudgmentWorkspace = {
  authorizedCase: CourtCase | null;
  judgments: CourtJudgment[];
  requests: CourtReconsideration[];
  proceedings: CourtProceedingAction[];
  countryId: string | null;
  canJudge: boolean; canManage: boolean;
};
export type CourtJudgmentOperation = { operationId: string; key: string };
export type CourtAdvanceState =
  | "preliminary_review" | "response_pending" | "proceedings" | "hearing"
  | "judgment_pending" | "closed" | "archived";

export const COURT_ALLOWED_ADVANCES: Readonly<Record<CourtCase["status"], readonly CourtAdvanceState[]>> = {
  filed: ["preliminary_review"],
  preliminary_review: ["response_pending", "proceedings"],
  response_pending: ["proceedings"],
  proceedings: ["hearing", "judgment_pending"],
  hearing: ["proceedings", "judgment_pending"],
  judgment_pending: ["proceedings"],
  decided: ["closed"],
  reconsideration_requested: [],
  reconsideration: [],
  closed: ["archived"],
  archived: [],
};

export function parseCourtJudgment(input: unknown, isPublic = false): CourtJudgment {
  if (!object(input)) throw new Error("The published judgment could not be verified.");
  const kind = input.kind;
  if (kind !== "original" && kind !== "revised") throw new Error("Unknown Court judgment version.");
  const number = input.judgment_number ?? input.judgmentNumber;
  if (typeof number !== "number" || !Number.isSafeInteger(number) || number < 1) {
    throw new Error("Invalid Court judgment number.");
  }
  const publiclyListed = input.publicly_listed ?? (isPublic ? true : false);
  if (typeof publiclyListed !== "boolean") throw new Error("Invalid judgment publication state.");
  return {
    id: readId(input.id),
    caseId: readId(input.case_id ?? input.caseId),
    judgmentNumber: number,
    kind,
    findings: readText(input.findings),
    reasoning: readText(input.reasoning),
    orders: readText(input.orders),
    remedies: readText(input.remedies),
    publishedAt: readDate(input.published_at ?? input.publishedAt),
    publiclyListed,
  };
}

export function parseCourtReconsideration(
  input: unknown,
  decisions: ReadonlyMap<string, { decision: "accepted" | "rejected"; reason: string }>,
): CourtReconsideration {
  if (!object(input)) throw new Error("Invalid reconsideration request.");
  const id = readId(input.id);
  const decision = decisions.get(id);
  return {
    id, caseId: readId(input.case_id), judgmentId: readId(input.judgment_id),
    partyCountryId: readId(input.party_country_id),
    grounds: readText(input.grounds), filedAt: readDate(input.filed_at),
    decision: decision?.decision ?? null, decisionReason: decision?.reason ?? null,
  };
}

export function parseCourtProceeding(input: unknown): CourtProceedingAction {
  if (!object(input)) throw new Error("Invalid Court proceeding.");
  return {
    id: readId(input.id), fromState: readText(input.from_state),
    toState: readText(input.to_state), reason: readText(input.reason),
    caseRevision: readRevision(input.case_revision),
    recordedAt: readDate(input.recorded_at),
  };
}

export function mayRequestCourtReconsideration(
  record: CourtCase | null, newest: CourtJudgment | undefined,
  viewerCountry: string | null, requests: readonly CourtReconsideration[],
): boolean {
  return !!record && !!newest && !!viewerCountry
    && (record.status === "decided" || record.status === "reconsideration_requested"
      || record.status === "reconsideration")
    && (viewerCountry === record.applicantCountryId || viewerCountry === record.respondentCountryId)
    && !requests.some((request) => request.judgmentId === newest.id && request.partyCountryId === viewerCountry);
}

export function verifyCourtJudgmentReceipt(input: unknown, expectedOperationId: string): {
  caseId: string; revision: number; status: CourtCase["status"];
} {
  const receipt = object(input) ? input : null;
  const result = object(receipt?.result) ? receipt.result : null;
  if (receipt?.status !== "succeeded" || receipt.operationId !== expectedOperationId
    || result?.ok !== true || result.operationId !== expectedOperationId) {
    throw new Error("Official Court operation lacks a matching durable receipt.");
  }
  const status = result.status;
  const allowed = new Set([
    "filed", "preliminary_review", "response_pending", "proceedings",
    "hearing", "judgment_pending", "decided", "reconsideration_requested",
    "reconsideration", "closed", "archived",
  ]);
  if (typeof status !== "string" || !allowed.has(status)) throw new Error("Invalid Court outcome status.");
  return { caseId: readId(result.caseId), revision: readRevision(result.revision),
    status: status as CourtCase["status"] };
}

export async function fetchCourtJudgmentWorkspace(caseId: string): Promise<CourtJudgmentWorkspace> {
  const id = readId(caseId);
  const db = supabase as any;
  // Anonymous readers get only the individually published official projection.
  const publicResult = await db.rpc("world_court_public_judgments_v1", { p_case_id: id });
  check(publicResult.error);
  if (!Array.isArray(publicResult.data)) throw new Error("Official judgment publication cannot be verified.");
  const published = publicResult.data.map((value: unknown) => parseCourtJudgment(value, true));
  const { data: auth, error: authError } = await supabase.auth.getUser();
  check(authError);
  if (!auth.user) {
    return { authorizedCase: null, judgments: published, requests: [],
      proceedings: [], countryId: null, canJudge: false, canManage: false };
  }

  const [caseResult, account] = await Promise.all([
    db.from("world_court_cases")
      .select("id,identifier,organization_id,applicant_country_id,respondent_country_id,claim,legal_basis,requested_remedy,status,revision,filed_at,updated_at")
      .eq("id", id).maybeSingle(),
    db.from("country_accounts").select("country_id")
      .eq("user_id", auth.user.id).eq("status", "active").maybeSingle(),
  ]);
  check(caseResult.error); check(account.error);
  if (!caseResult.data) {
    return { authorizedCase: null, judgments: published, requests: [],
      proceedings: [], countryId: null, canJudge: false, canManage: false };
  }
  const record = parseCourtCase(caseResult.data);
  const [judgments, requests, decisions, proceedings, authority, judge] = await Promise.all([
    db.from("world_court_judgments")
      .select("id,case_id,judgment_number,kind,findings,reasoning,orders,remedies,published_at,publicly_listed")
      .eq("case_id",id).order("judgment_number",{ascending:true}).limit(50),
    db.from("world_court_reconsiderations")
      .select("id,case_id,judgment_id,party_country_id,grounds,filed_at")
      .eq("case_id",id).order("filed_at",{ascending:true}).limit(100),
    db.from("world_court_reconsideration_decisions")
      .select("request_id,decision,reason").eq("case_id",id).limit(100),
    db.from("world_court_proceeding_actions")
      .select("id,from_state,to_state,reason,case_revision,recorded_at")
      .eq("case_id",id).order("case_revision",{ascending:true}).limit(100),
    db.rpc("world_access_allowed", {
      p_capability:"world.court.manage",p_organization_id:record.organizationId,
      p_country_id:null,p_organ_id:null,p_object_type:"court",p_object_id:id,
    }),
    db.rpc("world_court_judge_eligible_v1",{p_case_id:id}),
  ]);
  for (const value of [judgments,requests,decisions,proceedings,authority,judge]) check(value.error);
  const decisionMap = new Map<string,{decision:"accepted"|"rejected";reason:string}>();
  for (const value of decisions.data ?? []) {
    if (value.decision !== "accepted" && value.decision !== "rejected") {
      throw new Error("An invalid reconsideration decision was returned.");
    }
    decisionMap.set(readId(value.request_id),{decision:value.decision,reason:readText(value.reason)});
  }
  return {
    authorizedCase: record,
    judgments:(judgments.data ?? []).map((value:unknown)=>parseCourtJudgment(value)),
    requests:(requests.data ?? []).map((value:unknown)=>parseCourtReconsideration(value,decisionMap)),
    proceedings:(proceedings.data ?? []).map(parseCourtProceeding),
    countryId:account.data?.country_id ? readId(account.data.country_id) : null,
    canManage:authority.data === true,
    canJudge:judge.data === true,
  };
}

type MutateArgs = { op: CourtJudgmentOperation };
async function governedCall(name:string,args:Record<string,unknown>,op:CourtJudgmentOperation) {
  const { data,error } = await (supabase as any).rpc(name,{
    ...args,p_operation_id:readId(op.operationId),p_idempotency_key:readText(op.key),
  });
  check(error);
  return verifyCourtJudgmentReceipt(data,op.operationId);
}

export async function advanceCourtCase(input:{
  caseId:string;target:CourtAdvanceState;reason:string;expectedRevision:number;
} & MutateArgs) {
  return governedCall("world_advance_court_case_v1",{
    p_case_id:readId(input.caseId),p_target_state:input.target,
    p_reason:input.reason.trim(),p_expected_revision:input.expectedRevision,
  },input.op);
}

export async function publishCourtJudgment(input:{
  caseId:string;findings:string;reasoning:string;orders:string;remedies:string;
  publiclyListed:boolean;expectedRevision:number;
} & MutateArgs) {
  return governedCall("world_issue_court_judgment_v1",{
    p_case_id:readId(input.caseId),
    p_findings:input.findings.trim(),p_reasoning:input.reasoning.trim(),
    p_orders:input.orders.trim(),p_remedies:input.remedies.trim(),
    p_publicly_listed:input.publiclyListed,p_expected_revision:input.expectedRevision,
  },input.op);
}

export async function requestCourtReconsideration(input:{
  caseId:string;judgmentId:string;grounds:string;expectedRevision:number;
} & MutateArgs) {
  return governedCall("world_request_court_reconsideration_v1",{
    p_case_id:readId(input.caseId),p_judgment_id:readId(input.judgmentId),
    p_grounds:input.grounds.trim(),p_expected_revision:input.expectedRevision,
  },input.op);
}

export async function decideCourtReconsideration(input:{
  requestId:string;decision:"accepted"|"rejected";reason:string;expectedRevision:number;
} & MutateArgs) {
  return governedCall("world_decide_court_reconsideration_v1",{
    p_request_id:readId(input.requestId),p_decision:input.decision,
    p_reason:input.reason.trim(),p_expected_revision:input.expectedRevision,
  },input.op);
}
