import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261019112500_v3_s14_resolved_task_notification_invariant.sql",
  ),
  "utf8",
);
const reconciliationMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261019202636_v3_s14_resolved_task_delivery_reconciliation.sql",
  ),
  "utf8",
);
const archiveInvariantFixes = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261020130000_v3_s14_archive_invariant_forward_fixes.sql",
  ),
  "utf8",
);
const guardRehearsal = readFileSync(
  resolve(process.cwd(), ".github/scripts/v3-s14-archive-guard-rehearsal.sh"),
  "utf8",
);
const resurrectionRehearsal = readFileSync(
  resolve(process.cwd(), ".github/scripts/v3-s14-archive-task-resurrection-rehearsal.sh"),
  "utf8",
);

describe("System V3 S14 resolved Task notification invariant", () => {
  it("adopts a non-destructive S13 forward-fix contract", () => {
    expect(migration).toContain("'v3.s14.resolved-task-notification-invariant'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).toContain("false");
    expect(migration).not.toMatch(/\bdelete\s+from\b/i);
    expect(migration).not.toMatch(/\btruncate\b/i);
  });

  it("derives Inbox action state from canonical Task state in the generic synchronizer", () => {
    expect(migration).toContain(
      "create or replace function private.studio2_sync_task_notifications(",
    );
    expect(migration).toContain("requires_action = task.state <> 'resolved'");
    expect(migration).toContain(
      "notification.requires_action is distinct from (task.state <> 'resolved')",
    );
    expect(migration).toContain("where task.state <> 'resolved'");
    expect(migration).toContain("notification.requires_action = true");
    expect(migration).toContain("task.state <> 'resolved'");
  });

  it("projects Task resolution immediately into Inbox and still-deliverable push state", () => {
    expect(migration).toContain(
      "create or replace function private.v3_project_resolved_task_delivery_state()",
    );
    expect(migration).toContain("if new.state <> 'resolved' then");
    expect(migration).toContain("requires_action = false");
    expect(migration).toContain("status = 'suppressed'");
    expect(migration).toContain("delivery.status in ('pending', 'processing')");
    expect(migration).not.toContain("delivery.status in ('pending', 'processing', 'failed')");
    expect(migration).toContain("failed attempt is historical evidence");
    expect(migration).toContain(
      "after insert or update of state, resolved_at on public.studio2_organizer_tasks",
    );
  });

  it("retains historical notification rows rather than deleting resolved evidence", () => {
    expect(migration).toContain("update public.admin_notifications notification");
    expect(migration).toContain("update public.notification_deliveries delivery");
    expect(migration).not.toMatch(/delete\s+from\s+public\.admin_notifications/i);
    expect(migration).not.toMatch(/delete\s+from\s+public\.notification_deliveries/i);
  });

  it("reconciles pending/in-flight rows while preserving failed delivery evidence", () => {
    expect(reconciliationMigration).toContain(
      "'v3.s14.resolved-task-delivery-reconciliation'",
    );
    expect(reconciliationMigration).toContain(
      "create or replace function private.v3_reconcile_resolved_task_notifications(",
    );
    expect(reconciliationMigration).toContain(
      "update public.notification_deliveries delivery",
    );
    expect(reconciliationMigration).toContain("delivery.subject_id = task.id::text");
    expect(reconciliationMigration).toContain("delivery.status in ('pending', 'processing')");
    expect(reconciliationMigration).not.toContain(
      "delivery.status in ('pending', 'processing', 'failed')",
    );
    expect(reconciliationMigration).toContain("Failed attempts are immutable failure evidence");
    expect(reconciliationMigration).toContain("task.state = 'resolved'");
    expect(reconciliationMigration).not.toMatch(/delete\s+from\s+public\.notification_deliveries/i);
    expect(archiveInvariantFixes).toContain("delivery.status in ('pending', 'processing')");
    expect(archiveInvariantFixes).toContain("preserve failed attempts as immutable failure evidence");
  });

  it("proves the real task synchronizer creates the pre-Archive projections", () => {
    expect(guardRehearsal).toContain(
      "select private.studio2_sync_task_notifications('$EDITION_A'::uuid)",
    );
    expect(guardRehearsal).toContain(
      "canonical edition.blocker Inbox projection was not actionable before archive",
    );
    expect(guardRehearsal).toContain(
      "canonical edition.blocker delivery projection was not pending before archive",
    );
    expect(guardRehearsal).toContain(
      "archive left edition.blocker Inbox projection actionable",
    );
    expect(guardRehearsal).toContain(
      "archive left edition.blocker push delivery claimable",
    );
  });

  it("repairs poisoned current state without rewriting failed delivery history", () => {
    expect(resurrectionRehearsal).toContain(
      "Poison the resolved notification projection with one pending attempt and one retained failed attempt",
    );
    expect(resurrectionRehearsal).toContain("set resolved_at=null, requires_action=true");
    expect(resurrectionRehearsal).toContain("status='failed'");
    expect(resurrectionRehearsal).toContain("S14 preserved failed delivery evidence");
    expect(resurrectionRehearsal).toContain("status='suppressed'");
    expect(resurrectionRehearsal).toContain(
      "task resolution did not immediately repair poisoned Inbox action state",
    );
    expect(resurrectionRehearsal).toContain(
      "task resolution did not immediately suppress pending delivery state",
    );
    expect(resurrectionRehearsal).toContain(
      "task resolution rewrote historical failed-delivery evidence",
    );
    expect(resurrectionRehearsal).toContain(
      "generic notification sync projected a resolved archived task as actionable",
    );
    expect(resurrectionRehearsal).toContain(
      "generic notification sync enqueued a resolved archived task",
    );
  });
});
