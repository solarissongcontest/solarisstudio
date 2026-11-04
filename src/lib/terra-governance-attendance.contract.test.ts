import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = source("supabase/migrations/20261104124000_v3_tg6_session_attendance_rollcall.sql");
const tg6 = source("supabase/migrations/20261104114000_v3_tg6_world_session_agenda.sql");
const proxy = source("supabase/migrations/20261104123000_v3_tg6_proxy_request_decision.sql");
const rehearsal = source("scripts/rehearse-v3-world-attendance.sql");
const runner = source("scripts/rehearse-v3-world-attendance.sh");
const writer = migration.slice(
  migration.indexOf("create or replace function public.world_record_session_attendance_v1"),
  migration.indexOf("create or replace function public.world_session_attendance_manage_v1"),
);
const manager = migration.slice(
  migration.indexOf("create or replace function public.world_session_attendance_manage_v1"),
  migration.indexOf("create or replace function public.world_my_session_attendance_v1"),
);

describe("TG6 governed institutional roll-call", () => {
  it("extends the canonical TG6 session and proxy tables without replacing either owner", () => {
    expect(tg6).toContain("create table public.world_sessions");
    expect(proxy).toContain("create or replace function public.world_approve_proxy_v1");
    expect(migration).toContain("create table public.world_session_attendance");
    expect(migration).toContain("primary key (session_id,country_id)");
    expect(migration).toContain("references public.world_sessions(id)");
    expect(migration).toContain("references public.world_organization_representations(id)");
    expect(migration).toContain("references public.world_representation_proxies(id)");
    expect(migration).toContain("status in ('present','absent','proxy')");
    expect(migration).toContain("(status = 'proxy') = (proxy_id is not null)");
    expect(migration).toContain("revision bigint not null default 1");
    expect(migration).toContain("'forward_fix_only'");
  });

  it("adds explicit capability-based, organ-scoped roll-call management", () => {
    expect(migration).toContain("'world.session.attendance.manage'");
    expect(migration).toContain("insert into public.world_office_capabilities");
    expect(migration).toContain("('guard','chairperson')");
    expect(migration).toContain("('unity','secretary-general')");
    expect(writer).toContain("'world.session.attendance.manage'");
    expect(writer).toContain("v_session.organization_id,null,v_session.organ_id");
    expect(writer).toContain("'session',v_session.id");
    expect(writer).toContain("for update");
    expect(writer).toContain("for share");
    expect(migration).toContain("alter table public.world_session_attendance enable row level security");
    expect(migration).toContain("revoke all on table public.world_session_attendance");
    expect(migration).not.toMatch(/grant\s+(all|insert|update|delete)\s+on\s+(table\s+)?public\.world_session_attendance[\s\S]{0,160}\bto\s+(anon|authenticated)/i);
  });

  it("validates country, current representative, membership, session and server-time approved proxy", () => {
    expect(writer).toContain("v_rep.organization_id <> v_session.organization_id");
    expect(writer).toContain("v_rep.country_id <> p_country_id");
    expect(writer).toContain("v_rep.ends_at is not null");
    expect(writer).toContain("v_session.status not in ('open','recessed')");
    expect(writer).toContain("v_session.ends_at <= now()");
    expect(writer).toContain("member_row.ended_at is null");
    expect(writer).toContain("v_proxy.representation_id");
    expect(writer).toContain("v_proxy.revoked_at is not null");
    expect(writer).toContain("v_proxy.session_id <> p_session_id");
    expect(writer).toContain("private.world_proxy_is_effective(");
    expect(writer).toContain("member_row.status='member'");
    expect(writer).not.toContain("world_vote_eligibility");
    expect(writer).not.toContain("world_ballots");
  });

  it("claims an R2 operation before mutable state checks and requires per-country revision CAS", () => {
    const claim = writer.indexOf("private.studio2_claim_operation");
    const replay = writer.indexOf("if coalesce((v_claim->>'replayed')::boolean,false)");
    const mutableState = writer.indexOf("if v_session.status not in ('open','recessed')");
    const cas = writer.indexOf("v_existing.revision is distinct from p_expected_revision");
    expect(claim).toBeGreaterThan(0);
    expect(replay).toBeGreaterThan(claim);
    expect(mutableState).toBeGreaterThan(replay);
    expect(cas).toBeGreaterThan(replay);
    expect(writer).toContain("'world.session.attendance.record'");
    expect(writer).toContain("world.session.attendance.recorded");
    expect(writer).toContain("private.studio2_complete_operation");
    expect(writer).toContain("public.studio2_reconcile_operation");
    expect(writer).toContain("v_existing.revision+1");
  });

  it("exposes at most 100 private country rows and five active proxy options per country", () => {
    expect(manager).toContain("'world.session.attendance.manage'");
    expect(manager).toContain("return null;");
    expect(manager).toContain("limit 100");
    expect(manager).toContain("limit 5");
    expect(manager).toContain("p.revoked_at is null");
    expect(manager).toContain("private.world_proxy_is_effective(");
    expect(manager).toContain("member_row.ended_at is null");
    expect(manager).toContain("membership_row.status in ('member','observer','associate')");
    expect(manager).not.toContain("auth.users");
    expect(manager).not.toContain("'proxyUserId'");
    expect(manager).not.toContain("world_vote_eligibility");
  });

  it("keeps the controller's personal attendance limited to its own active country", () => {
    const mine = migration.slice(
      migration.indexOf("create or replace function public.world_my_session_attendance_v1"),
      migration.indexOf("revoke all on function public.world_record_session_attendance_v1"),
    );
    expect(mine).not.toContain("account.country_id=p_country_id");
    expect(mine).toContain("country_account.country_id=p_country_id");
    expect(mine).toContain("country_account.user_id=auth.uid()");
    expect(mine).toContain("country_account.status='active'");
    expect(mine).toContain("attendance.country_id=p_country_id");
    expect(mine).not.toContain("auth.users");
  });

  it("has real-role rollback-only negatives for unauthorized access, scope and replay", () => {
    for (const marker of [
      "TG6_ATTENDANCE_ANON_WRITE_ALLOWED",
      "TG6_ATTENDANCE_OUTSIDER_WRITE_ALLOWED",
      "TG6_ATTENDANCE_OUTSIDER_PRIVATE_READ_ALLOWED",
      "TG6_ATTENDANCE_RAW_TABLE_SELECT_ALLOWED",
      "TG6_ATTENDANCE_CROSS_ORG_REP_ALLOWED",
      "TG6_ATTENDANCE_PROXY_WITHOUT_ID_ALLOWED",
      "TG6_ATTENDANCE_INITIAL_RECEIPT_INVALID",
      "TG6_ATTENDANCE_RECEIPT_REPLAY_UNSTABLE",
      "TG6_ATTENDANCE_MISSING_CAS_ALLOWED",
      "TG6_ATTENDANCE_PROXY_RECEIPT_INVALID",
      "TG6_ATTENDANCE_REVOKED_PROXY_REUSED",
      "TG6_ATTENDANCE_ABSENT_REVISION_INCORRECT",
      "TG6_ATTENDANCE_CONTROLLER_OWN_READ_LOST",
      "TG6_ATTENDANCE_CONTROLLER_MANAGE_LEAK",
    ]) expect(rehearsal).toContain(marker);
    expect(rehearsal).toContain("set local role anon");
    expect(rehearsal).toContain("set local role authenticated");
    expect(rehearsal).toContain("\nrollback;");
    expect(runner).toContain("supabase status -o env");
    expect(runner).toContain("Refusing hosted database URI");
    expect(runner).toContain("Refusing hosted Supabase API");
  });
});
