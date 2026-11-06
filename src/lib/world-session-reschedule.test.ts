import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  parseWorldSessionRescheduleReceipt,
  parseWorldSessionScheduleManage,
  utcInputFromInstant,
  utcInstantFromInput,
  validateWorldSessionReschedule,
} from "./world-session-reschedule";

const source = (path: string) => readFileSync(resolve(process.cwd(),path),"utf8");
const migration = source("supabase/migrations/20261104126000_v3_tg6_session_reschedule.sql");
const fixture = source("scripts/rehearse-v3-world-session-reschedule.sql");
const runner = source("scripts/rehearse-v3-world-session-reschedule.sh");
const ui = source("src/components/world/WorldSessionScheduleEditor.tsx");
const route = source("src/routes/world/sessions/$sessionId/schedule.tsx");
const sessionDetail = source("src/components/world/WorldSessionDetail.tsx");
const manager = migration.slice(
  migration.indexOf("create or replace function public.world_session_schedule_manage_v1"),
  migration.indexOf("create or replace function public.world_session_reschedule_v1"),
);
const command = migration.slice(
  migration.indexOf("create or replace function public.world_session_reschedule_v1"),
  migration.indexOf("revoke all on function public.world_session_schedule_manage_v1"),
);

const id = "11111111-1111-4111-8111-111111111111";
const org = "22222222-2222-4222-8222-222222222222";
const organ = "33333333-3333-4333-8333-333333333333";
const operationId = "44444444-4444-4444-8444-444444444444";
const startsAt = "2099-06-15T18:00:00.000Z";
const endsAt = "2099-06-15T19:30:00.000Z";
const privateRecord = {
  sessionId:id,organizationId:org,organId:organ,title:"GAG session",
  status:"scheduled",startsAt,endsAt,venueType:"external",
  venueLabel:"Official forum",externalUrl:"https://example.invalid/private",
  revision:7,
};

describe("TG6 scheduling UTC and private projection", () => {
  it("parses explicit UTC input without interpreting client local timezone", () => {
    expect(utcInstantFromInput("2099-06-15T18:00")).toBe(startsAt);
    expect(utcInputFromInstant("2099-06-15T20:00:00+02:00"))
      .toBe("2099-06-15T18:00");
    expect(() => utcInstantFromInput("2099-02-30T18:00")).toThrow();
    expect(() => utcInstantFromInput("2099-06-15 18:00")).toThrow();
    expect(() => utcInstantFromInput("2099-06-15T18:00+02:00")).toThrow();
  });

  it("accepts authorized private schedule fields but strips unrecognized data", () => {
    expect(parseWorldSessionScheduleManage({
      ...privateRecord,privateActorUserId:"secret",roles:["manage"],
    },id)).toEqual(privateRecord);
    expect(() => parseWorldSessionScheduleManage({
      ...privateRecord,sessionId:org,
    },id)).toThrow();
    expect(() => parseWorldSessionScheduleManage({
      ...privateRecord,externalUrl:"http://unsafe.invalid",
    },id)).toThrow();
    expect(() => parseWorldSessionScheduleManage({
      ...privateRecord,revision:0,
    },id)).toThrow();
  });

  it("rejects stale or nonsensical reschedule parameters before sending a request", () => {
    const operation = {
      id:operationId,key:"world.session.reschedule:"+operationId,
    };
    const input = {
      sessionId:id,startsAt,endsAt,venueType:"online" as const,
      venueLabel:"",externalUrl:"",expectedRevision:1,operation,
    };
    expect(validateWorldSessionReschedule(input)).toBeNull();
    expect(validateWorldSessionReschedule({
      ...input,endsAt:startsAt,
    })).toMatch(/later/);
    expect(validateWorldSessionReschedule({
      ...input,operation:{...operation,key:"wrong-key"},
    })).toMatch(/Reload/);
    expect(validateWorldSessionReschedule({
      ...input,externalUrl:"http://unsafe",
    })).toMatch(/HTTPS/);
  });

  it("verifies the canonical receipt and exact requested instants", () => {
    const expected = {sessionId:id,operationId,startsAt,endsAt};
    const actual = {
      status:"succeeded",operationId,replayed:true,
      result:{ok:true,operationId,sessionId:id,startsAt,endsAt,revision:8},
    };
    expect(parseWorldSessionRescheduleReceipt(actual,expected)).toEqual({
      sessionId:id,operationId,startsAt,endsAt,revision:8,replayed:true,
    });
    expect(() => parseWorldSessionRescheduleReceipt({
      ...actual,result:{...actual.result,endsAt:"2099-06-15T19:00:00.000Z"},
    },expected)).toThrow();
    expect(() => parseWorldSessionRescheduleReceipt({
      ...actual,operationId:org,
    },expected)).toThrow();
  });
});

describe("TG6 governed rescheduling source contract", () => {
  it("changes canonical session state only without creating a second session system", () => {
    expect(migration).toContain("update public.world_sessions");
    expect(migration).not.toContain("create table public.world_sessions");
    expect(migration).not.toContain("create table public.world_calendar");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).toContain("'v3.tg6.world-session-reschedule'");
  });

  it("resolves exact object-scoped institutional authorization before private data and mutation", () => {
    expect(manager).toContain("auth.uid() is null");
    expect(manager).toContain("'world.session.manage'");
    expect(manager).toContain("'session',v_session.id");
    expect(manager).toContain("'externalUrl',v_session.external_url");
    expect(command).toContain("auth.uid() is null");
    expect(command).toContain("'world.session.manage'");
    expect(command).toContain("'session',v_session.id");
    expect(migration).toContain("revoke all on function public.world_session_schedule_manage_v1");
    expect(migration).toContain("grant execute on function public.world_session_schedule_manage_v1");
  });

  it("claims an R2 operation once and performs CAS and time-sensitive state rules after replay", () => {
    const claim = command.indexOf("private.studio2_claim_operation");
    const replay = command.indexOf("if coalesce((v_claim->>'replayed')::boolean,false)");
    const cas = command.indexOf("v_session.revision is distinct from p_expected_revision");
    const state = command.indexOf("v_session.status <> 'scheduled'");
    expect(claim).toBeGreaterThan(0);
    expect(replay).toBeGreaterThan(claim);
    expect(cas).toBeGreaterThan(replay);
    expect(state).toBeGreaterThan(replay);
    expect(command).toContain("where id=p_session_id for update");
    expect(command).toContain("'world.session.reschedule','R2'");
    expect(command).toContain("private.studio2_complete_operation");
    expect(command).toContain("public.studio2_reconcile_operation");
    expect(command).toContain("private.v3_emit_domain_event");
  });

  it("never discloses a secret venue link through the event and preserves UTC ordering", () => {
    const event = command.slice(command.indexOf("perform private.v3_emit_domain_event"));
    expect(command).toContain("p_starts_at <= now()");
    expect(command).toContain("p_ends_at <= p_starts_at");
    expect(command).toContain("organization_row.status='active'");
    expect(command).toContain("organ_row.status='active'");
    expect(event).toContain("'world.session.rescheduled'");
    expect(event).toContain("previousStartsAt");
    expect(event).toContain("previousEndsAt");
    expect(event).not.toContain("'externalUrl'");
    expect(event).not.toContain("p_external_url");
  });

  it("has a rollback-only real-role rehearsal with authenticated replay after meeting open", () => {
    for (const marker of [
      "TG6_SCHEDULE_ANON_PRIVATE_READ_ALLOWED",
      "TG6_SCHEDULE_OUTSIDER_PRIVATE_READ_ALLOWED",
      "TG6_SCHEDULE_OUTSIDER_WRITE_ALLOWED",
      "TG6_SCHEDULE_NON_HTTPS_URL_ALLOWED",
      "TG6_SCHEDULE_RECEIPT_INVALID",
      "TG6_SCHEDULE_PRIVATE_URL_PUBLIC_LEAK",
      "TG6_SCHEDULE_REPLAY_UNSTABLE",
      "TG6_SCHEDULE_STALE_CAS_ALLOWED",
      "TG6_SCHEDULE_CLOSED_REPLAY_LOST",
      "TG6_SCHEDULE_OPEN_SESSION_MUTABLE",
      "TG6_SCHEDULE_FIXTURES_PERSISTED",
    ]) expect(fixture).toContain(marker);
    expect(fixture).toContain("set local role anon");
    expect(fixture).toContain("set local role authenticated");
    expect(fixture).toContain("\nrollback;");
    expect(runner).toContain("supabase status -o env");
    expect(runner).toContain("Refusing hosted Supabase API");
    expect(runner).toContain("Refusing hosted database URI");
    expect(runner).not.toMatch(/\$\{?DATABASE_URL\b/);
  });

  it("exposes reviewed schedule interactions on a maintenance-gated route", () => {
    expect(route).toContain("GLOBAL_MAINTENANCE_MODE");
    expect(route).toContain("notFound()");
    expect(route).toContain("AppShell");
    expect(sessionDetail).toContain("Edit schedule");
    expect(ui).toContain("type=\"datetime-local\"");
    expect(ui).toContain("utcInstantFromInput");
    expect(ui).toContain("Review official rescheduling");
    expect(ui).toContain("Confirm official change");
    expect(ui).toContain("Retry the exact operation");
    expect(ui).toContain('["world","session","schedule-manage",actorId,sessionId]');
    expect(ui).toContain("removeQueries");
    expect(ui).not.toContain(".from(\"world_sessions\")");
  });
});
