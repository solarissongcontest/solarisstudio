import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { v3DomainConsequence } from "./v3-domain-consequence-registry";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const runtime = source(
  "supabase/migrations/20261026194500_v3_s15_participation_consequences.sql",
);

describe("Worker 9 participation consequence runtime integration", () => {
  it("emits participation.changed from successful governed participation operations", () => {
    expect(runtime).toContain("new.status <> 'succeeded' or old.status = 'succeeded'");
    expect(runtime).toContain("'participation.status.confirmed'");
    expect(runtime).toContain("'participation.status.withdrawn'");
    expect(runtime).toContain("'participation.status.disqualified'");
    expect(runtime).toContain("'participation.changed'");
    expect(runtime).toContain("new.operation_id");
    expect(runtime).toContain("array['system.tasks']::text[]");
  });

  it("derives participation.blocker only from canonical state drift", () => {
    expect(runtime).toContain("private.studio2_participation_status_drifts");
    expect(runtime).toContain("private.studio2_reconcile_participation_blocker_tasks");
    expect(runtime).toContain("'participation.blocker'");
    expect(runtime).toContain("'participation_drift'");
    expect(runtime).toContain("on conflict (source_key) do update");
    expect(runtime).toContain("state = 'resolved'");
  });

  it("reuses the shared leased task-consumer path", () => {
    expect(runtime).toContain("private.v3_event_requires_shared_task_reconciliation");
    expect(runtime).toContain("'participation.changed'");
    expect(runtime).not.toContain("create table private.v3_domain_event_outbox");
    expect(runtime).not.toContain("create table private.v3_domain_event_consumer_receipts");
  });

  it("does not overclaim full consequence closure before declared projection effects are delivered", () => {
    const consequence = v3DomainConsequence("participation.changed");
    expect(consequence?.ownerDomain).toBe("participation");
    expect(consequence?.implementationState).toBe("declared");
    expect(consequence?.taskEffects).toContainEqual({
      effect: "re-evaluate",
      taskType: "participation.blocker",
    });
    expect(consequence?.realtimeEffects.length ?? 0).toBeGreaterThan(0);
  });
});
