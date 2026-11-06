import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { CourtCase } from "./world-court-filing";
import {
  COURT_ALLOWED_ADVANCES,
  mayRequestCourtReconsideration,
  parseCourtJudgment,
  parseCourtReconsideration,
  verifyCourtJudgmentReceipt,
} from "./world-court-judgments";

const read = (path:string)=>readFileSync(resolve(process.cwd(),path),"utf8");
const sql = ()=>read("supabase/migrations/20261107005100_v3_tg14_court_judgments_reconsideration.sql");
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const anotherId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const thirdId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const original = {
  id,case_id:id,judgment_number:1,kind:"original",
  findings:"Court finds that both countries participated.",
  reasoning:"The signed Charter provisions govern the circumstances.",
  orders:"The parties must comply.",
  remedies:"The parties must issue a formal correction.",
  publicly_listed:true,published_at:"2026-11-07T00:00:00.000Z",
};
const record: CourtCase = {
  id,identifier:"ITSC-000001",organizationId:id,
  applicantCountryId:anotherId,respondentCountryId:thirdId,
  claim:"A formal dispute over the rules of UNITY",
  legalBasis:"Canonical published Charter provisions",
  requestedRemedy:"A binding judicial determination",
  status:"decided",revision:7,filedAt:"2026-11-07",updatedAt:"2026-11-07",
};
const request = {
  id,case_id:id,judgment_id:id,party_country_id:anotherId,
  grounds:"The Secretary-General made a specific factual error about entry dates.",
  filed_at:"2026-11-07",
};

describe("TG14 immutable Court judgment and reconsideration",()=>{
  it("retains immutable judgments and rejects unknown versions/publication",()=>{
    expect(parseCourtJudgment(original).kind).toBe("original");
    expect(parseCourtJudgment({ ...original,kind:"revised",judgment_number:2 }).judgmentNumber).toBe(2);
    expect(()=>parseCourtJudgment({ ...original,kind:"appeal" })).toThrow();
    expect(()=>parseCourtJudgment({ ...original,judgment_number:0 })).toThrow();
    expect(()=>parseCourtJudgment({ ...original,publicly_listed:"yes" })).toThrow();
    expect(()=>parseCourtJudgment({ ...original,id:"invalid" })).toThrow();
    expect(parseCourtJudgment({
      ...original,publicly_listed:undefined,case_id:undefined,
      caseId:id,judgmentNumber:1,published_at:undefined,
      publishedAt:"2026-11-07",
    },true).publiclyListed).toBe(true);
  });

  it("permits each sovereign party at most one request per judgment, never an invented appeal",()=>{
    const judgment = parseCourtJudgment(original);
    const requests = [parseCourtReconsideration(request,new Map())];
    expect(mayRequestCourtReconsideration(record,judgment,anotherId,[])).toBe(true);
    expect(mayRequestCourtReconsideration(record,judgment,anotherId,requests)).toBe(false);
    expect(mayRequestCourtReconsideration(record,judgment,thirdId,requests)).toBe(true);
    expect(mayRequestCourtReconsideration(record,judgment,id,[])).toBe(false);
    expect(mayRequestCourtReconsideration({ ...record,status:"closed" },judgment,thirdId,[])).toBe(false);
    expect(mayRequestCourtReconsideration({ ...record,status:"reconsideration_requested" },judgment,thirdId,[])).toBe(true);
    expect(parseCourtReconsideration(request,new Map([[id,{decision:"rejected",reason:"Insufficient grounds"}]])).decision)
      .toBe("rejected");
  });

  it("only accepts matching nested durable operation receipts",()=>{
    const receipt={
      status:"succeeded",operationId:id,
      result:{ok:true,operationId:id,caseId:id,revision:9,status:"decided"},
    };
    expect(verifyCourtJudgmentReceipt(receipt,id)).toEqual({caseId:id,revision:9,status:"decided"});
    expect(()=>verifyCourtJudgmentReceipt({...receipt,status:"pending"},id)).toThrow();
    expect(()=>verifyCourtJudgmentReceipt({...receipt,operationId:anotherId},id)).toThrow();
    expect(()=>verifyCourtJudgmentReceipt({...receipt,result:{...receipt.result,revision:0}},id)).toThrow();
    expect(()=>verifyCourtJudgmentReceipt({...receipt,result:{...receipt.result,status:"approved"}},id)).toThrow();
  });

  it("authorizes only lawful Court state transitions; decided never means judgment_pending",()=>{
    expect(COURT_ALLOWED_ADVANCES.filed).toEqual(["preliminary_review"]);
    expect(COURT_ALLOWED_ADVANCES.preliminary_review).toEqual(["response_pending","proceedings"]);
    expect(COURT_ALLOWED_ADVANCES.proceedings).toEqual(["hearing","judgment_pending"]);
    expect(COURT_ALLOWED_ADVANCES.reconsideration_requested).toEqual([]);
    expect(COURT_ALLOWED_ADVANCES.decided).toEqual(["closed"]);
    expect(COURT_ALLOWED_ADVANCES.closed).toEqual(["archived"]);
    expect(COURT_ALLOWED_ADVANCES.archived).toEqual([]);
  });

  it("stores SG judgments, party requests and reviews as durable append-only records",()=>{
    const source=sql();
    for(const value of [
      "create table public.world_court_judgments",
      "create table public.world_court_reconsiderations",
      "create table public.world_court_reconsideration_decisions",
      "create table public.world_court_proceeding_actions",
      "world_court_judgments_immutable",
      "world_court_reconsiderations_immutable",
      "world_court_reconsideration_decisions_immutable",
      "world_court_proceeding_actions_immutable",
      "unique(judgment_id,party_country_id)",
      "prior_judgment_id uuid references public.world_court_judgments",
      "related_filing_ids uuid[]",
      "kind in ('original','revised')",
      "IMMUTABLE_COURT_RECORD",
      "grant select on public.world_court_proceeding_actions,public.world_court_judgments",
    ])expect(source).toContain(value);
    expect(source).not.toMatch(/grant (?:insert|update|delete|all) on public\.world_court_judgments[\s\S]*?to authenticated/i);
    expect(source).not.toMatch(/grant (?:insert|update|delete|all) on public\.world_court_judgments[\s\S]*?to service_role/i);
  });

  it("binds a current UNITY SG with effective term, CAS and existing R2/R3 authority",()=>{
    const source=sql();
    for(const value of [
      "private.world_current_court_judge_person",
      "term.started_at <= now()",
      "term.actual_end_at is null",
      "office.slug='secretary-general'",
      "t.holder_user_id=auth.uid()",
      "t.started_at<=now() and t.actual_end_at is null",
      "world.court.judge",
      "world.court.manage",
      "private.studio2_claim_operation",
      "private.studio2_complete_operation",
      "public.studio2_reconcile_operation",
      "private.v3_emit_domain_event",
      "VERSION_CONFLICT",
      "for update;",
      "for share;",
      "'world.court.judgment.publish','R3'",
      "'world.court.reconsideration.decide','R3'",
      "'world.court.reconsideration.request','R2'",
      "'world.court.advance','R2'",
    ])expect(source).toContain(value);
    expect(source).not.toContain("term.starts_at");
    expect(source).not.toContain("term.ends_at");
  });

  it("records reconsideration as a real Court filing, permits both parties' review, prevents premature revised publication",()=>{
    const source=sql();
    for(const value of [
      "'reconsideration_request',v_grounds",
      "v_case.status not in ('reconsideration_requested','reconsideration')",
      "p_decision='accepted' or v_case.status='reconsideration'",
      "and not exists (",
      "pending.judgment_id=v_previous.id",
      "where decided.request_id=pending.id",
      "RECONSIDERATION_PENDING",
      "v_case.status='decided' and p_target_state='closed'",
      "v_case.status='closed' and p_target_state='archived'",
    ])expect(source).toContain(value);
    expect(source).not.toContain("reconsideration_deadline");
    expect(source).not.toContain("'appeal'");
  });

  it("fails closed to all unpublished World material and never exposes pleadings publicly",()=>{
    const source=sql();
    expect(source).toContain("public.studio2_feature_enabled('terra_world_public',null) is true");
    expect(source).toContain('c.public_metadata @> \'{"listed":true}\'::jsonb');
    expect(source).toContain("j.publicly_listed=true");
    const reader=source.slice(source.indexOf("create function public.world_court_public_judgments_v1"),
      source.indexOf("revoke all on function public.world_court_public_judgments_v1"));
    for(const forbidden of ["filed_by_user_id","legal_basis","related_filing_ids","grounds","actor_user_id","auth.users"])
      expect(reader).not.toContain(forbidden);
    const updatedDocket=source.slice(source.indexOf("create or replace function public.world_court_public_docket_v1"));
    expect(updatedDocket).toContain("public.studio2_feature_enabled('terra_world_public',null) is true");
  });

  it("connects the actual route and verified read/mutation UI, with private cache isolation",()=>{
    const route=read("src/routes/world/court/$caseId/judgments.tsx");
    const ui=read("src/components/world/WorldCourtJudgments.tsx");
    const parent=read("src/components/world/WorldCourtWorkspace.tsx");
    const client=read("src/lib/world-court-judgments.ts");
    expect(route).toContain("<WorldPublicGate verifyOnMount>");
    expect(route).toContain("noindex,nofollow");
    expect(parent).toContain('to="/world/court/$caseId/judgments"');
    expect(ui).toContain("onAuthStateChange");
    expect(ui).toContain("authGeneration");
    expect(ui).toContain("gcTime:0");
    expect(ui).toContain("data.isPending || data.isFetching");
    expect(ui).toContain("CourtActionForm");
    expect(ui).toContain("crypto.randomUUID()");
    expect(ui).toContain("Retry same operation");
    for(const rpc of [
      "world_court_public_judgments_v1","world_court_judge_eligible_v1",
      "world_advance_court_case_v1","world_issue_court_judgment_v1",
      "world_request_court_reconsideration_v1","world_decide_court_reconsideration_v1",
    ])expect(client).toContain(rpc);
    expect(client).toContain('receipt?.status !== "succeeded"');
    expect(client).not.toMatch(/\.from\("world_court_(?:judgments|reconsiderations|reconsideration_decisions|cases)"\)[\s\S]{0,120}?\.(?:insert|upsert|update|delete)\(/);
  });
});
