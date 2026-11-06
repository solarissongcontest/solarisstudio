import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canRecordCourtHearing, parseCourtHearing, parseCourtHearingEvent, parseCourtOrder,
} from "./world-court-proceedings";

const read=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8");
const sql=()=>read("supabase/migrations/20261107005200_v3_tg14_court_hearings_orders.sql");
const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const source={
 id,case_id:id,starts_at:"2026-11-08T12:00:00Z",ends_at:"2026-11-08T14:00:00Z",
 format:"video",location_note:"Private meeting instructions",status:"scheduled",
 held_summary:null,cancellation_reason:null,revision:1,
};
const order={
 id,case_id:id,order_number:1,title:"Protect proceedings",
 body:"Both countries must preserve their filed official documents.",
 effective_at:null,published_at:"2026-11-07T00:00:00Z",publicly_listed:false,
};

describe("TG14 Court hearings and orders",()=>{
 it("validates private hearing state and UTC dates without fabricating publication",()=>{
  const hearing=parseCourtHearing(source);
  expect(hearing.status).toBe("scheduled");
  expect(hearing.locationNote).toBe("Private meeting instructions");
  expect(canRecordCourtHearing(hearing,"proceedings",new Date("2026-11-08T11:59:59Z"))).toBe(false);
  expect(canRecordCourtHearing(hearing,"proceedings",new Date("2026-11-08T12:00:00Z"))).toBe(true);
  expect(canRecordCourtHearing(hearing,"closed",new Date("2026-11-09T00:00:00Z"))).toBe(false);
  expect(canRecordCourtHearing({...hearing,status:"cancelled"},"proceedings",new Date("2026-11-09"))).toBe(false);
  expect(()=>parseCourtHearing({...source,status:"assumed_held"})).toThrow();
  expect(()=>parseCourtHearing({...source,format:"encrypted_transmission"})).toThrow();
  expect(()=>parseCourtHearing({...source,revision:0})).toThrow();
 });
 it("keeps a complete immutable hearing event and published/public order distinction",()=>{
  expect(parseCourtHearingEvent({
   id,hearing_id:id,from_state:null,to_state:"scheduled",
   reason:null,case_revision:3,hearing_revision:1,recorded_at:"2026-11-07",
  }).toState).toBe("scheduled");
  expect(()=>parseCourtHearingEvent({
   id,hearing_id:id,from_state:"scheduled",to_state:"approved",
   reason:"A reason",case_revision:2,hearing_revision:2,recorded_at:"2026-11-07",
  })).toThrow();
  expect(parseCourtOrder(order).publiclyListed).toBe(false);
  expect(parseCourtOrder({
   ...order,publicly_listed:undefined,case_id:undefined,
   caseId:id,order_number:undefined,orderNumber:1,
   published_at:undefined,publishedAt:"2026-11-07",
  },true).publiclyListed).toBe(true);
  expect(()=>parseCourtOrder({...order,order_number:-1})).toThrow();
 });
 it("enforces RLS, revoke-first direct-write isolation and immutable hearing/order events",()=>{
  const body=sql();
  for(const expected of [
   "create table public.world_court_hearings",
   "create table public.world_court_hearing_events",
   "create table public.world_court_orders",
   "alter table public.world_court_hearings enable row level security",
   "alter table public.world_court_hearing_events enable row level security",
   "alter table public.world_court_orders enable row level security",
   "world_court_hearing_events_immutable",
   "world_court_orders_immutable",
   "IMMUTABLE_COURT_EVENT",
   "revoke all on public.world_court_hearings,public.world_court_hearing_events",
   "grant select on public.world_court_hearings,public.world_court_hearing_events",
   "using(exists(select 1 from public.world_court_cases c where c.id=case_id))",
  ])expect(body).toContain(expected);
  expect(body).not.toMatch(/grant (insert|update|delete|all) on public\.world_court_hearings[\s\S]*?to service_role/i);
 });
 it("uses case CAS + separately revisioned hearings, exact operation receipts and immutable events",()=>{
  const body=sql();
  for(const expected of [
   "public.world_schedule_court_hearing_v1",
   "public.world_decide_court_hearing_v1",
   "public.world_issue_court_order_v1",
   "private.studio2_claim_operation",
   "private.studio2_complete_operation",
   "public.studio2_reconcile_operation",
   "private.v3_emit_domain_event",
   "v_case.revision is distinct from p_expected_revision",
   "v_hearing.revision is distinct from p_expected_hearing_revision",
   "v_case.revision is distinct from p_expected_case_revision",
   "where id=p_case_id for update",
   "where id=p_hearing_id for update",
   "where h.case_id=p_case_id and h.status='scheduled'",
   "and h.starts_at < p_ends_at and h.ends_at > p_starts_at",
   "now()<v_hearing.starts_at",
   "'world.court.hearing.schedule','R2'",
   "'world.court.hearing.decide','R2'",
   "'world.court.order.publish','R3'",
  ])expect(body).toContain(expected);
 });
 it("allows signed orders only for current effective UNITY SG office and never for frontend role guess",()=>{
  const body=sql();
  for(const expected of [
   "private.world_current_court_judge_person(v_case.organization_id)",
   "office.slug='secretary-general'",
   "term.started_at<=now() and term.actual_end_at is null",
   "term.holder_user_id=auth.uid()",
   "'world.court.judge'",
   "'world.court.manage'",
   "for share;",
   "court_orders_private_read",
   "court_hearings_private_read",
  ])expect(body).toContain(expected);
  expect(body).not.toContain("term.starts_at");
  expect(body).not.toContain("term.ends_at");
 });
 it("exposes only published order text with canonical rollout protection, no private schedule",()=>{
  const body=sql();
  const start=body.indexOf("create function public.world_court_public_orders_v1");
  const end=body.indexOf("revoke all on function public.world_court_public_orders_v1",start);
  const projection=body.slice(start,end);
  expect(projection).toContain("ord.publicly_listed");
  expect(projection).toContain("public.studio2_feature_enabled('terra_world_public',null) is true");
  expect(projection).toContain('c.public_metadata @> \'{"listed":true}\'::jsonb');
  for(const forbidden of [
   "location_note","format","starts_at","scheduled_by_user_id","actor_user_id",
   "filed_by_user_id","join public.world_court_hearings",
  ])expect(projection).not.toContain(forbidden);
 });
 it("connects first-class page, authorized UI and actor-separated cached private reads",()=>{
  const route=read("src/routes/world/court/$caseId/proceedings.tsx");
  const adapter=read("src/lib/world-court-proceedings.ts");
  const ui=read("src/components/world/WorldCourtProceedings.tsx");
  const judgment=read("src/components/world/WorldCourtJudgments.tsx");
  expect(route).toContain("<WorldPublicGate verifyOnMount>");
  expect(route).toContain("noindex,nofollow");
  expect(judgment).toContain('to="/world/court/$caseId/proceedings"');
  expect(ui).toContain("onAuthStateChange");
  expect(ui).toContain("gcTime:0");
  expect(ui).toContain("query.isPending||query.isFetching");
  expect(ui).toContain("Retry original operation");
  expect(ui).toContain("crypto.randomUUID()");
  for(const rpc of [
   "world_court_public_orders_v1","world_schedule_court_hearing_v1",
   "world_decide_court_hearing_v1","world_issue_court_order_v1",
  ])expect(adapter).toContain(rpc);
  expect(adapter).toContain("verifyCourtJudgmentReceipt");
  expect(adapter).not.toMatch(/\.from\("world_court_(?:hearing_events|hearings|orders)"\)[\s\S]{0,120}?\.(?:insert|upsert|update|delete)\(/);
 });
});
