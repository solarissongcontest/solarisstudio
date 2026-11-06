import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ETHICS_RECOMMENDATIONS, canSubmitEthicsFinding, parseEthicsFinding,
  verifyEthicsFindingReceipt, type EthicsFindingsWorkspace,
} from "./world-ethics-findings";

const read=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8");
const sql=()=>read("supabase/migrations/20261107003150_v3_tg13_ethics_findings.sql");
const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const other="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const finding={
  id,case_id:id,findings_text:"The investigation verified the reported chronology.",
  reasoning_text:"Contemporaneous evidence substantiates the committee's factual conclusions.",
  recommendation_kind:"warning",recommendation_text:"An authorized body should review whether to warn the country.",
  prepared_at:"2026-11-07T00:00:00Z",case_revision:3,evidence_count:2,
};
const caseRecord={
  id,organizationId:id,organId:id,reportingCountryId:id,
  subjectCountryId:id,subjectPersonId:null,
  allegation:"A detailed institutional allegation.",state:"assigned" as const,
  revision:2,openedAt:"2026-11-07",
};

describe("TG13 Ethics Committee findings and nonbinding recommendations",()=>{
  it("strictly parses recommendation, identity and evidence provenance",()=>{
    expect(ETHICS_RECOMMENDATIONS).toContain("court_referral");
    expect(parseEthicsFinding(finding).recommendation).toBe("warning");
    expect(parseEthicsFinding(finding).evidenceCount).toBe(2);
    expect(parseEthicsFinding({
      ...finding,recommendation_kind:"none",recommendation_text:null,
    }).recommendationText).toBeNull();
    expect(()=>parseEthicsFinding({...finding,recommendation_kind:"sanction_executed"})).toThrow();
    expect(()=>parseEthicsFinding({...finding,recommendation_text:null})).toThrow();
    expect(()=>parseEthicsFinding({...finding,evidence_count:-1})).toThrow();
    expect(()=>parseEthicsFinding({...finding,id:"not-a-uuid"})).toThrow();
  });
  it("never mistakes unassigned users or a previous finding for new authoring authority",()=>{
    const workspace:EthicsFindingsWorkspace={
      record:caseRecord,finding:null,canPrepare:true,
    };
    expect(canSubmitEthicsFinding(workspace)).toBe(true);
    expect(canSubmitEthicsFinding({...workspace,canPrepare:false})).toBe(false);
    expect(canSubmitEthicsFinding({...workspace,finding:parseEthicsFinding(finding)})).toBe(false);
    expect(canSubmitEthicsFinding({...workspace,record:{...caseRecord,state:"filed"}})).toBe(false);
    expect(canSubmitEthicsFinding({...workspace,record:null})).toBe(false);
  });
  it("rejects forged, flat and cross-operation receipts",()=>{
    const ok={
      status:"succeeded",operationId:id,
      result:{ok:true,operationId:id,caseId:id,findingId:other,
        state:"findings_prepared",revision:3},
    };
    expect(verifyEthicsFindingReceipt(ok,id)).toEqual({
      caseId:id,findingId:other,revision:3,state:"findings_prepared",
    });
    expect(()=>verifyEthicsFindingReceipt({...ok,status:"pending"},id)).toThrow();
    expect(()=>verifyEthicsFindingReceipt({...ok,operationId:other},id)).toThrow();
    expect(()=>verifyEthicsFindingReceipt({...ok,result:{...ok.result,state:"sanctioned"}},id)).toThrow();
    expect(()=>verifyEthicsFindingReceipt({...ok,result:{...ok.result,revision:0}},id)).toThrow();
  });
  it("keeps durable findings private/immutable with no parallel sanction writer",()=>{
    const source=sql();
    for(const value of [
      "create table public.world_ethics_findings",
      "create trigger world_ethics_findings_no_rewrite",
      "private.world_ethics_evidence_immutable()",
      "alter table public.world_ethics_findings enable row level security",
      "revoke all on public.world_ethics_findings from public,anon,authenticated,service_role",
      "grant select on public.world_ethics_findings to authenticated,service_role",
      "private.world_ethics_can_read_case(case_id)",
      "case_id uuid not null unique",
      "operation_id uuid not null unique",
      "world_ethics_findings_recommendation_check",
    ])expect(source).toContain(value);
    expect(source).not.toMatch(/grant (?:insert|update|delete|all) on public\.world_ethics_findings/i);
    expect(source).not.toContain("insert into public.world_institutional_actions");
    expect(source).not.toContain("insert into public.world_organizations");
    expect(source).not.toContain("world_execute_expulsion");
  });
  it("enforces current assigned person, explicit scope, CASE lock, R2 receipt and immutable history",()=>{
    const source=sql();
    for(const value of [
      "public.world_ethics_can_prepare_findings_v1",
      "public.world_prepare_ethics_findings_v1",
      "m.user_id=auth.uid()",
      "m.started_at<=now()",
      "m.ended_at is null",
      "a.ended_at is null",
      "for share of a,m",
      "'world.ethics.findings.record'",
      "where id=p_case_id for update",
      "VERSION_CONFLICT",
      "v_case.status not in ('assigned','under_review')",
      "private.studio2_claim_operation",
      "private.studio2_complete_operation",
      "public.studio2_reconcile_operation",
      "'world.ethics.findings.record','R2'",
      "insert into public.world_ethics_case_history",
      "private.v3_emit_domain_event",
      "'world.ethics.findings_prepared'",
    ])expect(source).toContain(value);
    const event=source.slice(source.indexOf("perform private.v3_emit_domain_event("),
      source.indexOf("v_result:=jsonb_build_object(",source.indexOf("perform private.v3_emit_domain_event(")));
    for(const privateField of ["v_findings","v_reasoning","v_recommendation","p_recommendation_kind"])
      expect(event).not.toContain(privateField);
  });
  it("supports exact idempotent replay after case transitions to findings_prepared",()=>{
    const source=sql();
    const body=source.slice(source.indexOf("create function public.world_prepare_ethics_findings_v1"),
      source.indexOf("end $prepare$;"));
    const claim=body.indexOf("private.studio2_claim_operation(");
    const replay=body.indexOf("coalesce((v_claim->>'replayed')::boolean,false)");
    const state=body.indexOf("v_case.status not in ('assigned','under_review')");
    expect(claim).toBeGreaterThan(0);
    expect(replay).toBeGreaterThan(claim);
    expect(state).toBeGreaterThan(replay);
    expect(body).not.toContain("or not public.world_ethics_can_prepare_findings_v1(p_case_id)");
    expect(body).toContain("join public.world_ethics_committee_memberships m");
    expect(body).toContain("m.user_id=auth.uid()");
  });
  it("provides a rollback-only and genuinely local-only SQL security rehearsal",()=>{
    const runner=read("scripts/rehearse-v3-world-ethics-findings.sh");
    const fixture=read("scripts/rehearse-v3-world-ethics-findings.sql");
    expect(runner).toContain("supabase status -o json");
    expect(runner).toContain("new URL(api)");
    expect(runner).toContain("new URL(db)");
    expect(runner).toContain("a.hostname");
    expect(runner).toContain("d.search || d.hash");
    expect(runner).not.toContain("eval ");
    expect(runner).not.toContain("DATABASE_URL");
    expect(fixture.trim()).toMatch(/rollback;$/);
    expect(fixture).toContain("TG13_ETHICS_FINDINGS_RLS_NOT_ENABLED");
    expect(fixture).toContain("TG13_ETHICS_FINDINGS_RAW_DML_OR_ANON_READ");
    expect(fixture).toContain("TG13_ETHICS_IMMUTABLE_TRIGGER_MISSING");
  });
  it("requires private actor revalidation, validated route and exact-operation retry UI",()=>{
    const client=read("src/lib/world-ethics-findings.ts");
    const ui=read("src/components/world/WorldEthicsFindings.tsx");
    const route=read("src/routes/world/ethics/$caseId/findings.tsx");
    const parent=read("src/components/world/WorldEthicsWorkspace.tsx");
    expect(client).toContain("await assertTg13CurrentActor(expectedActorId)");
    expect(client).toContain('world_ethics_can_prepare_findings_v1');
    expect(client).toContain('world_prepare_ethics_findings_v1');
    expect(client).toContain('envelope?.status!=="succeeded"');
    expect(route).toContain("<WorldPublicGate verifyOnMount>");
    expect(route).toContain("noindex,nofollow");
    expect(parent).toContain('to="/world/ethics/$caseId/findings"');
    expect(ui).toContain("useTg13PrivateActor()");
    expect(ui).toContain('queryKey: ["world","ethics","findings",actor.userId,actor.epoch,caseId]');
    expect(ui).toContain("setDraftScope(actorScope)");
    expect(ui).toContain("opScope.current!==activeScope.current");
    expect(ui).toContain("Retry original operation");
    expect(ui).toContain("retry.current.input,retry.current.op");
    expect(ui).toContain("mutation.isPending");
    expect(ui).toContain("crypto.randomUUID()");
    expect(ui).not.toContain("service_role");
    expect(client).not.toMatch(/\.from\("world_ethics_findings"\)[\s\S]{0,100}?\.(?:insert|update|upsert|delete)\(/);
  });
});
