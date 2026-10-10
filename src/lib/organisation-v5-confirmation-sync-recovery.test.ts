import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Organisation OS V5 confirmation sync recovery", () => {
  const migration = source(
    "supabase/migrations/20261003215000_organisation_os_v5_confirmation_sync_recovery.sql",
  );
  const sync = source("src/integrations/confirmations/sync.functions.ts");

  it("uses integration_events as canonical confirmation-sync outcome truth", () => {
    expect(sync).toContain('service: "confirmations"');
    expect(sync).toContain('event_type: "confirmation.snapshot.synced"');
    expect(sync).toContain('status: error ? "failed" : "completed"');
    expect(sync).toContain("remote_id: payload.id");
    expect(migration).toContain("private.studio2_reconcile_confirmation_sync_tasks");
    expect(migration).toContain("event.service = 'confirmations'");
    expect(migration).toContain(
      "event.event_type = 'confirmation.snapshot.synced'",
    );
    expect(migration).toContain(
      "order by event.remote_id, event.updated_at desc, event.id desc",
    );
  });

  it("opens one high-priority recovery Task for the latest failed submission sync", () => {
    expect(migration).toContain("'confirmation_sync'");
    expect(migration).toContain("'confirmation-sync:' || latest.remote_id");
    expect(migration).toContain("'confirmation.sync.recover'");
    expect(migration).toContain("'confirmation.manage'");
    expect(migration).toContain("'high'");
    expect(migration).toContain("'Confirmation sync needs recovery'");
    expect(migration).toContain("'/confirmations/admin/sync'");
    expect(migration).toContain("where latest.status = 'failed'");
    expect(migration).toContain("on conflict (source_key) do update");
  });

  it("resolves recovery automatically after a later successful sync", () => {
    expect(migration).toContain("task.source_kind = 'confirmation_sync'");
    expect(migration).toContain("latest.remote_id = task.source_id");
    expect(migration).toContain("latest.status = 'failed'");
    expect(migration).toContain("state = 'resolved'");
    expect(migration).toContain("resolved_at = coalesce(task.resolved_at, now())");
    expect(migration).toContain("'resolvedWhen', 'latest status = completed'");
  });

  it("projects recovery into Inbox and push without creating a second truth", () => {
    expect(migration).toContain(
      "perform private.studio2_sync_task_notifications(null)",
    );
    expect(migration).toContain(
      "perform private.studio2_prune_stale_task_notifications(null)",
    );
    expect(migration).toContain(
      "after insert or update of status, last_error, updated_at",
    );
  });

  it("backfills pre-existing unresolved failures", () => {
    expect(migration).toContain(
      "select private.studio2_reconcile_confirmation_sync_tasks();",
    );
  });
});
