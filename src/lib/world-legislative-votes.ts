import { supabase } from "@/integrations/supabase/client";

// TG8 legislative votes ONLY. #2031 is the sole server-side exact-rational
// tally, and #2039 is the frozen voting-rule owner. No browser tally,
 // direct ballot-table read/write, client-authored electorate or secret ballots.
const db = supabase as any;
type Json = Record<string, unknown>;
const object = (value: unknown): value is Json =>
  value !== null && typeof value === "object" && !Array.isArray(value);
export const voteUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const string = (value: unknown): value is string => typeof value === "string";
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number)>=0;
const textOrNull = (value: unknown): value is string | null => value===null || string(value);
const invalid = (name: string): never => { throw new Error("Invalid institutional vote " + name + " projection."); };
const outcomes = new Set(["passed","failed","no_quorum"]);
const statuses = new Set(["open","certified"]);
const ballotTypes = new Set(["recorded_roll_call","restricted_roll_call","aggregate_only"]);
export type WorldVoteListRow = {
  id: string; organizationSlug: string; measureId: string; measureTitle: string;
  outcome: "passed"|"failed"|"no_quorum"; ayeCount: number; nayCount: number;
  abstainCount: number; eligibleElectorate: number; resultHash: string; certifiedAt: string;
};
export type WorldVoteResult = WorldVoteListRow & {
  organName: string; measureIdentifier: string; measureVersionId: string;
  castBallots: number; quorumMet: boolean; thresholdMet: boolean;
  ruleKey: string; ruleRevision: string; quorumNumerator: string;
  quorumDenominator: string; thresholdKind: string;
  thresholdNumerator: string | null; thresholdDenominator: string | null;
  denominatorPolicy: string; rollCall: Array<{countryCode: string; choice: "aye"|"nay"|"abstain"}>;
};
export type MyVoteSeat = {
  countryId: string; countryCode: string; hasCast: boolean;
  myChoice: "aye"|"nay"|"abstain"|null; canCast: boolean;
};
export type MyWorldVote = {
  id: string; measureId: string; status: "open"|"certified"; revision: number;
  openedAt: string; closesAt: string; ballotType: string; ruleKey: string;
  quorumNumerator: string; quorumDenominator: string; thresholdKind: string;
  thresholdNumerator: string | null; thresholdDenominator: string | null;
  countries: MyVoteSeat[];
};
export type ManagedWorldVote = {
  id: string; organizationId: string; organId: string; measureId: string;
  ruleId: string; ruleKey: string; status: "open"|"certified"; revision: number;
  openedAt: string; closesAt: string; eligibleElectorate: number;
  certifiedAt: string|null; canCertify: boolean;
};
export type OpenableMeasure = {
  id: string; title: string; identifier: string; organizationId: string;
  organId: string; state: string; revision: number;
};
export type OpenableRule = {
  id: string; key: string; label: string; ballotType: string; ruleRevision: number;
};
export type VoteOrganization = { id: string; slug: string; shortName: string };
export type WorldVoteReceipt = {
  ok: true; voteId: string; operationId: string; revision: number;
  status: "open"|"cast"|"certified"; replayed: boolean;
  measureId?: string; resultHash?: string; outcome?: WorldVoteListRow["outcome"];
};

function hash(value: unknown): value is string {
  return string(value) && /^[a-f0-9]{64}$/.test(value);
}
const choice = (value: unknown): value is "aye"|"nay"|"abstain" =>
  value==="aye" || value==="nay" || value==="abstain";
const fraction = (value: unknown): value is string =>
  string(value) && /^\d{1,19}$/.test(value);
const optionalFraction = (value: unknown): value is string|null =>
  textOrNull(value) && (value===null || /^\d{1,19}$/.test(value));
function parseListRow(value: unknown): WorldVoteListRow {
  if (!object(value) || !voteUuid(value.id) || !string(value.organizationSlug) ||
      !voteUuid(value.measureId) || !string(value.measureTitle) ||
      !string(value.outcome) || !outcomes.has(value.outcome) ||
      !integer(value.ayeCount) || !integer(value.nayCount) ||
      !integer(value.abstainCount) || !integer(value.eligibleElectorate) ||
      !hash(value.resultHash) || !string(value.certifiedAt)) return invalid("published list");
  return value as unknown as WorldVoteListRow;
}
export function parseWorldVoteResult(value: unknown): WorldVoteResult|null {
  if (value===null) return null;
  if (!object(value) || !string(value.organName) || !string(value.measureIdentifier) ||
      !voteUuid(value.measureVersionId) || !integer(value.castBallots) ||
      typeof value.quorumMet!=="boolean" || typeof value.thresholdMet!=="boolean" ||
      !string(value.ruleKey) || !fraction(value.ruleRevision) ||
      !fraction(value.quorumNumerator) || !fraction(value.quorumDenominator) ||
      !string(value.thresholdKind) || !optionalFraction(value.thresholdNumerator) ||
      !optionalFraction(value.thresholdDenominator) ||
      value.denominatorPolicy!=="all_cast_including_abstentions" ||
      !Array.isArray(value.rollCall) || value.rollCall.length>200) return invalid("published detail");
  const rollCall = value.rollCall.map((seat: unknown) => {
    if (!object(seat) || !string(seat.countryCode) || !choice(seat.choice)) return invalid("roll call");
    return { countryCode: seat.countryCode, choice: seat.choice };
  });
  const row = parseListRow(value);
  if (row.ayeCount+row.nayCount+row.abstainCount !== value.castBallots ||
      value.castBallots > row.eligibleElectorate) return invalid("published tally");
  return { ...row, organName: value.organName, measureIdentifier: value.measureIdentifier,
    measureVersionId: value.measureVersionId, castBallots: value.castBallots,
    quorumMet: value.quorumMet, thresholdMet: value.thresholdMet,
    ruleKey: value.ruleKey, ruleRevision: value.ruleRevision!,
    quorumNumerator: value.quorumNumerator!, quorumDenominator: value.quorumDenominator!,
    thresholdKind: value.thresholdKind, thresholdNumerator: value.thresholdNumerator,
    thresholdDenominator: value.thresholdDenominator, denominatorPolicy: value.denominatorPolicy,
    rollCall };
}
export function parseMyWorldVote(value: unknown): MyWorldVote|null {
  if (value===null) return null;
  if (!object(value) || !voteUuid(value.id) || !voteUuid(value.measureId) ||
      !string(value.status) || !statuses.has(value.status) ||
      !integer(value.revision) || value.revision<1 ||
      !string(value.openedAt) || !string(value.closesAt) ||
      !string(value.ballotType) || !ballotTypes.has(value.ballotType) ||
      !string(value.ruleKey) || !fraction(value.quorumNumerator) ||
      !fraction(value.quorumDenominator) || !string(value.thresholdKind) ||
      !optionalFraction(value.thresholdNumerator) ||
      !optionalFraction(value.thresholdDenominator) ||
      !Array.isArray(value.countries) || value.countries.length>200) return invalid("own ballot");
  const countries = value.countries.map((seat: unknown): MyVoteSeat => {
    if (!object(seat) || !voteUuid(seat.countryId) || !string(seat.countryCode) ||
        typeof seat.hasCast!=="boolean" || typeof seat.canCast!=="boolean" ||
        !(seat.myChoice===null || choice(seat.myChoice)) ||
        (seat.hasCast !== (seat.myChoice!==null)) ||
        (seat.canCast && seat.hasCast)) return invalid("own country");
    return { countryId: seat.countryId, countryCode: seat.countryCode,
      hasCast: seat.hasCast, myChoice: seat.myChoice, canCast: seat.canCast };
  });
  return { id: value.id, measureId: value.measureId,
    status: value.status as MyWorldVote["status"], revision: value.revision,
    openedAt: value.openedAt, closesAt: value.closesAt,
    ballotType: value.ballotType, ruleKey: value.ruleKey,
    quorumNumerator: value.quorumNumerator!, quorumDenominator: value.quorumDenominator!,
    thresholdKind: value.thresholdKind, thresholdNumerator: value.thresholdNumerator,
    thresholdDenominator: value.thresholdDenominator, countries };
}
export function parseManagedWorldVote(value: unknown): ManagedWorldVote|null {
  if (value===null) return null;
  if (!object(value) || !voteUuid(value.id) || !voteUuid(value.organizationId) ||
      !voteUuid(value.organId) || !voteUuid(value.measureId) || !voteUuid(value.ruleId) ||
      !string(value.ruleKey) || !string(value.status) || !statuses.has(value.status) ||
      !integer(value.revision) || value.revision<1 ||
      !string(value.openedAt) || !string(value.closesAt) ||
      !integer(value.eligibleElectorate) || !textOrNull(value.certifiedAt) ||
      typeof value.canCertify!=="boolean") return invalid("certification manager");
  return value as unknown as ManagedWorldVote;
}
export function parseVoteReceipt(value: unknown, operationId: string): WorldVoteReceipt {
  // All TG8 commands return the canonical S2 reconcile envelope. Never
  // mistake the operation's succeeded status for the inner vote state.
  const envelope = object(value) ? value : null;
  const result = object(envelope?.result) ? envelope.result : null;
  if (!envelope || envelope.status!=="succeeded" ||
      envelope.operationId!==operationId || typeof envelope.replayed!=="boolean" ||
      !result || result.ok!==true || !voteUuid(result.voteId) ||
      result.operationId!==operationId || !integer(result.revision) ||
      result.revision<1 || !string(result.status) ||
      !["open","cast","certified"].includes(result.status) ||
      (result.measureId!==undefined && !voteUuid(result.measureId)) ||
      (result.resultHash!==undefined && !hash(result.resultHash)) ||
      (result.outcome!==undefined &&
        (!string(result.outcome) || !outcomes.has(result.outcome)))) {
    return invalid("operation receipt");
  }
  return { ok: true, voteId: result.voteId, operationId,
    revision: result.revision, status: result.status as WorldVoteReceipt["status"],
    replayed: envelope.replayed,
    ...(result.measureId ? {measureId: result.measureId} : {}),
    ...(result.resultHash ? {resultHash: result.resultHash} : {}),
    ...(result.outcome ? {outcome: result.outcome as WorldVoteListRow["outcome"]} : {}),
  };
}
async function rpc(name: string,args: Json): Promise<unknown> {
  const {data,error} = await db.rpc(name,args);
  if (error) throw error;
  return data;
}
export async function listPublishedWorldVotes(slug: string|null): Promise<WorldVoteListRow[]> {
  const data=await rpc("world_vote_public_list_v1",{p_organization_slug:slug,p_limit:30});
  if(!Array.isArray(data)||data.length>30)return invalid("directory");
  return data.map(parseListRow);
}
export async function getPublishedWorldVote(id: string): Promise<WorldVoteResult|null> {
  if(!voteUuid(id))return null;
  return parseWorldVoteResult(await rpc("world_vote_public_detail_v1",{p_vote_id:id}));
}
export async function getMyWorldVote(id: string): Promise<MyWorldVote|null> {
  if(!voteUuid(id))return null;
  return parseMyWorldVote(await rpc("world_vote_my_ballot_v1",{p_vote_id:id}));
}
export async function getManagedWorldVote(id: string): Promise<ManagedWorldVote|null> {
  if(!voteUuid(id))return null;
  return parseManagedWorldVote(await rpc("world_vote_manage_v1",{p_vote_id:id}));
}
export async function getOpenableMeasures(organizationId:string): Promise<OpenableMeasure[]> {
  if(!voteUuid(organizationId))return invalid("organization");
  const data=await rpc("world_vote_openable_measures_v1",{p_organization_id:organizationId});
  if(!Array.isArray(data)||data.length>50)return invalid("measure options");
  return data.map((row:unknown) => {
    if(!object(row)||!voteUuid(row.id)||!string(row.title)||
       !string(row.identifier)||!voteUuid(row.organizationId)||!voteUuid(row.organId)||
       !string(row.state)||!integer(row.revision)||row.revision<1) return invalid("measure option");
    return row as unknown as OpenableMeasure;
  });
}
export async function getOpenableRules(organizationId:string,organId:string):Promise<OpenableRule[]> {
  if(!voteUuid(organizationId)||!voteUuid(organId))return invalid("organ");
  const data=await rpc("world_vote_openable_rules_v1",
    {p_organization_id:organizationId,p_organ_id:organId});
  if(!Array.isArray(data)||data.length>30)return invalid("rule options");
  return data.map((row:unknown) => {
    if(!object(row)||!voteUuid(row.id)||!string(row.key)||!string(row.label)||
        !string(row.ballotType)||!ballotTypes.has(row.ballotType)||
        !integer(row.ruleRevision)||row.ruleRevision<1)return invalid("rule option");
    return row as unknown as OpenableRule;
  });
}
export async function listWorldVoteOrganizations():Promise<VoteOrganization[]> {
  const {data,error}=await db.from("world_organizations")
    .select("id,slug,short_name").eq("public_visibility","public").eq("status","active")
    .order("short_name").limit(100);
  if(error)throw error;
  if(!Array.isArray(data)||data.length>100)return invalid("organization options");
  return data.map((row:unknown) => {
    if(!object(row)||!voteUuid(row.id)||!string(row.slug)||!string(row.short_name)) {
      return invalid("organization option");
    }
    return {id:row.id,slug:row.slug,shortName:row.short_name};
  });
}
export async function openWorldVote(input:{
  measureId:string;expectedMeasureRevision:number;ruleId:string;
  closesAt:string;operationId:string;
}):Promise<WorldVoteReceipt> {
  if(!voteUuid(input.measureId)||!integer(input.expectedMeasureRevision)||
     input.expectedMeasureRevision<1||!voteUuid(input.ruleId)||!voteUuid(input.operationId)||
     !Number.isFinite(Date.parse(input.closesAt))) throw new Error("Invalid vote opening scope or close date.");
  // An exact operation retry must reach the server even after close time.
  // Fresh vote-open window validation stays in the canonical command.
  const data=await rpc("world_open_vote_v1",{
    p_measure_id:input.measureId,p_expected_measure_revision:input.expectedMeasureRevision,
    p_rule_id:input.ruleId,p_closes_at:input.closesAt,p_operation_id:input.operationId,
    p_idempotency_key:"world.vote.open:"+input.operationId,
  });
  return parseVoteReceipt(data,input.operationId);
}
export async function castWorldBallot(input:{
  voteId:string;countryId:string;expectedVoteRevision:number;
  choice:"aye"|"nay"|"abstain";operationId:string;
}):Promise<WorldVoteReceipt> {
  if(!voteUuid(input.voteId)||!voteUuid(input.countryId)||!integer(input.expectedVoteRevision)||
    input.expectedVoteRevision<1||!choice(input.choice)||!voteUuid(input.operationId)) {
    throw new Error("Invalid ballot scope or choice.");
  }
  const data=await rpc("world_cast_ballot_v1",{
    p_vote_id:input.voteId,p_country_id:input.countryId,
    p_expected_vote_revision:input.expectedVoteRevision,
    p_choice:input.choice,p_operation_id:input.operationId,
    p_idempotency_key:"world.vote.ballot_cast:"+input.operationId,
  });
  return parseVoteReceipt(data,input.operationId);
}
export async function certifyWorldVote(input:{
  voteId:string;expectedVoteRevision:number;operationId:string;
}):Promise<WorldVoteReceipt> {
  if(!voteUuid(input.voteId)||!integer(input.expectedVoteRevision)||
      input.expectedVoteRevision<1||!voteUuid(input.operationId)) {
    throw new Error("Invalid certification scope or version.");
  }
  const data=await rpc("world_certify_vote_v1",{
    p_vote_id:input.voteId,p_expected_vote_revision:input.expectedVoteRevision,
    p_operation_id:input.operationId,
    p_idempotency_key:"world.vote.certify:"+input.operationId,
  });
  return parseVoteReceipt(data,input.operationId);
}
