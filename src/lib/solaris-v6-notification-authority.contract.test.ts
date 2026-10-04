import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Solaris V6 notification authority retirement", () => {
  it("rechecks canonical Organizer Task state before push delivery", () => {
    const dispatcher = source("supabase/functions/solaris-push-dispatch/index.ts");

    expect(dispatcher).toContain('"solaris_prepare_organizer_task_delivery"');
    expect(dispatcher).toContain('delivery.category === "organizer_tasks"');
    expect(dispatcher).toContain('task.state === "resolved" || task.resolved_at');
  });

  it("keeps notification read state separate from domain-owned task resolution", () => {
    const migration = source(
      "supabase/migrations/20261003003000_organisation_os_v5_task_notifications.sql",
    );

    expect(migration).toContain("resolved_at = task.resolved_at");
    expect(migration).toContain(
      "(to_jsonb(new) - array['read_at', 'resolved_at']::text[])",
    );
    expect(migration).toContain(
      "Task-backed notifications may only be marked seen; task state follows authoritative domain state.",
    );
  });

  it("uses canonical task count for Organizer work badges instead of unread notifications", () => {
    const chrome = source("src/components/admin/OrganizerV6MobileChrome.tsx");
    const shell = source("src/components/admin/AdminShell.tsx");

    expect(chrome).toContain("useOrganizerTaskCountV5");
    expect(chrome).toContain("unresolvedTaskCount");
    expect(chrome).not.toContain("unreadInboxCount");

    expect(shell).toContain("unreadInboxCount");
    expect(shell).toContain("Organizer notifications");
    expect(shell).not.toContain("useOrganizerTaskCountV5");
  });

  it("keeps local app attention explicitly non-authoritative", () => {
    const attention = source("src/lib/app-attention.ts");
    expect(attention).toContain(
      "Attention state is a UI enhancement, never a workflow dependency.",
    );
  });
});
