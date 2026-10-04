import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Organisation OS V5 acknowledgement ownership", () => {
  const organizerInbox = source("src/routes/_authenticated/admin/inbox.tsx");
  const adminOps = source("src/lib/admin-ops.ts");
  const official = source("src/lib/official-communications.ts");
  const recipientInbox = source("src/lib/studio2-recipient-inbox.ts");
  const taskNotifications = source(
    "supabase/migrations/20261003003000_organisation_os_v5_task_notifications.sql",
  );

  it("keeps generic Organizer Inbox delivery separate from domain work state", () => {
    expect(adminOps).toContain("read_at: string | null");
    expect(adminOps).toContain("resolved_at: string | null");
    expect(adminOps).toContain('resolution_mode: "manual" | "domain"');
    expect(organizerInbox).toContain("Mark all seen");
    expect(organizerInbox).toContain("Resolves automatically from the source workflow");
    expect(taskNotifications).toContain("Task-backed notifications may only be marked seen");
  });

  it("does not invent a competing generic acknowledgement truth in admin_notifications", () => {
    expect(adminOps).not.toContain("acknowledged_at");
    expect(adminOps).not.toContain("acknowledgement_required");
    expect(organizerInbox).not.toContain("Acknowledge notice");
    expect(taskNotifications).not.toContain("acknowledged_at");
  });

  it("keeps explicit acknowledgement in the Official Communications domain", () => {
    expect(official).toContain("acknowledgementRequired: boolean");
    expect(official).toContain("acknowledgedAt: string | null");
    expect(official).toContain(
      "'unread' | 'read' | 'acknowledgement_required' | 'acknowledged' | 'archived'",
    );
    expect(official).toContain(
      "if (notice.acknowledgementRequired) return 'acknowledgement_required'",
    );
    expect(recipientInbox).toContain("acknowledgement_required: boolean");
    expect(recipientInbox).toContain("acknowledged_at: string | null");
    expect(recipientInbox).toContain("noticeInboxState(notice, receipt)");
  });
});
