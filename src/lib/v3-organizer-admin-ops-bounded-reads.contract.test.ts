import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const adminOps = readFileSync(new URL("./admin-ops.ts", import.meta.url), "utf8");

describe("Organizer V3 shared Admin Ops bounded-read contract", () => {
  it("keeps deadline, audit and notification reads on explicit projections", () => {
    expect(adminOps).toContain(
      '"id,edition_id,show_id,kind,label,due_at,completed_at,notes,created_at"',
    );
    expect(adminOps).toContain(
      '"id,actor_id,action,table_name,record_id,edition_id,country_id,before_data,after_data,created_at"',
    );
    expect(adminOps).toContain(
      '"id,recipient_id,severity,title,body,href,source_key,read_at,resolved_at,requires_action,resolution_mode,created_at"',
    );
    expect(adminOps).toContain(".select(ADMIN_DEADLINE_FIELDS)");
    expect(adminOps).toContain(".select(ADMIN_AUDIT_FIELDS)");
    expect(adminOps).toContain(".select(ADMIN_NOTIFICATION_FIELDS)");
    expect(adminOps).not.toContain('.select("*")');
  });

  it("preserves exact edition scope for custom deadline reads", () => {
    expect(adminOps).toContain('.eq("edition_id", normalizedEditionId)');
    expect(adminOps).toContain('queryKey: ["admin-deadlines", exactEditionId ?? "unscoped"]');
    expect(adminOps).toContain("organizerEditionId === requestedEditionId");
  });

  it("keeps audit and notification history bounded", () => {
    expect(adminOps).toContain('.from("admin_audit_log")');
    expect(adminOps).toContain('.order("created_at", { ascending: false })');
    expect(adminOps).toContain(".limit(limit)");

    expect(adminOps).toContain('.from("admin_notifications")');
    expect(adminOps).toContain('.eq("recipient_id", user.id)');
    expect(adminOps).toContain(".limit(50)");
  });

  it("does not increase notification refresh traffic", () => {
    expect(adminOps).toContain("refetchInterval: 120_000");
    expect(adminOps).toContain("refetchIntervalInBackground: false");
    expect(adminOps).toContain("refetchOnWindowFocus: false");
    expect(adminOps).not.toContain("setInterval(");
    expect(adminOps).not.toContain(".channel(");
  });
});