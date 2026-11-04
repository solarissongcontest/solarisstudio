import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (p: string) => readFileSync(resolve(process.cwd(),p),"utf8");
const ui = source("src/components/world/WorldAttendanceEditor.tsx");
const route = source("src/routes/world/sessions/$sessionId/attendance.tsx");
const api = source("src/lib/world-attendance-commands.ts");

describe("TG6 administrative attendance UX contract", () => {
  it("does not become a maintenance bypass or duplicate an existing session route", () => {
    expect(route).toContain("GLOBAL_MAINTENANCE_MODE");
    expect(route).toContain("throw notFound()");
    expect(route).toContain("noindex,nofollow");
    expect(route).toContain("createFileRoute(\"/world/sessions/$sessionId/attendance\")");
    expect(ui).toContain("loadWorldAttendanceManage(sessionId)");
    expect(ui).toContain("Return to this session");
  });

  it("surfaces only server-authoritative roll call and currently approved proxy options", () => {
    expect(ui).toContain('status === "proxy"');
    expect(ui).toContain('country.membershipStatus !== "member"');
    expect(ui).toContain("country.proxies.some((row) => row.id === proxyId)");
    expect(ui).toContain("country?.attendance?.revision ?? null");
    expect(ui).toContain("country.representationId");
    expect(ui).toContain("attendance.data?.status === \"open\"");
    expect(ui).toContain("attendance.data?.status === \"recessed\"");
    expect(ui).not.toContain("Date.now()");
    expect(ui).not.toContain("world_vote_eligibility");
    expect(ui).not.toContain("world_ballots");
    expect(api).toContain('client.rpc("world_session_attendance_manage_v1"');
  });

  it("protects ambiguous commit/retry and prevents competing mutations", () => {
    expect(ui).toContain("retry.current = action");
    expect(ui).toContain("if (knownRejection(failure))");
    expect(ui).toContain("retry.current = null");
    expect(ui).toContain("if (!country || busy || retry.current) return");
    expect(ui).toContain("if (!country || !mayRecord || busy || retry.current) return");
    expect(ui).toContain("Boolean(retry.current)");
    expect(ui).toContain("execute(retry.current!)");
    expect(ui).toContain("newWorldAttendanceOperation()");
    expect(api).toContain("p_idempotency_key: input.operation.key");
    expect(api).toContain("parseWorldAttendanceReceipt(data");
  });

  it("treats record mutations as reviewable official decisions, not automatic form writes", () => {
    expect(ui).toContain("Confirm official attendance record");
    expect(ui).toContain("Confirm and record");
    expect(ui).toContain("setPending({");
    expect(ui).toContain("run: () => recordWorldAttendance(args)");
    expect(ui).toContain("This attendance entry does not certify quorum or create a ballot.");
    expect(ui).toContain("Attendance editing is permitted only while the session is open or recessed.");
  });
});
