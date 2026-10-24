import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/lib/admin-ops.ts"), "utf8");

describe("V3 Organizer operational data scope", () => {
  it("bounds deadline, audit and notification projections", () => {
    expect(source).toContain("const ADMIN_DEADLINE_FIELDS");
    expect(source).toContain("const ADMIN_AUDIT_FIELDS");
    expect(source).toContain("const ADMIN_NOTIFICATION_FIELDS");
    expect(source).toContain(".select(ADMIN_DEADLINE_FIELDS)");
    expect(source).toContain(".select(ADMIN_AUDIT_FIELDS)");
    expect(source).toContain(".select(ADMIN_NOTIFICATION_FIELDS)");
    expect(source).not.toContain('.select("*")');
  });

  it("keeps operational reads bounded by existing deterministic limits", () => {
    expect(source).toContain('.order("due_at", { ascending: true })');
    expect(source).toContain('.order("created_at", { ascending: false })');
    expect(source).toContain(".limit(limit)");
    expect(source).toContain(".limit(50)");
    expect(source).toContain("refetchInterval: 120_000");
    expect(source).toContain("refetchIntervalInBackground: false");
  });

  it("binds individual notification mutations to the authenticated recipient", () => {
    const recipientScopes = source.match(/\.eq\("recipient_id", user\.id\)/g) ?? [];
    expect(recipientScopes.length).toBeGreaterThanOrEqual(4);
    expect(source).toContain('.select("id, recipient_id, read_at")');
    expect(source).toContain('.select("id, recipient_id, resolved_at")');
    expect(source).toContain("data.recipient_id !== user.id");
  });

  it("uses the mounted authenticated identity for mark-all instead of another auth fetch", () => {
    const markAllStart = source.indexOf("export function useMarkAllNotificationsRead()");
    const markAll = source.slice(markAllStart);
    expect(markAll).toContain("const user = useAuthenticatedUser()");
    expect(markAll).toContain('.eq("recipient_id", user.id)');
    expect(markAll).not.toContain("supabase.auth.getUser()");
  });

  it("keeps custom deadline writes exact-edition scoped and reconciled", () => {
    expect(source).toContain("payload.edition_id !== organizerEditionId");
    expect(source).toContain('.eq("edition_id", organizerEditionId)');
    expect(source).toContain("This reminder changed before your action was applied");
  });
});
