import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const route = source("src/routes/_authenticated/admin/system-operations.tsx");

describe("Organizer V3 Delivery & Jobs operational presentation", () => {
  it("leads with operator meaning instead of raw delivery and scheduler diagnostics", () => {
    expect(route).toContain("deliveryOperationalSummary(delivery)");
    expect(route).toContain("deliveryStageLabel(delivery)");
    expect(route).toContain("jobDisplayName(job.name)");
    expect(route).toContain("jobOperationalSummary(job)");
    expect(route).toContain("jobRecoveryLabel(job)");

    expect(route).toContain("Technical delivery details");
    expect(route).toContain("Technical job details");
    expect(route).toContain("Scheduler name");
    expect(route).toContain("Cron schedule");
    expect(route).toContain("Last scheduler message");

    expect(route).not.toContain(
      '<p className="font-semibold">{job.name}</p>\n                          <p className="mt-1 text-xs text-muted-foreground">\n                            {job.schedule}',
    );
    expect(route).not.toContain(
      '<p className="mt-2 max-w-3xl text-xs leading-5 text-amber-100/80">\n                            {delivery.error}\n                          </p>',
    );
    expect(route).not.toContain(
      '<p className="mt-3 break-words text-xs leading-5 text-muted-foreground">\n                          {job.lastMessage}\n                        </p>',
    );
  });

  it("explains canonical operational states without inventing a second job truth", () => {
    expect(route).toContain("Scheduled work is stopped. An operator must restore this job");
    expect(route).toContain("Repeated failures need attention. Solaris keeps the failure visible as an Organizer task");
    expect(route).toContain("Solaris will retry automatically on the next scheduled run");
    expect(route).toContain("The latest completed run succeeded and no recovery is currently required");

    expect(route).toContain("This notification was conclusively marked failed");
    expect(route).toContain("Do not replay it manually while the bounded queue lease is active");
    expect(route).toContain("Delivery was intentionally suppressed by policy");
  });

  it("preserves the protected runtime projection and server-authoritative retry contract", () => {
    expect(route).toContain('rpc("admin_system_runtime_health"');
    expect(route).toContain('rpc(\n        "admin_retry_failed_notification_delivery"');
    expect(route).toContain('command: "system.push.retry_failed"');
    expect(route).toContain('riskClass: "R1"');
    expect(route).toContain("retryIdentities.current.get(deliveryId)");
    expect(route).toContain("retryIdentities.current.set(deliveryId, identity)");
    expect(route).toContain("resolveSolarisV6OperationRecovery(error");
    expect(route).toContain("stableOperationIdentity: true");
    expect(route).toContain("recovery.keepOperationOpen");
    expect(route).not.toContain("supabase.from(");
  });

  it("keeps automatic recovery and manual retry semantics distinct", () => {
    expect(route).toContain('delivery.status === "failed"');
    expect(route).toContain("Retry failed delivery");
    expect(route).toContain("Retry same operation");
    expect(route).toContain("processing rows are recovered by the");
    expect(route).toContain("bounded queue lease instead of being replayed manually");
    expect(route).toContain('case "scheduled_retry":');
    expect(route).toContain('case "scheduled_retry_dead_letter":');
    expect(route).toContain('case "operator_intervention":');
  });
});
