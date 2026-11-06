import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  canRespondToGuardInquiry, canReviewGuardInquiry, guardInquiryError,
  parseGuardInquiry, parseGuardInquiryHistory,
  parseGuardInquiryResponse, parseGuardInquiryReview,
  type GuardInquiry,
} from "./world-guard-inquiry";

const read=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8");
const sql=()=>read("supabase/migrations/20261107003200_v3_tg13_guard_inquiry.sql");
const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const other="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const now=Date.parse("2026-11-07T12:00:00Z");
const record:GuardInquiry={
  id,organizationId:id,targetCountryId:other,
  allegation:"A sourced allegation of GUARD non-compliance by a member country.",
  sourceReference:"GUARD Charter Article 7",
  responseDueAt:"2026-11-07T13:00:00Z",
  openedAt:"2026-11-07T11:00:00Z",
  updatedAt:"2026-11-07T11:00:00Z",
  status:"awaiting_response",revision:1,
};
const raw={
  id,organization_id:id,target_country_id:other,
  allegation:record.allegation,source_reference:record.sourceReference,
  response_due_at:record.responseDueAt,opened_at:record.openedAt,
  updated_at:record.updatedAt,status:record.status,revision:1,
};

describe("WORLD-08 TG13 governed GUARD noncompliance inquiry",()=>{
  it("never accepts unverified identifiers, dates, revisions or invented sanction statuses",()=>{
    expect(parseGuardInquiry(raw)).toEqual(record);
    expect(()=>parseGuardInquiry({...raw,id:"not-an-id"})).toThrow();
    expect(()=>parseGuardInquiry({...raw,revision:0})).toThrow();
    expect(()=>parseGuardInquiry({...raw,response_due_at:"not-a-date"})).toThrow();
    expect(()=>parseGuardInquiry({...raw,status:"expelled"})).toThrow();
    expect(()=>parseGuardInquiryResponse({
      inquiry_id:id,response_text:"An official country reply.",
      submitted_at:"2026-11-07",was_late:false,
    }).wasLate).toBe(false);
    expect(()=>parseGuardInquiryResponse({
      inquiry_id:id,response_text:"Reply",submitted_at:"2026-11-07",was_late:"no",
    })).toThrow();
    expect(parseGuardInquiryHistory({
      id,action:"opened",from_state:null,to_state:"awaiting_response",
      revision:1,recorded_at:"2026-11-07T11:00:00Z",
    }).toState).toBe("awaiting_response");
  });

  it("validates immutable review as recommendation only, never a sanction mutation",()=>{
    const base={
      inquiry_id:id,decision_kind:"recommend_action",
      proposed_action:"voting_suspension",
      findings:"The Chairperson recommends further constitutionally governed review.",
      reviewed_at:"2026-11-07T14:00:00Z",
    };
    expect(parseGuardInquiryReview(base).proposedAction).toBe("voting_suspension");
    expect(parseGuardInquiryReview({
      ...base,decision_kind:"no_action",proposed_action:null,
    }).decisionKind).toBe("no_action");
    expect(()=>parseGuardInquiryReview({...base,proposed_action:"expulsion"})).toThrow();
    expect(()=>parseGuardInquiryReview({...base,decision_kind:"no_action"})).toThrow();
    expect(()=>parseGuardInquiryReview({...base,decision_kind:"recommend_action",proposed_action:null})).toThrow();
  });

  it("responding requires actual current country ownership, never deadline-based sanction",()=>{
    expect(canRespondToGuardInquiry(record,other)).toBe(true);
    expect(canRespondToGuardInquiry(record,id)).toBe(false);
    expect(canRespondToGuardInquiry(record,null)).toBe(false);
    expect(canRespondToGuardInquiry({...record,status:"response_received"},other)).toBe(false);
    // Lateness alone does not strip the country's opportunity to respond.
    expect(canRespondToGuardInquiry({...record,responseDueAt:"2026-11-07T11:00:00Z"},other)).toBe(true);
  });

  it("a Chairperson cannot review an unanswered case before the response deadline",()=>{
    expect(canReviewGuardInquiry(record,true,now)).toBe(false);
    expect(canReviewGuardInquiry(record,true,Date.parse(record.responseDueAt))).toBe(true);
    expect(canReviewGuardInquiry(record,false,Date.parse(record.responseDueAt))).toBe(false);
    expect(canReviewGuardInquiry(record,true,Number.NaN)).toBe(false);
    expect(canReviewGuardInquiry({...record,status:"response_received"},true,now)).toBe(true);
    expect(canReviewGuardInquiry({...record,status:"reviewed"},true,now)).toBe(false);
    expect(guardInquiryError({message:"RESPONSE_WINDOW_OPEN"})).toMatch(/window/);
    expect(guardInquiryError({message:"VERSION_CONFLICT"})).toMatch(/Refresh/);
    expect(guardInquiryError({message:"AUTHORIZATION"})).toMatch(/authority/);
  });

  it("requires actual effective GUARD Chairperson term plus scoped S7 capability",()=>{
    const s=sql();
    for(const match of [
      "private.world_current_guard_inquiry_chair",
      "org.slug='guard'",
      "office.slug='chairperson'",
      "term.started_at<=now()",
      "term.actual_end_at is null",
      "term.holder_user_id=auth.uid()",
      "public.world_access_allowed(p_capability,p_organization_id",
      "world.inquiry.open",
      "world.inquiry.review",
      "world.inquiry.respond",
      "world_guard_inquiry_can_open_v1",
      "world_guard_inquiry_can_review_v1",
      "for share of term;",
      "private.studio2_claim_operation",
      "private.studio2_complete_operation",
      "public.studio2_reconcile_operation",
      "private.v3_emit_domain_event",
      "v_inquiry.revision is distinct from p_expected_revision",
      "for update;",
    ])expect(s).toContain(match);
    expect(s).not.toContain("term.starts_at");
    expect(s).not.toContain("term.ends_at");
    expect(s).not.toMatch(/office\.slug='deputy-chairperson'/);
  });

  it("replays an identical successful opening after its original deadline passes",()=>{
    const source=sql();
    const command=source.slice(
      source.indexOf("create function public.world_open_guard_inquiry_v1"),
      source.indexOf("create function public.world_respond_guard_inquiry_v1"),
    );
    const replay=command.indexOf("if coalesce((v_claim->>'replayed')::boolean,false)");
    const deadline=command.indexOf("if p_response_due_at <= now()");
    expect(replay).toBeGreaterThan(0);
    expect(deadline).toBeGreaterThan(replay);
    expect(command.slice(0,replay)).not.toContain("or p_response_due_at <= now()");
    expect(command).toContain("public.studio2_reconcile_operation(v_op)");
  });

  it("protects private rows with RLS, row locks, immutable history and no API raw writes",()=>{
    const s=sql();
    for(const marker of [
      "alter table public.world_guard_inquiries enable row level security",
      "alter table public.world_guard_inquiry_responses enable row level security",
      "alter table public.world_guard_inquiry_reviews enable row level security",
      "alter table public.world_guard_inquiry_history enable row level security",
      "grant select on public.world_guard_inquiries,public.world_guard_inquiry_responses",
      "world_guard_inquiry_private_read",
      "ca.user_id=auth.uid() and ca.status='active'",
      "world_guard_inquiry_responses_immutable",
      "world_guard_inquiry_reviews_immutable",
      "world_guard_inquiry_history_immutable",
      "IMMUTABLE_GUARD_INQUIRY_RECORD",
      "operation_id uuid not null unique",
      "unique(inquiry_id,revision)",
    ])expect(s).toContain(marker);
    expect(s).not.toMatch(/grant\s+(?:all|insert|update|delete)\s+on\s+public\.world_guard_inquiries[^;]*to\s+authenticated/i);
    expect(s).not.toMatch(/grant\s+(?:all|insert|update|delete)\s+on\s+public\.world_guard_inquiries[^;]*to\s+service_role/i);
    expect(s).not.toMatch(/create policy [^;]*to anon/i);
  });

  it("reviews recommendations without executing punishment, expulsion or membership mutation",()=>{
    const s=sql();
    expect(s).toContain("decision_kind in ('no_action','recommend_action')");
    expect(s).toContain("'warning','censure','voting_suspension','assistance_freeze'");
    expect(s).toContain("'recommendationOnly',true");
    expect(s).toContain("now()<v_inquiry.response_due_at");
    expect(s).toContain("v_late:=now()>v_inquiry.response_due_at");
    expect(s).toContain("status='reviewed'");
    expect(s).not.toContain("update public.world_organization_memberships");
    expect(s).not.toContain("insert into public.world_institutional_actions");
    expect(s).not.toContain("world_execute_expulsion_v1");
    expect(s).not.toContain("world.membership.execute_expulsion");
  });

  it("exposes an authenticated, rollout-verified, usable private workflow",()=>{
    const client=read("src/lib/world-guard-inquiry.ts");
    const ui=read("src/components/world/WorldGuardInquiryWorkspace.tsx");
    const route=read("src/routes/world/guard/inquiries/index.tsx");
    expect(route).toContain("<WorldPublicGate verifyOnMount>");
    expect(route).toContain("noindex,nofollow");
    expect(client).toContain("supabase.auth.getUser()");
    expect(client).toContain('envelope?.status!=="succeeded"');
    expect(client).toContain("result.operationId!==op.operationId");
    expect(client).toContain("receipt.recommendationOnly!==true");
    for(const name of [
      "world_open_guard_inquiry_v1",
      "world_respond_guard_inquiry_v1",
      "world_review_guard_inquiry_v1",
    ])expect(client).toContain(name);
    expect(ui).toContain("crypto.randomUUID()");
    expect(ui).toContain("Retry same operation");
    expect(ui).toContain("onAuthStateChange");
    expect(ui).toContain("gcTime:0");
    expect(ui).toContain("Only a live Chairperson");
    expect(ui).toContain("No suspension, freeze, sanction or expulsion was executed");
    expect(ui).toContain("Official sanctions and expulsion require independent");
    for(const file of [client,ui])
      expect(file).not.toMatch(/\.from\("world_guard_inquiries"\)[\s\S]{0,150}?\.(?:insert|upsert|update|delete)\(/);
  });
});
