import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  parseWorldManageMinutes,
  parseWorldMinutesReceipt,
  parseWorldPublicMinutes,
} from "./world-session-minutes";

const source = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");
const migration = source("supabase/migrations/20261104125000_v3_tg6_session_minutes.sql");
const ui = source("src/components/world/WorldSessionMinutesWorkspace.tsx");
const sessionId = "11111111-1111-4111-8111-111111111111";
const operationId = "22222222-2222-4222-8222-222222222222";

describe("TG6 official minutes public/private transport", () => {
  it("requires a published, matching, canonical public projection", () => {
    expect(parseWorldPublicMinutes(null, sessionId)).toBeNull();
    const published = {
      sessionId, status: "published", revision: 3,
      summary: "Decisions were recorded.", body: "Meeting concluded.",
      publishedAt: "2099-05-02T20:00:00Z",
    };
    expect(parseWorldPublicMinutes({
      ...published, editorUserId: "private-user", attendanceSnapshot: ["private"],
    }, sessionId)).toEqual(published);
    expect(() => parseWorldPublicMinutes({ ...published, status: "in_review" }, sessionId))
      .toThrow();
    expect(() => parseWorldPublicMinutes({ ...published, body: "" }, sessionId))
      .toThrow();
    expect(() => parseWorldPublicMinutes({ ...published, sessionId: operationId }, sessionId))
      .toThrow();
  });

  it("accepts missing private draft, rejects fabricated permission and published identity", () => {
    const base = {
      sessionId, title: "GUARD assembly", sessionStatus: "concluded",
      sessionRevision: 8, status: "missing", revision: null,
      summary: "", body: "", publishedAt: null,
      canManage: true, canPublish: false,
    };
    expect(parseWorldManageMinutes(base, sessionId)).toEqual(base);
    expect(() => parseWorldManageMinutes({ ...base, canManage: "true" }, sessionId))
      .toThrow();
    expect(() => parseWorldManageMinutes({ ...base, status: "published" }, sessionId))
      .toThrow();
    expect(() => parseWorldManageMinutes({ ...base, status: "draft", revision: null }, sessionId))
      .toThrow();
  });

  it("verifies server-issued operation receipts rather than trusting a bare success boolean", () => {
    const expected = { sessionId, operationId, status: "published" as const };
    const receipt = {
      status: "succeeded", operationId, replayed: false,
      result: { ok: true, operationId, sessionId, revision: 2, status: "published" },
    };
    expect(parseWorldMinutesReceipt(receipt, expected)).toEqual({
      sessionId, operationId, revision: 2, status: "published", replayed: false,
    });
    expect(() => parseWorldMinutesReceipt({ ok: true }, expected)).toThrow();
    expect(() => parseWorldMinutesReceipt({
      ...receipt, result: { ...receipt.result, status: "draft" },
    }, expected)).toThrow();
  });
});

describe("TG6 minutes authority and source invariants", () => {
  it("extends the session authority without creating new voters, tasks or follows", () => {
    expect(migration).toContain("references public.world_sessions(id)");
    expect(migration).toContain("create table public.world_session_minutes_revisions");
    expect(migration).toContain("private.world_minutes_integrity_guard_v1");
    expect(migration).toContain("MINUTES_HISTORY_IMMUTABLE");
    expect(migration).toContain("PUBLISHED_MINUTES_IMMUTABLE");
    expect(migration).not.toContain("create table public.world_vote");
    expect(migration).not.toContain("create table public.world_tasks");
    expect(migration).not.toContain("create table public.world_follows");
  });

  it("keeps unpublished content private at both SQL projection and UI boundaries", () => {
    const publicRead = migration.slice(
      migration.indexOf("create or replace function public.world_session_minutes_public_v1"),
      migration.indexOf("create or replace function public.world_session_minutes_manage_v1"),
    );
    expect(publicRead).toContain("m.status='published'");
    expect(publicRead).toContain("s.visibility='public'");
    expect(publicRead).toContain("o.public_visibility='public'");
    expect(publicRead).toContain("g.visibility='public'");
    expect(publicRead).not.toContain("actor_user_id");
    expect(publicRead).not.toContain("attendance_snapshot");
    expect(migration).toContain("alter table public.world_session_minutes enable row level security");
    expect(migration).toContain("alter table public.world_session_minutes_revisions enable row level security");
    expect(migration).toContain("from public,anon,authenticated,service_role");
    expect(ui).toContain("enabled: showManager");
  });

  it("prevents unreviewed publication and rechecks canonical session state", () => {
    const publishing = migration.slice(
      migration.indexOf("create or replace function public.world_publish_session_minutes_v1"),
      migration.indexOf("revoke all on function public.world_session_minutes_public_v1"),
    );
    expect(publishing).toContain("'world.minutes.publish'");
    expect(publishing).toContain("v_session.status<>'concluded'");
    expect(publishing).toContain("v_minutes.status<>'in_review'");
    expect(publishing).toContain("v_minutes.revision is distinct from p_expected_revision");
    expect(publishing).toContain("private.studio2_claim_operation");
    expect(publishing).toContain("private.studio2_complete_operation");
    expect(publishing).toContain("world.session.minutes.published");
    expect(publishing).toContain("attendance_snapshot");
    expect(publishing).toContain("agenda_snapshot");
    expect(publishing).not.toContain("world_vote_eligibility");
    expect(publishing).not.toContain("world_ballots");
  });

  it("never converts a browser button into official publication authority", () => {
    expect(ui).toContain("mutateWorldMinutes(args)");
    expect(ui).toContain("Retry exact operation");
    expect(ui).toContain("Confirm official operation");
    expect(ui).toContain("state.sessionStatus === \"concluded\"");
    expect(ui).not.toContain(".from(\"world_session_minutes\")");
  });
});
